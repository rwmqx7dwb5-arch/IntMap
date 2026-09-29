#!/usr/bin/env node
/*
 * IntMap · checks-shards — SPLIT THE NODE REGRESSION SUITE BY MEASURED SECONDS, NOT BY FILE COUNT
 *   (gate-parity-and-shards)
 *
 *  ══ WHAT THIS IS FOR ═══════════════════════════════════════════════════════════════════════════
 *  The «Regression i/3» jobs ran `node --test --test-shard=i/3`, and node's shard is a FILE-COUNT
 *  split: file k goes to shard (k mod 3). MEASURED on CI run 36513330956 (main 43c1a6a8, 2026-09-29):
 *
 *      Regression 1/3  11m16s   ← r403 (499 s), r500 (393 s), r623 (371 s) and r399 (128 s) all here
 *      Regression 2/3   8m32s
 *      Regression 3/3   4m52s
 *
 *  The suite's files run from well under a second to several minutes, so «the same number of files»
 *  is not «the same amount of work», and the slowest shard is the whole job's wall clock. The same
 *  defect was found and fixed for the browser suite in #R195 (scripts/shard-plan.mjs) and for the
 *  declared gates in #R771 (scripts/ci-gates.mjs); this is the third instance and it is fixed the same
 *  way: measured seconds per FILE, packed longest-first (scripts/gate-universe.mjs lpt, the packing
 *  ci-gates.mjs uses).
 *
 *  ══ ⚠ THE SET IS THE RUNNER'S GLOB, NOT A LIST ═════════════════════════════════════════════════
 *  The files are what scripts/test-checks.mjs's GLOB matches today (fs.globSync — the matcher node's
 *  own `--test` uses), so a file added tomorrow is scheduled the day it lands. The ledger decides
 *  BALANCE, never membership: a file it does not know is charged the median (medianOf, the rule
 *  ci-gates.mjs applies to gates), and a ledger row for a file that no longer exists is ignored by
 *  the plan and reported by `--check`.
 *
 *  ══ THE LEDGER IS A MEASUREMENT WITH A DATE ════════════════════════════════════════════════════
 *  .github/checks-cost.json holds seconds per test file and says which run they came from. Each CI
 *  shard writes the seconds it measured (scripts/checks-timing-reporter.mjs, the sum of the file's
 *  top-level test durations) and uploads them; `--update <files…>` folds them back in.
 *  ⚠ A FILE THAT WAITS ON tests/helpers/gate-lock.mjs IS CHARGED ITS WAIT. The mutation tests
 *  serialise on one lock per checkout, so a file's measured time includes the time it queued behind
 *  another lock-holder on the same runner. That over-states the lock-holders — which is the safe
 *  direction: it spreads them apart, and apart is also where they stop waiting on each other.
 *
 *  ══ USAGE ══════════════════════════════════════════════════════════════════════════════════════
 *      node scripts/checks-shards.mjs --plan [--of 3]       the bins and their predicted seconds
 *      node scripts/checks-shards.mjs --files 2/3           the files of bin 2 of 3, one per line
 *      node scripts/checks-shards.mjs --check [--of 3]      the bins partition the suite
 *      node scripts/checks-shards.mjs --update <json…>      fold measured seconds into the ledger
 *  CI does not call this directly: `npm run test:checks -- --test-shard=i/n` does (scripts/test-checks.mjs).
 */
import { readFileSync, writeFileSync, existsSync, globSync } from 'node:fs';
import { join, relative, isAbsolute } from 'node:path';
import { ROOT, medianOf, lpt } from './gate-universe.mjs';

export const LEDGER = join(ROOT, '.github', 'checks-cost.json');

const posix = (p) => p.split('\\').join('/');

/** The files a glob selects, as node's test runner would find them, keyed repository-relative. */
export function testFiles(glob, { root = ROOT } = {}) {
  const found = globSync(glob, { cwd: root });
  return [...new Set(found.map((f) => posix(isAbsolute(f) ? relative(root, f) || f : f)))].sort();
}

export function readLedger(path = LEDGER) {
  if (!existsSync(path)) return { seconds: {} };
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { seconds: {} }; }
}

/**
 * Pack `files` onto `of` bins. Deterministic (ties by path), and a partition by construction: every
 * file goes to exactly one bin. `seconds` is the ledger's table.
 */
export function planShards(files, of, seconds = readLedger().seconds || {}) {
  const known = files.map((f) => seconds[f]).filter((n) => Number.isFinite(n));
  const median = medianOf(known.length ? known : Object.values(seconds), 1);
  const cost = (f) => (Number.isFinite(seconds[f]) ? seconds[f] : median);
  const bins = lpt(files, of, cost, (f) => f).map((b) => ({ files: b.items.slice().sort(), cost: b.cost }));
  return { bins, median, unmeasured: files.filter((f) => !Number.isFinite(seconds[f])) };
}

export function parseShard(spec) {
  const m = /^(\d+)\/(\d+)$/.exec(String(spec || ''));
  if (!m) return null;
  const [i, of] = [+m[1], +m[2]];
  return i >= 1 && i <= of ? { i, of } : null;
}

/** Merge measured fragments into the ledger object (pure, so it can be tested without a file). */
export function foldTimings(ledger, fragments, stamp) {
  const out = { ...ledger, seconds: { ...(ledger.seconds || {}) } };
  for (const frag of fragments) for (const [f, s] of Object.entries(frag)) if (Number.isFinite(s)) out.seconds[f] = Math.round(s * 10) / 10;
  out.seconds = Object.fromEntries(Object.entries(out.seconds).sort(([a], [b]) => a.localeCompare(b)));
  out.measured = stamp;
  return out;
}

/* ── CLI ────────────────────────────────────────────────────────────────────────────────────── */
async function cli(argv) {
  const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
  const of = +(flag('--of') || 3);
  const { GLOB } = await import('./test-checks.mjs');  /* dynamic: that file imports this one */
  const files = testFiles(process.env.IM_CHECKS_GLOB || GLOB);

  if (argv.includes('--update')) {
    const frags = argv.slice(argv.indexOf('--update') + 1).map((f) => JSON.parse(readFileSync(f, 'utf8')));
    const next = foldTimings(readLedger(), frags, `${new Date().toISOString().slice(0, 10)} · ${frags.length} shard`);
    writeFileSync(LEDGER, JSON.stringify(next, null, 2) + '\n');
    console.log(`✓ .github/checks-cost.json を更新（${Object.keys(next.seconds).length} ファイル）`);
    return 0;
  }
  if (argv.includes('--files')) {
    const s = parseShard(flag('--files'));
    if (!s) { console.error('usage: --files <i>/<n>'); return 1; }
    console.log(planShards(files, s.of).bins[s.i - 1].files.join('\n'));
    return 0;
  }
  const { bins, median, unmeasured } = planShards(files, of);
  if (argv.includes('--check')) {
    const planned = bins.flatMap((b) => b.files);
    const problems = [];
    const missing = files.filter((f) => !planned.includes(f));
    if (missing.length) problems.push(`どの shard にも入っていないファイル: ${missing.join(', ')}`);
    const dupes = planned.filter((f, k) => planned.indexOf(f) !== k);
    if (dupes.length) problems.push(`2つ以上の shard に入ったファイル: ${[...new Set(dupes)].join(', ')}`);
    const stale = Object.keys(readLedger().seconds || {}).filter((f) => !files.includes(f));
    if (stale.length) problems.push(`.github/checks-cost.json に、もう存在しないファイルがある: ${stale.join(', ')}`);
    if (problems.length) { for (const p of problems) console.error('✗ ' + p); return 1; }
    console.log(`✓ ${files.length} ファイルが ${of} 台にちょうど1回ずつ（未計測 ${unmeasured.length} 件は中央値 ${median}s で見積もり）`);
    return 0;
  }
  const l = readLedger();
  console.log(`IntMap · node の回帰テスト ${files.length} ファイルを ${of} 台へ`);
  console.log(`  所要の実測: ${l.measured || '(未記録)'}`);
  if (unmeasured.length) console.log(`  未計測 ${unmeasured.length} 件（中央値 ${median}s で見積もり）: ${unmeasured.join(', ')}`);
  bins.forEach((b, k) => {
    const top = b.files.slice().sort((x, y) => (l.seconds[y] ?? median) - (l.seconds[x] ?? median)).slice(0, 4);
    console.log(`  shard ${k + 1}/${of}   予測 ${Math.round(b.cost)}s（直列の和）· ${b.files.length} ファイル · 重いもの: ${top.join(', ')}`);
  });
  return 0;
}

/* not awaited at top level: cli() imports scripts/test-checks.mjs, which imports this module back,
   and a top-level await here would hold this module unevaluated while that import waits on it */
if (process.argv[1] && /checks-shards\.mjs$/.test(posix(process.argv[1]))) cli(process.argv.slice(2)).then((code) => process.exit(code));
