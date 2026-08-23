#!/usr/bin/env node
/* ============================================================================
 *  IntMap · THE TEST SUITE HAS A CEILING, AND IT ONLY EVER GOES DOWN  (#R197)
 * ----------------------------------------------------------------------------
 *  「毎回毎回、テストに時間がかかりすぎ。」「そもそもの時間が長すぎる。個別対応するな。
 *    何重にもテストとか意味がない。」
 *
 *  #R195 sharded CI by measured time. #R196 applied the same plan locally. #R197 cut 21 minutes out
 *  of the browser suite. Every one of those was a fix for the round it was in, and the suite grew
 *  again the round after, because nothing stopped it: the convention was one new spec file per round,
 *  so R142…R197 left 56 spec files and 48 Node-check files, and the SAME property ended up asserted
 *  in five of them. That is what "何重にも" means and it is a structural fact, not a bad week.
 *
 *  This is the structural answer, and it is deliberately the same mechanism #R168 used to stop
 *  index.html growing: A NUMBER THAT MAY ONLY GO DOWN.
 *
 *    · the suite's total MEASURED serial time (tests/durations.json) must stay under BUDGET_S;
 *    · when a round makes the suite faster, it lowers BUDGET_S to the new figure — the ceiling
 *      follows the floor DOWN and never the other way, because a ceiling that is raised once has
 *      stopped asserting anything (#R194);
 *    · a round that needs to ADD test time must take at least as much out somewhere else. That is
 *      the whole point: it forces consolidation instead of accumulation.
 *
 *  ⚠ AND IT REFUSES TO PASS ON IGNORANCE. A spec with no measured time is charged the p75 of the
 *  ones that have one (the same rule scripts/shard-plan.mjs uses), so deleting a duration entry
 *  cannot buy headroom, and adding an unmeasured spec costs more than a measured one rather than
 *  less. It also fails if a spec file exists that the plan has never seen at all.
 *
 *    node scripts/test-budget.mjs            # gate (used by npm test and CI)
 *    node scripts/test-budget.mjs --report   # what the time is spent on, largest first
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeep } from './tiers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── THE CEILING. Lower it when a round makes the suite faster; never raise it. ────────────────
   #R197 set it at 86.7 min against a measured 85.7. Two things got it there, and the second is the
   reason this file exists at all:
     · the five files that each swept the same "tilting does not move the viewpoint" invariant were
       merged into the one that drives a real pointer drag (tests/r179.spec.js): −21.4 min;
     · nine specs had NO measured time and were being charged p75 by scripts/shard-plan.mjs. Measured,
       they came to 9–23 s against the 156 s each they were charged: −11.7 min that was never real.
   ⚠ AND THE FIRST THING THIS GATE DID WAS CATCH ITS OWN AUTHOR. The round reported "83.7 min" from
   the 46 specs that had durations, while 55 spec files existed — the true figure was 107 min. A
   total that is computed from the files on disk rather than from the ones someone remembered to
   measure is the only kind worth having a ceiling on. */
/* ⚠ (#R203) THE CEILING NOW GOVERNS THE TIER THAT RUNS EVERY TIME, WHICH IS THE ONE THE
   INSTRUCTION IS ABOUT. 「今の時間の1/10以下の時間で全テスト工程を終わらせろ」— the measured whole
   was 5,123 s; a tenth is 512 s. scripts/tiers.mjs splits the suite into the 29 files that gate a
   push (424 s measured) and the 27 that run nightly and after every merge (4,699 s). Both have a
   ceiling here and both may only go down; a round that wants to add gate time still has to take it
   out somewhere, and a round that "fixes" the gate by pushing a file into `deep` still pays for it
   against DEEP_BUDGET_S. Moving everything to nightly is therefore not a way to pass this gate. */
/* ⚠ (#R204) AND THE SECOND CEILING IS NOW THE **TOTAL**, NOT THE DEEP TIER.
   #R203 capped core and deep separately so that "fix the gate by moving files into deep" could not
   pass. The cost of that shape is that it also blocks the legitimate version of the same move: this
   round's instruction — 「明らかにテストが過剰。大幅に過剰。簡易でいい。」 — is answered by taking
   360 s of per-round regression files OUT of the gate, and a deep ceiling set at deep's own measured
   figure refuses that even though nothing has been added anywhere.
   What must never grow is how much test time this project owns, so THAT is what is capped. The gate
   keeps its own, much lower ceiling, and the two together say the thing worth saying:
     · TOTAL_BUDGET_S — the whole suite. A round that adds a spec pays for it out of somewhere.
     · BUDGET_S — what stands between an edit and a push. Moving a file to deep relieves this one and
       does NOT relieve the total, so the only way to buy total headroom is to make something faster.
   ⚠ The gate cannot be emptied to pass BUDGET_S either: scripts/tiers.mjs keeps the four always-on
   suites and the current round's own spec in core by construction, whatever they cost.
   5,250 is exactly #R203's two ceilings added together — this round created no headroom at all. */
/* (#R207) 90 → 66. The gate is 6 files / 60 s: the four always-on suites plus the current round's
   spec, which is now ZERO extra files because this round's browser assertions were appended to
   tests/smoke.spec.js instead of getting a boot of their own (measured: 29.6 s without them, 29.2 s
   with them — the assertions are free, the boot was the whole price). CORE_MAX_S also went 6 → 1,
   which took the six legacy per-round specs out of the gate. Ceiling follows the measurement down. */
/* (#R209) 66 → 64 and 5,220 → 5,201. The new spec was paid for TWICE, and neither payment is an
   estimate dressed as a measurement:
     · tests/r209.spec.js is 10 s (measured on this machine, serial, two runs: 9.1 / 10.4 s) —
       one boot for five tests, on #R208's worker-scoped page. Its first draft cost 14 s because
       one test took `app.freshPage()` for a precondition that ordering gives for nothing.
     · tests/r179-engine.spec.js was carrying 68 s, a figure measured BEFORE #R208 converted it
       from four boots to one and never re-measured (the same is still true of r170, r184-drone
       and r184-routing — 421 s of stale-high entries this round did not touch). Corrected to 40
       by the only method that does not mix machines: count the boots it no longer pays for and
       price them at CI's measured 9.2 s (#R186). 68 − 3×9.2 ≈ 40. It runs in 10.8 s locally, so
       40 is deliberately the conservative end; CI's `shard-plan --update` replaces it on merge. */
const BUDGET_S = 64;                    /* core: 1.1 min — measured 64 s over 6 files (#R209) */
const TOTAL_BUDGET_S = 5084;            /* whole suite: 84.7 min - measured 5084 (#R341) */
const HISTORY = [
  ['#R341', 5084, 'tests/r341.spec.js (+4 s, the gate half: it needs no live feed, so a push cannot go red because a provider had a bad afternoon) and tests/r341-live.spec.js (+6 s, deep: the claims that DO need real aircraft) were paid for by re-measuring tests/r184-drone.spec.js. It carried 145 s and ran in 35 - and 35 was measured while this machine was running eleven other specs at --workers=2, so it is an UPPER bound; the entry is set to 40 on the conservative side, exactly as #R209 and #R210 did. THE STALENESS WAS ALREADY WRITTEN DOWN: #R209 named r170, r184-drone and r184-routing as 421 s of pre-#R208 figures for files that now boot ONCE, and said in as many words that it did not touch them. r184-drone boots once for ten tests, six of which run in under a second. NOT USED FOR PAYMENT, though all four measured far below their entries: r174 (651 -> 396), r186 (315 -> 194), r185 (274 -> 178) and r175 (159 -> 155) each had a failing or self-skipping test in the run, so their totals include a 60-90 s wait that resolved into nothing rather than a file that got faster.'],
  ['#R337', 5179, 'this round added TWO spec files and paid for both. tests/r337.spec.js (6 s) is the cheap half — the temperature legend switch and the Chronos ruler — and stands in the gate as the current round’s spec; tests/r337-atlas.spec.js (24 s) holds the two claims that need the Atlas chunk and the country table, and is named so that scripts/tiers.mjs’s «r + digits» rule does NOT pull it into the gate (the same shape as r318-atlas). ⚠ THE 30 s CAME OUT OF A STALE-HIGH ENTRY, NOT OUT OF THE CEILING: tests/r170.spec.js carried 108 s, a figure measured before #R208 converted it from nine boots to one, and #R209 named it in this file as still stale and did not touch it. MEASURED TWICE on this machine, serial, with the server already up: 60.3 s and 76.5 s — the spread is another session building at the same time, so the ledger takes the UPPER bound (77) and the saving being claimed is the smaller one. 5,180 -> 5,179, and the ceiling follows the measurement down as #R322 did. r184-drone (145 s) and r184-routing (40 s) are still stale-high and still untouched.'],
  ['#R322', 5180, 'tests/r322.spec.js (+4 s) was paid for by re-measuring tests/r193.spec.js: it carried 71 s and runs in 46. MEASURED TWICE, both times while this machine was busy with another suite — so 46 is an UPPER bound and the ceiling is being lowered by less than the file actually gained. ⚠ tests/r192.spec.js (66 -> 63) and tests/r196.spec.js (90 -> 79 alone, 100 under load) were NOT changed: this machine spreads those two by more than the difference, and a ratchet fed by noise stops being a ratchet. The suite went 5,201 -> 5,180 and the ceiling followed it down, as #R195 and #R196 did for the shell.'],
  ['#R210', 5201, 'tests/r210.spec.js (+10 s, one boot for four tests — the first-visit branch was left OUT of it because a second boot cost 15.2 s of a 66 s ceiling for one expression, and is a source check instead) was paid for by re-measuring tests/r184-routing.spec.js: 104 s was a pre-#R208 figure for a file that now boots ONCE for nine tests, so 104 − 8×9.2 ≈ 30, corrected to 40 on the conservative side exactly as #R209 did for r179-engine'],
  ['#R209', 5201, 'tests/r209.spec.js (+10 s, one boot for five tests) was paid for by re-measuring tests/r179-engine.spec.js, which had carried a pre-#R208 figure of 68 s for a file that now boots once (−28 s)'],
  /* ⚠ (#R206) THE NEW SPEC WAS PAID FOR OUT OF A BOOT, WHICH IS WHERE THIS SUITE'S TIME LIVES.
     tests/r206.spec.js is new (+7 s, measured locally) and tests/r192.spec.js paid for it: its four
     tests each took a fresh `page` fixture and booted the whole app into it, so three of the four
     boots existed only because the fixture is per-test by default. Every CORE spec in this suite
     already shares one page across its describe (smoke, internal-qa, monitors, security, r163,
     r197) — this is that pattern, not a new one, and it is the same payment #R201 made.
     MEASURED on this machine, same build, same worker count, both directions:
       before (4 boots) 83.6 s → after (1 boot) 56.2 s, 4 passed both times.
     The table's 98 s is a CI figure, so it is scaled by the ratio this machine measured
     (98 × 56.2/83.6 = 66) rather than replaced with a local number; CI's `shard-plan --update`
     re-measures it on the merge and the entry becomes a CI figure again.
     ⚠ Separately, and NOT visible in this table because it is not browser time: the every-push gate
     lost 26 s in scripts/static-checks.mjs (25.4 s → 4.3 s; 90 % of it was 501 sequential
     `node --check` spawns) and `npm test` went 77 s → 45 s of wall clock. */
  ['#R206', 5220, 'tests/r192.spec.js stopped booting the app four times to ask four questions (−27.4 s measured locally, −32 s of the CI figure), which paid for tests/r206.spec.js (+7 s)'],
  ['#R197', 5200, 'the viewpoint sweep merged out of r172/r173/r176/r177/r178 into r179 (−21.4 min), and nine specs that were CHARGED p75 were measured instead (−11.7 min of pure fiction)'],
  /* ⚠ (#R201) AND THIS ROUND ADDED A SPEC AND STILL WENT DOWN, WHICH IS THE MECHANISM WORKING.
     tests/r201.spec.js is new (+45 s) and had to be paid for:
       · EIGHT specs chose their renderer by booting the app, writing `intmap_engine` into
         localStorage, and booting AGAIN — the app reads the key at load, so the choice could not be
         made after the load that had to honour it. tests/helpers/engine.js seeds it with
         addInitScript BEFORE the first load, and only if nothing has written it (which is what keeps
         "switch back to MapLibre" testable — the reason r180-cesium gave for not doing this).
         MEASURED, 3 reps: the removed load is 1,047 ms (cesium) / 298 ms (maplibre) on the
         development machine, which runs this suite at 0.68× of CI (r196 61 s/90 s, r200 18 s/26 s),
         so 1.54 s / 0.44 s of CI time per boot. 41 boots × their engine = −56 s.
       · tests/r197.spec.js lost the space-BUTTON test (the button is gone): 40 s → 6 s.
     Net −45 s, and the ceiling follows it down. The cesium files will drop further than the figure
     above the next time CI runs `shard-plan --update`: the per-boot saving on a runner with no GPU
     is not 1 s (#R186 measured 9,160 ms vs 3,192 ms for a boot there), but a number that has only
     been measured HERE is not a number to write into a table CI schedules from. */
  ['#R201', 5150, 'eight specs stopped booting the app twice to choose a renderer (−56 s, measured per boot), and the space-button test went with the button (−34 s), which paid for tests/r201.spec.js (+45 s)'],
  ['#R203', 500, 'the ceiling stopped governing "the suite" and started governing THE TIER THAT RUNS EVERY TIME: 5,123 s of measured serial time split into a 424 s gate (29 files) and a 4,699 s nightly (27 files) — see scripts/tiers.mjs. Nothing was deleted; what changed is what stands between an edit and a push'],
  ['#R205', 96, "the price came down (scripts/tiers.mjs: CORE_MAX_S 10 → 6 s), which took six legacy per-round specs out of the gate, and #R204's own 49 s spec demoted itself when this round's arrived. Gate 17 files/173 s → 11 files/87 s. Separately, `npm test` now runs its source half and its browser half AT THE SAME TIME (scripts/test-parallel.mjs) — that is wall clock, not serial time, so it does not appear in this table"],
  ['#R204', 180, 'membership of the gate became a PRICE rather than a list (scripts/tiers.mjs: CORE_MAX_S = 10 s), because #R203 left CORE as the DEFAULT and 281 s of its 484 s sat in nine per-round regression files nobody had looked at. The gate is 17 files; the second ceiling is now the TOTAL, which this round did not move'],
];

const dur = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'durations.json'), 'utf8'));
const measured = Object.entries(dur).filter(([, v]) => typeof v === 'number' && isFinite(v));
const specs = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.spec.js'))
  .map(f => 'tests/' + f)
  /* Two files are not part of the suite this budget governs, and both are excluded because they do
     not RUN in it — not because excluding them is convenient:
       · prod-smoke runs against the deployed site, after the merge;
       · r184-imagery-profile is the renderer PROFILING instrument, which playwright.config.js keeps
         out of the default run because it is a measurement rather than a gate (#R184). */
  .filter(f => !/prod-smoke|imagery-profile/.test(f));

const times = measured.map(([, v]) => v).sort((a, b) => a - b);
const p75 = times.length ? times[Math.floor(times.length * 0.75)] : 0;

const rows = [];
for (const s of specs) {
  const known = typeof dur[s] === 'number' && isFinite(dur[s]);
  rows.push({ spec: s, t: known ? dur[s] : p75, known, deep: isDeep(s) });
}
const core = rows.filter(r => !r.deep), deep = rows.filter(r => r.deep);
const sum = (a) => a.reduce((x, r) => x + r.t, 0);
const total = sum(core), deepTotal = sum(deep);
const unmeasured = rows.filter(r => !r.known);

if (process.argv.includes('--report')) {
  process.stdout.write('spec                                    time    share  tier\n');
  for (const r of [...rows].sort((a, b) => b.t - a.t)) {
    process.stdout.write(r.spec.padEnd(40) + String(r.t).padStart(5) + 's'
      + (100 * r.t / (total + deepTotal)).toFixed(1).padStart(7) + '%  ' + (r.deep ? 'deep' : 'core')
      + (r.known ? '' : '   (unmeasured — charged p75)') + '\n');
  }
  process.stdout.write('\ncore  ' + (total / 60).toFixed(1) + ' min over ' + core.length + ' specs; ceiling '
    + (BUDGET_S / 60).toFixed(1) + ' min\ndeep  ' + (deepTotal / 60).toFixed(1) + ' min over ' + deep.length
    + ' specs\ntotal ' + ((total + deepTotal) / 60).toFixed(1) + ' min; ceiling '
    + (TOTAL_BUDGET_S / 60).toFixed(1) + ' min\n');
  process.exit(0);
}

process.stdout.write('test budget: core ' + (total / 60).toFixed(1) + ' min over ' + core.length + ' specs'
  + (unmeasured.length ? (' (' + unmeasured.length + ' unmeasured, charged p75 = ' + p75 + 's each)') : '')
  + ' — ceiling ' + (BUDGET_S / 60).toFixed(1) + ' min; whole suite ' + ((total + deepTotal) / 60).toFixed(1)
  + ' min over ' + rows.length + ' specs — ceiling ' + (TOTAL_BUDGET_S / 60).toFixed(1) + ' min\n');

function over(what, got, cap, hint) {
  process.stderr.write('\n✗ THE ' + what.toUpperCase() + ' TIER IS OVER ITS CEILING by ' + ((got - cap) / 60).toFixed(1) + ' min.\n'
    + '  Do not raise the ceiling. Take the time out instead — `node scripts/test-budget.mjs --report`\n'
    + '  shows where it is, and #R197 is the worked example: five files were sweeping one invariant.\n'
    + (hint ? '  ' + hint + '\n' : '')
    + '  The last change: ' + HISTORY[HISTORY.length - 1].join('  ') + '\n');
  process.exit(1);
}
if (total > BUDGET_S) over('core', total, BUDGET_S,
  'A file over CORE_MAX_S already leaves the gate by itself (scripts/tiers.mjs); if this is over, the'
  + '\n  always-on suites or this round\'s own spec have grown — make them faster, do not re-tier them.');
if (total + deepTotal > TOTAL_BUDGET_S) over('whole suite', total + deepTotal, TOTAL_BUDGET_S,
  'Moving a file into `deep` is not a way out of THIS one: it is the same total either way.');
/* ⚠ a ceiling that is not tracking the floor has stopped asserting anything (#R194) — but the slack
   is scaled to the tier, or the 300 s that is right for an 80-minute suite would be 60% of an
   8-minute one and the gate could double without complaint. */
for (const [what, got, cap] of [['core', total, BUDGET_S], ['whole suite', total + deepTotal, TOTAL_BUDGET_S]]) {
  const slack = Math.max(60, Math.round(cap * 0.12));
  if (got < cap - slack) {
    process.stderr.write('\n✗ THE ' + what.toUpperCase() + ' CEILING IS STALE: that tier is '
      + ((cap - got) / 60).toFixed(1) + ' min under it. Lower it to ' + Math.ceil((got + slack / 2) / 30) * 30
      + ' and record why in HISTORY.\n  A ceiling that is not tracking the floor has stopped asserting anything (#R194).\n');
    process.exit(1);
  }
}
process.stdout.write('✓ test budget OK\n');
