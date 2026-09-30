#!/usr/bin/env node
/*
 * IntMap · ci-gates — RUN THE DECLARED GATES ON N MACHINES INSTEAD OF ONE  (#R771)
 *
 *  ══ WHAT THIS IS FOR ═══════════════════════════════════════════════════════════════════════════
 *  MEASURED on CI run 35172906802 (2026-09-17): the «Static checks» job took 570 s, and it took that
 *  long because it ran 28 gates ONE AFTER ANOTHER on one runner. The distribution is not flat — it
 *  is a long tail with four heads:
 *
 *      check:histfill 176 s · check:assets 115 s · check:bordercoast 79 s · npm run build 42 s
 *      check:i18n 39 s · check:static 26 s · check:docs 14 s · check:borderdetail 12 s
 *      …and the other twenty gates together came to 21 s.
 *
 *  So the job was never «28 gates long». It was «histfill long, plus everything else». Splitting the
 *  set across machines costs NO coverage — every declared gate still runs, exactly once — and takes
 *  the wall clock down to the longest single gate. That is the whole reason this file exists: it is
 *  the one lever on this job that does not trade quality for time (AGENTS.md §5.0).
 *
 *  ⚠ AND THE BIGGER HALF IS NOT THE GREEN RUN. MEASURED on the same page of history: the two FAILING
 *  CI runs took 11.9 and 12.2 minutes. A red gate that sits behind twenty-seven green ones costs a
 *  full twelve minutes before the author learns anything at all, and the fix costs twelve more. With
 *  the set split and `fail-fast: false`, every shard reports, so one pass tells you every gate that
 *  is red rather than the first one — which is what turns «a few hours» back into one round trip.
 *
 *  ══ ⚠ THE SET IS DISCOVERED, NOT LISTED ════════════════════════════════════════════════════════
 *  The gates are `package.json`'s `check:*` scripts — the same universe `check:agents`' gate-lists
 *  rule and `scripts/test-budget.mjs` already treat as canonical (memory:
 *  intmap-gate-universe-is-declared-gates). A hand-written list of «which gate runs on which shard»
 *  is the embedded-list shape .agents/rules/no-ad-hoc-hardcoding.md §1 names first: it would go
 *  stale the day a gate is added, and — worse — the new gate would simply never run while CI stayed
 *  green. `--check` therefore asserts that the planned bins are a PARTITION of the declared set:
 *  every gate exactly once, nothing invented.
 *
 *  ══ ⚠ «NEEDS THE BUILD» IS DISCOVERED TOO ══════════════════════════════════════════════════════
 *  Two gates read what `npm run build` produced rather than what the tree contains. They are found
 *  by reading each gate's own script for a literal path to `dist/` or `.perf/build-report.json` —
 *  not by a list here. They are then packed as ONE task together with the build, so the build is
 *  paid once instead of once per shard.
 *    MEASURED 2026-09-17: the discovery finds exactly {check:perf, check:assets}, which is the pair
 *    the workflow ran after `npm run build` when this was a single job.
 *    EXPIRES: the day a gate reads the build output by a path this regex cannot see. That failure is
 *    loud, not silent — the gate runs without dist/ and fails on its own terms — and the fix is to
 *    let the path be visible, not to add the gate to a list here.
 *
 *  ══ THE COSTS ARE A MEASUREMENT WITH A DATE ════════════════════════════════════════════════════
 *  `.github/gate-cost.json` holds seconds per gate and says which run it was measured on. It only
 *  decides BALANCE, never membership: a gate missing from it still runs (it is planned at the
 *  median cost). Refresh it with `--update` from the timings the shards print.
 *
 *  ══ USAGE ══════════════════════════════════════════════════════════════════════════════════════
 *      node scripts/ci-gates.mjs --plan [--of 3]     show the bins and their predicted seconds
 *      node scripts/ci-gates.mjs --shard 2/3         run bin 2 of 3 (what CI calls)
 *      node scripts/ci-gates.mjs --check             the bins partition the declared gates
 *      node scripts/ci-gates.mjs --planned           the gate names a shard run would reach (JSON)
 *      node scripts/ci-gates.mjs --needs-build 2/3   `true` / `false`: does this shard read the build?
 *      node scripts/ci-gates.mjs --update <f…>       fold measured timings back into the ledger
 *
 *  ══ (ci-build-once) IN CI THE BUILD IS HANDED IN, NOT MADE HERE ═══════════════════════════════
 *  One CI run used to build the site up to four times: the gate shard holding the build task, and
 *  every browser shard (playwright.config.js' webServer). ci.yml now builds ONCE, in its `build` job,
 *  and hands `dist/` + `.perf/build-report.json` to whoever reads them as an artifact. So:
 *    · IM_PREBUILT_DIST=1 says «the build was made elsewhere and placed here». The build task then
 *      does NOT run `npm run build`; it checks the two files are present and runs its gates.
 *    · ⚠ IM_PREBUILT_DIST=1 WITH THE FILES MISSING IS A FAILURE, NOT A CUE TO BUILD. A silent
 *      fallback would bring the second build back exactly when the artifact transfer broke, and
 *      the run would stay green while measuring a different dist/ than the browser shards served.
 *    · Unset (a developer's machine, `npm test`, a throw-away tree) — the build runs here as before.
 *  `--needs-build` is what lets the workflow download the artifact on only the shard that reads it
 *  (it is ~755 MB); it answers from the same plan `--shard` executes, so the two cannot disagree.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
/* (gate-parity-and-shards) THE DISCOVERY IS SHARED WITH `npm test`, NOT WRITTEN HERE. The universe,
   the «reads the build» test and the packing live in scripts/gate-universe.mjs, which
   scripts/test-parallel.mjs imports too — so the gates CI runs and the gates a local run runs are
   one answer, not two lists that happen to agree today. */
import { ROOT, BUILD, declaredGates, scriptFileOf, needsBuild, medianOf, lpt } from './gate-universe.mjs';

const LEDGER = join(ROOT, '.github', 'gate-cost.json');

function ledger() {
  if (!existsSync(LEDGER)) return { seconds: {} };
  try { return JSON.parse(readFileSync(LEDGER, 'utf8')); } catch { return { seconds: {} }; }
}

/** Unknown gates are planned at the median of what IS known — never at 0, which would pile every
    new gate onto one shard, and never at the max, which would spread them at the others' expense. */
function costTable() {
  const secs = ledger().seconds || {};
  return { secs, median: medianOf(Object.values(secs), 5) };
}

/**
 * The tasks to pack. Every declared gate appears in exactly one task; the build-dependent gates are
 * one task WITH the build, so no two shards pay for a build.
 */
function tasks() {
  const { secs, median } = costTable();
  const cost = (g) => (Number.isFinite(secs[g]) ? secs[g] : median);
  const gates = declaredGates();
  const built = gates.filter(needsBuild);
  const plain = gates.filter((g) => !built.includes(g));

  const out = plain.map((g) => ({ gates: [g], build: false, cost: cost(g) }));
  if (built.length) {
    out.push({
      gates: built,
      build: true,
      cost: (Number.isFinite(secs[BUILD]) ? secs[BUILD] : median) + built.reduce((a, g) => a + cost(g), 0),
    });
  }
  return out;
}

/**
 * Longest-processing-time-first greedy. Deterministic: costs descending, ties broken by the first
 * gate's name, so the same tree always produces the same plan on every runner.
 */
function plan(of) {
  return lpt(tasks(), of, (t) => t.cost, (t) => t.gates[0]).map((b) => ({ tasks: b.items, cost: b.cost }));
}

/** The two files the build-reading gates read (READS_BUILD in scripts/gate-universe.mjs names both). */
const BUILT_FILES = [join('dist', 'index.html'), join('.perf', 'build-report.json')];

/** (ci-build-once) `null` when this process should build; otherwise the prebuilt files that are missing. */
function prebuiltMissing() {
  if (process.env.IM_PREBUILT_DIST !== '1') return null;
  return BUILT_FILES.filter((f) => !existsSync(join(ROOT, f)));
}

/** Parse «i/n» (both 1-based) or exit with the usage line. */
function shardSpec(spec, flagName) {
  const m = String(spec).match(/^(\d+)\/(\d+)$/);
  if (!m) { console.error(`usage: ${flagName} <i>/<n>`); process.exit(1); }
  const [i, of] = [+m[1], +m[2]];
  if (i < 1 || i > of) { console.error(`shard ${i} is outside 1..${of}`); process.exit(1); }
  return [i, of];
}

function run(cmd, args) {
  const t0 = Date.now();
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' });
  return (Date.now() - t0) / 1000;
}

/* ── COMMANDS ───────────────────────────────────────────────────────────────────────────────── */

function cmdPlan(of) {
  const bins = plan(of);
  const l = ledger();
  console.log(`IntMap · ${declaredGates().length} 個の宣言済みゲートを ${of} 台へ`);
  console.log(`  コストの実測: ${l.measured || '(未記録)'}\n`);
  bins.forEach((b, i) => {
    console.log(`  shard ${i + 1}/${of}   予測 ${Math.round(b.cost)}s`);
    for (const t of b.tasks) console.log(`      ${t.build ? 'npm run build + ' : ''}${t.gates.join(' ')}`);
  });
  const worst = Math.max(...bins.map((b) => b.cost));
  const total = bins.reduce((a, b) => a + b.cost, 0);
  console.log(`\n  直列なら ${Math.round(total)}s · この分割なら最長 ${Math.round(worst)}s`);
}

/**
 * ⚠ ONE SHARD RUNS EVERY GATE IN ITS BIN EVEN AFTER ONE OF THEM FAILS, and reports them together.
 * Stopping at the first red is what made a failing run cost a second full round trip to discover
 * the second red (see the header). The process still exits non-zero — the shard is not green — it
 * simply refuses to hide the gates behind the failure.
 */
function cmdShard(spec, timingsOut) {
  const [i, of] = shardSpec(spec, '--shard');

  const bin = plan(of)[i - 1];
  const measured = {};
  const failed = [];
  console.log(`── shard ${i}/${of} · ${bin.tasks.reduce((a, t) => a + t.gates.length, 0)} gates ──`);

  for (const t of bin.tasks) {
    /* The build is the one thing whose failure DOES stop its task: the gates behind it would be
       measuring a dist/ that was never written, and «failed because nothing was built» is not a
       finding about those gates. The other tasks in this bin still run. */
    if (t.build) {
      const missing = prebuiltMissing();
      if (missing === null) {
        try { measured[BUILD] = run('npm', ['run', 'build']); } catch { failed.push(BUILD); continue; }
      } else if (missing.length) {
        console.error(`\n✗ IM_PREBUILT_DIST=1 だが build の成果物が無い: ${missing.join(', ')}`
          + '（CI の build ジョブの artifact が届いていない。ここでは build し直さない）');
        failed.push(BUILD);
        continue;
      } else {
        console.log(`\n── ${BUILD} ── 省略: IM_PREBUILT_DIST=1、${BUILT_FILES.join(' と ')} は CI の build ジョブが作ったもの`);
      }
    }
    for (const g of t.gates) {
      console.log(`\n── ${g} ──`);
      try { measured[g] = run('npm', ['run', g]); } catch { failed.push(g); }
    }
  }

  console.log('\n── measured seconds ──');
  for (const [k, v] of Object.entries(measured)) console.log(`  ${k}  ${v.toFixed(1)}s`);
  if (timingsOut) writeFileSync(timingsOut, JSON.stringify(measured, null, 2));

  if (failed.length) {
    console.error(`\n✗ shard ${i}/${of} で落ちたゲート ${failed.length} 件: ${failed.join(', ')}`);
    process.exit(1);
  }
  console.log(`\n✓ shard ${i}/${of} · ${Object.keys(measured).length} 件すべて緑`);
}

/**
 * ⚠ THE INVARIANT THAT MATTERS: the bins are a partition of the declared set. A gate that is added
 * and lands nowhere would leave CI green while nothing checked it — the failure this whole file is
 * built to make impossible.
 */
function cmdCheck(of) {
  const declared = declaredGates();
  const bins = plan(of);
  const planned = bins.flatMap((b) => b.tasks.flatMap((t) => t.gates));
  const problems = [];

  const missing = declared.filter((g) => !planned.includes(g));
  if (missing.length) problems.push(`どの shard にも入っていないゲート: ${missing.join(', ')}`);

  const extra = planned.filter((g) => !declared.includes(g));
  if (extra.length) problems.push(`宣言されていないのに走るもの: ${extra.join(', ')}`);

  const dupes = planned.filter((g, k) => planned.indexOf(g) !== k);
  if (dupes.length) problems.push(`2つ以上の shard で走るゲート: ${[...new Set(dupes)].join(', ')}`);

  for (const g of declared) if (!scriptFileOf(g)) problems.push(`${g} が scripts/*.mjs を指していない`);

  /* The build-dependent gates must all sit in ONE task, or a shard would run a gate against a dist/
     that nobody built. */
  const built = declared.filter(needsBuild);
  if (!built.length) problems.push('build の出力を読むゲートが1つも見つからない（発見の regex が当たらなくなった）');
  const binsOfBuilt = bins.map((b, i) => (b.tasks.some((t) => t.build) ? i : -1)).filter((i) => i >= 0);
  if (binsOfBuilt.length > 1) problems.push('build が2つ以上の shard に分かれている');

  const stale = Object.keys(ledger().seconds || {}).filter((k) => k !== BUILD && !declared.includes(k));
  if (stale.length) problems.push(`.github/gate-cost.json に、もう存在しないゲートがある: ${stale.join(', ')}`);

  if (problems.length) { for (const p of problems) console.error('✗ ' + p); process.exit(1); }
  console.log(`✓ ${declared.length} 個の宣言済みゲートが ${of} 台にちょうど1回ずつ（build を読む ${built.length} 個は同じ shard）`);
}

function cmdUpdate(files) {
  const l = ledger();
  l.seconds = l.seconds || {};
  for (const f of files) Object.assign(l.seconds, JSON.parse(readFileSync(f, 'utf8')));
  for (const k of Object.keys(l.seconds)) l.seconds[k] = Math.round(l.seconds[k] * 10) / 10;
  l.measured = `${new Date().toISOString().slice(0, 10)} · ${files.length} shard`;
  writeFileSync(LEDGER, JSON.stringify(l, null, 2) + '\n');
  console.log(`✓ .github/gate-cost.json を更新（${Object.keys(l.seconds).length} 件）`);
}

/* ── MAIN ───────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const of = +(flag('--of') || 3);

if (argv.includes('--needs-build')) {
  const [i, of] = shardSpec(flag('--needs-build'), '--needs-build');
  console.log(String(plan(of)[i - 1].tasks.some((t) => t.build)));
} else if (argv.includes('--planned')) console.log(JSON.stringify(plan(of).flatMap((b) => b.tasks.flatMap((t) => t.gates))));
else if (argv.includes('--shard')) cmdShard(flag('--shard'), flag('--timings'));
else if (argv.includes('--check')) cmdCheck(of);
else if (argv.includes('--update')) cmdUpdate(argv.slice(argv.indexOf('--update') + 1));
else cmdPlan(of);
