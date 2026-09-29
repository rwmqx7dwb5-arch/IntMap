/* ============================================================================
 *  scripts/test-checks.mjs — the source-level regression suite, with one owner for the glob
 * ----------------------------------------------------------------------------
 *  `test:checks` used to be `node --test "tests/**\/*.test.mjs"` and CI sharded it with
 *  `npm run test:checks -- --test-shard=i/n`. That does not shard. Measured (Node 24.18):
 *
 *      node --test --test-shard=1/3 "tests/r5*-checks.test.mjs"   → 155 tests
 *      node --test "tests/r5*-checks.test.mjs" --test-shard=1/3   → 441 tests
 *      node --test "tests/r5*-checks.test.mjs"                    → 441 tests
 *
 *  ⚠ AN OPTION AFTER THE POSITIONAL IS SILENTLY IGNORED — no error, no warning, exit 0. Three CI
 *  runners each ran the whole suite and the shard numbers in their names were decoration. `npm run
 *  … --` can only APPEND, so from there the flag can never get in front of the glob.
 *
 *  So the glob lives here, extra arguments are placed BEFORE it, and both facts stay in one file.
 *
 *  Usage:  node scripts/test-checks.mjs [--test-shard=i/n] [--timings <file>] [any other node --test option]
 *  (--test-shard is answered by this runner from measured seconds — see main() below)
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';
import { problems } from './data-assets.mjs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testFiles, planShards, parseShard } from './checks-shards.mjs';

/* ⚠ THE ONE PLACE THE SUITE'S FILE SET IS WRITTEN. CI must not name files of its own — a second
   list is how `npm test` and CI stop running the same thing (#R166). */
export const GLOB = 'tests/**/*.test.mjs';

/* A probe seam, and the only reason it exists: tests/r586-checks.test.mjs has to watch this runner
   shard something, and sharding the real suite three times to find out would cost half an hour. It
   points the runner at a handful of throwaway files instead. Nothing in the product reads it. */
const glob = process.env.IM_CHECKS_GLOB || GLOB;

/* ══ (gate-parity-and-shards) `--test-shard=i/n` IS ANSWERED HERE, BY MEASURED SECONDS ═════════════
   node's own --test-shard splits the file set by COUNT (file k → shard k mod n), and CI measured
   11m16s / 8m32s / 4m52s for the three shards of one run (scripts/checks-shards.mjs has the numbers).
   So this runner takes the flag itself, asks scripts/checks-shards.mjs for bin i of n — a partition of
   the SAME glob, packed by .github/checks-cost.json — and hands node those files instead of the glob.
   The flag keeps its meaning («shard i of n; the n shards together are the suite, each file once»);
   only the balance changed. `--timings <file>` additionally writes the seconds each file took
   (scripts/checks-timing-reporter.mjs), which is how the ledger is refreshed. */
function takeFlag(argv, name) {
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === name) { const v = argv[k + 1]; argv.splice(k, 2); return v; }
    if (argv[k].startsWith(name + '=')) { const v = argv[k].slice(name.length + 1); argv.splice(k, 1); return v; }
  }
  return null;
}

function main() {
  const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
  const argv = process.argv.slice(2);
  const shardSpec = takeFlag(argv, '--test-shard');
  const timings = takeFlag(argv, '--timings');

  /* ⚠ (data-outside-git) THE DATASETS OUTSIDE GIT. A checkout without them fails dozens of files here, each with
     an ENOENT that names neither cause nor fix. So the absence is said ONCE, first and last, with the
     command — and it makes the run red even if every file happened to pass (a suite that did not read
     the data has not tested it). Presence only: the content hash is `npm test`'s first step. */
  const missing = problems(undefined, { verify: false });
  const say = () => { for (const m of missing) console.error('data-assets: ✖ ' + m); };
  say();

  let targets = [glob];
  if (shardSpec != null) {
    const s = parseShard(shardSpec);
    if (!s) { console.error(`--test-shard=${shardSpec}: expected <i>/<n> with 1 ≤ i ≤ n`); return 1; }
    const { bins, unmeasured, median } = planShards(testFiles(glob, { root: ROOT }), s.of);
    targets = bins[s.i - 1].files;
    console.log(`test-checks: shard ${s.i}/${s.of} · ${targets.length} files · predicted ${Math.round(bins[s.i - 1].cost)}s of serial work`
      + (unmeasured.length ? ` · ${unmeasured.length} unmeasured file(s) charged the median ${median}s` : ''));
    /* ⚠ AN EMPTY BIN MUST NOT REACH `node --test` — with no path it falls back to its own default
       discovery and would run a set nobody planned. More shards than files is simply nothing to do. */
    if (!targets.length) { say(); return missing.length ? 1 : 0; }
  }
  const reporters = timings
    ? ['--test-reporter=spec', '--test-reporter-destination=stdout',
       '--test-reporter=' + pathToFileURL(join(ROOT, 'scripts', 'checks-timing-reporter.mjs')).href,
       '--test-reporter-destination=' + timings]
    : [];
  const r = spawnSync(process.execPath, ['--test', ...reporters, ...argv, ...targets],
    { stdio: 'inherit', cwd: shardSpec != null ? ROOT : undefined });
  if (r.error) throw r.error;
  say();
  /* a null status means the child was killed by a signal; treating that as 0 is how a suite reports
     success without having run (#R191 measured that shape on Windows). */
  return missing.length ? 1 : r.status == null ? 1 : r.status;
}

/* run only when executed — scripts/checks-shards.mjs imports this file for GLOB */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
