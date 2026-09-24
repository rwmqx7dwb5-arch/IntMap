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
 *  Usage:  node scripts/test-checks.mjs [--test-shard=i/n] [any other node --test option]
 * ==========================================================================*/
import { spawnSync } from 'node:child_process';
import { problems } from './data-assets.mjs';

/* ⚠ THE ONE PLACE THE SUITE'S FILE SET IS WRITTEN. CI must not name files of its own — a second
   list is how `npm test` and CI stop running the same thing (#R166). */
export const GLOB = 'tests/**/*.test.mjs';

/* A probe seam, and the only reason it exists: tests/r586-checks.test.mjs has to watch this runner
   shard something, and sharding the real suite three times to find out would cost half an hour. It
   points the runner at a handful of throwaway files instead. Nothing in the product reads it. */
const glob = process.env.IM_CHECKS_GLOB || GLOB;

/* ⚠ (data-outside-git) THE DATASETS OUTSIDE GIT. A checkout without them fails dozens of files here, each with
   an ENOENT that names neither cause nor fix. So the absence is said ONCE, first and last, with the
   command — and it makes the run red even if every file happened to pass (a suite that did not read
   the data has not tested it). Presence only: the content hash is `npm test`'s first step. */
const missing = problems(undefined, { verify: false });
const say = () => { for (const m of missing) console.error('data-assets: ✖ ' + m); };
say();
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), glob], { stdio: 'inherit' });
if (r.error) throw r.error;
say();
/* a null status means the child was killed by a signal; treating that as 0 is how a suite reports
   success without having run (#R191 measured that shape on Windows). */
process.exit(missing.length ? 1 : r.status == null ? 1 : r.status);
