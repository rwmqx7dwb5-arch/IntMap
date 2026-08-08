/* ============================================================================
 *  IntMap · WHICH TESTS RUN EVERY TIME, AND WHICH RUN NIGHTLY  (#R203)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。すべてが長すぎる。明らかにテストが過剰。
 *    ずっと言っているがテスト時間が壊滅的に長いまま変わっていない。大幅に過剰。簡易でいい。
 *    今の時間の1/10以下の時間で全テスト工程を終わらせろ。」
 *
 *  MEASURED BEFORE CHANGING ANYTHING: 56 spec files, 5,123 s of serial browser time — 85.4 minutes,
 *  ~45 minutes of wall clock locally at two workers. One tenth of that is 8.5 minutes of serial
 *  time, and no amount of packing reaches it, because packing only moves work between machines.
 *
 *  #R195 sharded by measured time. #R196 applied the same plan locally. #R197 put a CEILING on the
 *  total (scripts/test-budget.mjs) so the suite could not grow back. Every one of those made the
 *  same suite cheaper to RUN. None of them changed WHAT RUNS EVERY TIME, which is the thing the
 *  instruction is about: the wait before every push is the whole suite, and the whole suite is 85
 *  minutes because 56 rounds each added a file to it.
 *
 *  So the suite is split in two, and the split is DATA (tests/durations.json → `deep`), read here
 *  and nowhere else — the same shape #R186 used for `solo` and for the same reason: the moment a
 *  rule like this is written as a regex in two configs, the two disagree.
 *
 *    · CORE — 29 files, 424 s measured. Runs on `npm test`, on every PR and on every push. This is
 *      the gate: the smoke tests, the security and monitor suites, the imagery/resolution contracts,
 *      the boot-and-render invariants and the current round's own spec.
 *    · DEEP — 27 files, 4,699 s measured. The 3-D families whose individual tests are minutes long
 *      by nature: Cesium camera comparisons, terrain reads, the flight simulator, the drone planner,
 *      the satellite catalogue, the seismic/tsunami fields. Runs NIGHTLY, on every push to main, and
 *      on demand (`npm run test:deep`, or the workflow's dispatch button).
 *
 *  ⚠ A NEW SPEC IS CORE UNTIL SOMEBODY SAYS OTHERWISE. `deep` is the explicit list, so a file added
 *  by a later round runs in the gate by default and shows up against the ceiling — which is the
 *  direction that self-corrects. The opposite default would let the gate quietly empty out.
 *
 *  ⚠ AND NOTHING IS DELETED BY BEING DEEP. Every assertion still runs, every night and after every
 *  merge; what changes is that it no longer stands between an edit and a push. A regression in a
 *  deep spec is caught by the run that follows the merge, ~15 minutes later, not the next morning.
 * ==========================================================================*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUR = join(ROOT, 'tests', 'durations.json');

/* Specs that take part in no tier at all (see playwright.config.js for each one):
   prod-smoke runs against the deployed site after the merge; r184-imagery-profile is the renderer
   PROFILING instrument, a measurement rather than a gate. */
export const NEVER = [/^prod-smoke\.spec\.js$/, /^r184-imagery-profile\.spec\.js$/];

/** every spec file that exists and belongs to some tier, as `tests/<name>.spec.js` */
export function allSpecs() {
  return readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.spec.js') && !NEVER.some((r) => r.test(f)))
    .map((f) => 'tests/' + f)
    .sort();
}

/** the `deep` list exactly as tests/durations.json states it (basenames, no path, no extension) */
export function deepNames() {
  if (!existsSync(DUR)) return [];
  try {
    const raw = JSON.parse(readFileSync(DUR, 'utf8'));
    return Array.isArray(raw.deep) ? raw.deep.slice() : [];
  } catch (_) { return []; }
}

const bare = (f) => basename(String(f).split(':')[0]).replace(/\.spec\.js$/, '');

/** is this spec (path, basename, or `path:line`) in the deep tier? */
export function isDeep(file) {
  const n = bare(file);
  return deepNames().some((d) => bare(d) === n);
}

/** the tier this run is for: IM_TIER=core|deep|all, defaulting to core */
export function wantedTier(env) {
  const v = String((env || process.env).IM_TIER || 'core').toLowerCase();
  return (v === 'deep' || v === 'all') ? v : 'core';
}

/** does a spec belong to the requested tier? */
export function inTier(file, tier) {
  if (tier === 'all') return true;
  return tier === 'deep' ? isDeep(file) : !isDeep(file);
}

/** the spec paths of one tier */
export function tierSpecs(tier) {
  return allSpecs().filter((f) => inTier(f, tier));
}

/** a RegExp matching exactly the named specs, or null when the list is empty (so a caller never
 *  builds `()`, which matches everything). */
function reFor(names) {
  const esc = names.map(bare).filter(Boolean).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!esc.length) return null;
  return new RegExp('(^|[\\\\/])(' + esc.join('|') + ')\\.spec\\.js$');
}

/** what playwright.config.js adds to `testIgnore` so a run covers only `tier`. Stated as the list of
 *  files to HIDE — computed from the directory rather than from a negative lookahead, because the
 *  files are known and a lookahead over a path is the kind of thing that quietly matches nothing. */
export function tierIgnoreRegExps(tier) {
  if (tier === 'all') return [];
  const hide = allSpecs().filter((f) => !inTier(f, tier));
  const re = reFor(hide);
  return re ? [re] : [];
}
