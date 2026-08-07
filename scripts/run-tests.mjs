/* ============================================================================
 *  IntMap · THE LOCAL BROWSER RUN, PLANNED THE WAY CI PLANS IT  (#R196)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。」
 *
 *  #R195 fixed the CI half of this: `--shard=i/n` divides by TEST COUNT, so one machine kept drawing
 *  the heavy files, and scripts/shard-plan.mjs replaced it with a partition computed from MEASURED
 *  times. CI went from 36 minutes to 375 seconds. The LOCAL run was never touched, and locally
 *  `playwright test` is still handed the whole tests/ directory in READDIR ORDER at two workers.
 *
 *  Two costs come out of that, and this script is both of them:
 *
 *  ① THE TAIL. Two workers pull files off one queue as they free up, so the LAST file to start
 *     decides when the run ends. In directory order the longest specs (r171 … r179) sit in the
 *     middle-to-late part of the list, so a worker regularly picks up a ten-minute file when the
 *     other has thirty seconds of work left. Longest-processing-time-first is the standard fix and
 *     the planner already computes exactly that ordering from tests/durations.json — CI has been
 *     using it for a round. This hands the same ordering to the local run.
 *
 *  ② THE CONTENTION FLAKES, WHICH COST A WHOLE RE-RUN. #R186 measured that the `-cesium` specs only
 *     pass with a machine to themselves, and tests/durations.json records that as data (`solo`). CI
 *     honours it; the local run did not, so those specs ran interleaved with everything else at two
 *     workers. Measured while writing this: r177 lost two tests to 60-second boot timeouts with a
 *     second heavy run alongside it, and passed 17/17 when run on its own. A flaky local run is not
 *     a shorter run — it is the same run twice.
 *
 *  So: the non-solo pool first at two workers in LPT order, then the solo pool at one worker. Same
 *  files, same config, same assertions — `npm test` still runs every spec.
 *
 *  ⚠ IT DEGRADES TO THE OLD BEHAVIOUR. If the planner cannot produce a list (no durations file, a
 *  spec added since the last measurement, anything at all), this runs `playwright test` with no file
 *  arguments — i.e. exactly what `npm test` did before. Being slow is recoverable; silently running
 *  a subset is not, which is the same rule scripts/shard-plan.mjs states for its own empty groups.
 * ==========================================================================*/
import { spawnSync, execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* (#R203) …and it runs ONE TIER. `npm test` is the core tier — 29 files, ~7 minutes of serial time
   against the 85 the whole suite costs — and `npm run test:deep` is the other half. The list lives
   in tests/durations.json; scripts/tiers.mjs is the only thing that reads it. */
import { tierSpecs, wantedTier } from './tiers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const win = process.platform === 'win32';
const NPX = win ? 'npx.cmd' : 'npx';
const TIER = wantedTier(process.env);

/* every spec this run covers — the config's own testIgnore removes prod-smoke and the profiler */
const allSpecs = () => tierSpecs(TIER);

/* ask the planner for ONE group of one — that is its LPT ordering of the whole pool */
function poolFiles(pool) {
  try {
    const out = execFileSync(process.execPath, [join(ROOT, 'scripts', 'shard-plan.mjs'), '--tier', TIER, '--pool', pool, '--group', '1', '--of', '1'],
      { cwd: ROOT, encoding: 'utf8' }).trim();
    return out ? out.split(/\s+/) : [];
  } catch (_) { return []; }
}

function run(files, workers, label) {
  const args = ['playwright', 'test', `--workers=${workers}`, ...files];
  console.log(`\n── ${label}: ${files.length || 'all'} spec file(s), ${workers} worker(s) ──`);
  const t0 = Date.now();
  const r = spawnSync(NPX, args, { cwd: ROOT, stdio: 'inherit', shell: win, env: process.env });
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`── ${label}: ${secs}s ──`);
  if (r.error) throw r.error;
  return r.status == null ? 1 : r.status;   /* (#R191) a null status is a FAILURE, not a clean exit */
}

console.log(`run-tests: ${TIER} tier — ${allSpecs().length} spec file(s)`
  + (TIER === 'core' ? ' (the deep tier runs nightly and after every merge; `npm run test:deep` runs it here)' : ''));
const rest = poolFiles('rest');
const solo = poolFiles('cesium');

/* the plan has to cover every spec that exists, or the run is quietly a subset */
const covered = new Set([...rest, ...solo].map((f) => f.split(':')[0]));
const missing = allSpecs().filter((f) => !covered.has(f));
if (!rest.length || missing.length) {
  if (missing.length) console.warn(`run-tests: the plan does not cover ${missing.join(', ')} — running the whole directory instead`);
  process.exit(run([], process.env.PW_WORKERS || 2, 'all specs (unplanned)'));
}

let status = run(rest, process.env.PW_WORKERS || 2, 'browser suite');
if (solo.length) status = run(solo, 1, 'specs that need the machine to themselves') || status;
process.exit(status);
