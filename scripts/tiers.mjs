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
 *    · CORE — the gate. Runs on `npm test`, on every PR and on every push.
 *    · DEEP — everything else. Runs NIGHTLY, on every push to main, and on demand
 *      (`npm run test:deep`, or the workflow's dispatch button).
 *
 *  ⚠ AND NOTHING IS DELETED BY BEING DEEP. Every assertion still runs, every night and after every
 *  merge; what changes is that it no longer stands between an edit and a push. A regression in a
 *  deep spec is caught by the run that follows the merge, ~15 minutes later, not the next morning.
 *
 *  ══ (#R204) WHICH FILES ARE CORE IS NOW A PRICE, NOT A LIST ═══════════════════════════════════
 *  「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。すべてが長すぎる。明らかにテストが過剰。
 *    ずっと言っているがテスト時間が壊滅的に長いまま変わっていない。大幅に過剰。簡易でいい。」
 *
 *  Reported AGAIN after #R203 split the suite, and the measurement says why: #R203 wrote `deep` as
 *  an explicit list of 27 files, which made CORE the default — so the 30 files nobody had thought
 *  about stayed in the gate, and 281 s of the gate's 484 s sat in nine of them (r203 60 s, r201 45 s,
 *  r178-imagery 41 s, r178 33 s, r180-imagery 32 s…). A default of "core" means the gate grows by
 *  one file per round for ever, which is the same accumulation #R197 built a ceiling against.
 *
 *  So the rule is inverted and made a PRICE that each file pays out of its own measured time:
 *
 *      a spec may stand in the gate only if it costs at most CORE_MAX_S seconds to run.
 *
 *  ⚠ Plus two exceptions, and neither is a list of favourites:
 *    · CORE_ALWAYS — the four suites that ARE the gate rather than a round's regression file:
 *      smoke, security, internal-qa, monitors. They run whatever they cost.
 *    · THE CURRENT ROUND'S OWN SPEC — derived, not written down: the highest-numbered `rNNN.spec.js`
 *      on disk. #R203's "a new spec is core until somebody says otherwise" is exactly right for the
 *      round being worked on and exactly wrong a round later, and deriving it from the file names
 *      means the demotion happens by itself when the next round lands. A spec that is cheap enough
 *      stays core on merit afterwards; an expensive one steps aside without anyone remembering to.
 *
 *  ⚠ AN UNMEASURED SPEC IS CORE. A file with no entry in tests/durations.json has not been shown to
 *  be expensive, and the direction that self-corrects is "gate it until it is measured" — the
 *  opposite default would let a spec dodge the gate by never being timed.
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

/* ── THE PRICE OF STANDING IN THE GATE ─────────────────────────────────────────────────────────
   Ten seconds of measured serial time. Chosen from the distribution rather than from taste: the 30
   files #R203 left in core split cleanly at that figure — 17 of them cost 1–9 s and together come to
   124 s, while the other 13 cost 12–60 s and come to 360 s. The gate keeps the broad, cheap coverage
   and gives up the expensive per-round regression files, which lose nothing but their position in
   front of a push. Lower it when a round can; raising it is how the gate grows back.

   ══ (#R205) LOWERED TO SIX ═══════════════════════════════════════════════════════════════════
   Reported again. Measured before touching anything: the gate is 173 s over 17 files, and where it
   sits says what to do — **49 s of it is `r204.spec.js` alone**, and six legacy per-round specs
   (r143 / r150 / r160 at 9 s, r168 at 8, r164 / r165 at 7) account for another 49.

     · CORE_MAX_S 10 → 6 takes those six out: 173 → 124 s.
     · r204.spec.js leaves by itself, because the round exception below is the CURRENT round's spec
       and this round is not that one. What replaces it is this round's spec at 21 s.

   Gate: **17 files / 173 s → 11 files / 96 s.**

   ⚠ THE CURRENT-ROUND EXCEPTION STAYS, AND IT WAS RE-EXAMINED RATHER THAN ASSUMED. It is the one
   spec most likely to catch what this round broke, and it is bounded: exactly one round's spec is
   ever in the gate, because `currentRoundSpec()` demotes the previous one the moment a higher number
   appears. Holding it to the price instead was tried and measured — a spec that boots the app cannot
   come in under six seconds (this round's is 14.1 s locally ≈ 21 s of CI time, of which the boot is
   most), so pricing it would mean NO round ever verifies itself before its own push.

   Nothing is deleted: everything that leaves the gate runs nightly and after every merge, ~15
   minutes behind the push rather than in front of it (#R203).

   ⚠ AND THAT IS A BILL, NOT A SAVING — #R205 PAID IT IN ITS OWN ROUND. The PR gate was green first
   time and the post-merge deep run went red on two specs, both of them previous rounds' browser
   tests guarding surfaces this round had touched (`r186.spec.js` reads the launch screen's mark;
   `r204.spec.js` counts the context menu's headings). A cheap gate does not remove that work, it
   MOVES it to the author. So: **before pushing a change to a surface the gate no longer covers, run
   `npm run test:deep`** — and find which specs those are the way #R186 says, by grepping tests/ for
   the file names, layer ids and API names the change touched. */
export const CORE_MAX_S = 6;

/* The suites that are the gate itself rather than one round's regression file. Whatever they cost. */
export const CORE_ALWAYS = ['smoke', 'security', 'internal-qa', 'monitors'];

const bare = (f) => basename(String(f).split(':')[0]).replace(/\.spec\.js$/, '');

/** measured serial seconds per spec basename, from tests/durations.json */
function durations() {
  if (!existsSync(DUR)) return {};
  try {
    const raw = JSON.parse(readFileSync(DUR, 'utf8'));
    const out = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && isFinite(v)) out[bare(k)] = v;
    }
    return out;
  } catch (_) { return {}; }
}

/** the current round's own spec — the highest-numbered `rNNN.spec.js` on disk, or null */
export function currentRoundSpec() {
  let best = null, bestN = -1;
  for (const f of allSpecs()) {
    const m = /^r(\d+)$/.exec(bare(f));
    if (m && +m[1] > bestN) { bestN = +m[1]; best = bare(f); }
  }
  return best;
}

/** the core tier as basenames — the gate, derived rather than listed (see the header) */
export function coreNames() {
  const d = durations(), cur = currentRoundSpec();
  return allSpecs().map(bare).filter((n) =>
    CORE_ALWAYS.includes(n) || n === cur || !(d[n] > CORE_MAX_S));
}

/** is this spec (path, basename, or `path:line`) in the deep tier? */
export function isDeep(file) {
  return !coreNames().includes(bare(file));
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
