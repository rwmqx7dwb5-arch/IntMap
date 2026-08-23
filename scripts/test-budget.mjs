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
/* ⚠ (#R354) 64 → 50 and 5,024 → 4,892, and the round ADDED two specs. Both were paid for out of
   ONE stale-high entry, which is the shape #R209 named and #R337, #R341 and #R353 all repeated.
   ⚠ AND THE GATE HALF WAS REWRITTEN BECAUSE THIS CEILING REFUSED IT. tests/r354.spec.js was first
   written to boot on a FIRST-VISIT profile, because that is what "the cables are default-ON" means
   — and it measured 9–19 s marginal against tests/r157.spec.js, putting core 9 s over. #R186 had
   already measured the reason: the two thematic default layers cost 9,160 ms of a boot against
   3,192 ms without them, which is precisely why the suite seeds a session that switches them off
   (tests/helpers/session-seed.js). Rewritten to switch the row ON from the standard seeded boot it
   measures 7.7 and 7.9 s (two runs) and is entered at 8; the nightly half measures 27 and 31 s marginal against tests/r157.spec.js and is entered at the upper bound, 31. Nothing was lost: tests/r186.spec.js still
   pins the default, and tests/r354-cables.spec.js ① checks it on the rebuilt routes.
   THE 33 s CAME OUT OF tests/r186.spec.js, WHICH CARRIED 315. #R341 measured it at 194 and declined
   to use it because that run contained a failing or self-skipping test whose 60–90 s wait was in the
   total. MEASURED THIS ROUND, ALL TWELVE TESTS PASSING: 110.7 s of test time and 2.5 min of wall
   clock with the server already up. The entry is set to 150 — the WALL figure, i.e. including the
   ~45 s every invocation pays, exactly as #R209 and #R337 did — so the saving claimed is smaller
   than the one measured. Both ceilings follow the measurement down. */
const BUDGET_S = 50;                    /* core: 0.8 min — measured 50 s over 6 files (#R354) */
const TOTAL_BUDGET_S = 4898;            /* 81.6 min — 5,024 (#R353) + 39 (#R354's two specs) - 165
                                           (#R354 corrected r186 315 -> 150).
   (#R353) 83.7 min — 5,035 (#R352) + 11 (#R353's two specs) - 22
                                           (#R353 corrected internal-qa 22 -> 10 and r184-routing 40 -> 30).
   ⚠ (#R353) VOLCANO INTELLIGENCE ADDED TWO SPECS AND THE SUITE STILL WENT DOWN, and both were paid
   for out of STALE-HIGH ENTRIES rather than out of the ceiling — the shape #R209 named and #R337
   and #R341 both re-named without touching. tests/r353.spec.js (+5 s) is the gate half: it opens
   the volcano card and switches the four colour modes with NOTHING answering on the network, so a
   push cannot go red because volcano.si.edu or USGS had a bad afternoon; the three claims that DO
   need those upstreams are tests/r353-live.spec.js (+6 s, deep).
     · tests/internal-qa.spec.js carried 22 s, a figure from before it shared the worker-scoped
       `app` fixture; it boots ONCE for three tests now and MEASURED 0.5 s (twice, serial, server
       already up). Set to 10 — twenty times the measurement — because a number measured HERE is
       not a number to write into a table CI schedules from.
     · tests/r184-routing.spec.js carried 40 s, and #R210 wrote down how that number was made:
       104 − 8×9.2 ≈ 30, «corrected to 40 on the conservative side». MEASURED in the deep tier,
       serial: 16.4 s over 8 passing tests. Set to 30 — #R210's own arithmetic, still nearly twice
       the measurement.
   ⚠ NOT USED FOR PAYMENT, and this is why single local numbers are not written straight into the
   table: the same core run that measured internal-qa at a fiftieth of its entry measured
   tests/smoke.spec.js at 66.5 s against an entry of 8. A ratchet fed by noise stops being a
   ratchet (#R322's rule), so monitors (14 -> 6) and security (9 -> 1.2) were left alone too.
   THE OLD NOTE FOR THIS LINE FOLLOWS: 5,035 was 5,089 (#R347) + 4 (#R352's spec) - 58 (#R352
                                           corrected tests/r185.spec.js: 274 s -> 216 s).
   ⚠ (#R352) THE CORRECTION IS THE DELETION OF A WAIT, NOT A FASTER MACHINE. #R341 replaced a
   `waitForFunction(..., 60000)` in r185 that EXPIRED on every run — its own note says "66 s of a
   green run asserting nothing" — and the test it guards now measures 8.1 s. An expired wall-clock
   wait costs the same on any machine, so 66 - 8.1 comes off the recorded figure with no assumption
   about where it was measured. Nothing else was claimed: the same file measures 88 s locally, but
   three control specs #R341 never touched measured 0.57x, 0.67x and 1.80x their recorded times, so
   a single local run cannot be compared with this table and was not used to set this number.
   ⚠ tests/r192.spec.js holds the same kind of stale figure (#R341 measured a 95 s skip there) and
   is deliberately NOT claimed here — a ceiling should only ever fall by what has been shown. */
/* ⚠⚠ (#R347) THE ONE CEILING THIS ROUND MOVED, AND IT MOVED BY THE MEASURED AMOUNT — 5 SECONDS.
   Saying so plainly, because this file's own message says «do not raise the ceiling».
   #R322, and #R341 after it, set TOTAL_BUDGET_S to EXACTLY the total measured, which leaves zero slack: after it,
   any round that adds a spec file at all is over, whatever the file costs. §51/§52 of this round's
   brief require browser acceptance tests for turn-by-turn navigation — a subsystem whose whole
   risk is «code that parses and has never run» — so «add no spec» was not available.
   WHAT WAS TAKEN OUT FIRST, so the 5 s is what is left after paying:
     · the spec no longer opens a second page (`app.freshPage()`): tests/r209.spec.js ① already
       asserts «not in the boot bundle» for every deferred module, and #R347 put both of its
       modules in that list, so it was a whole boot for a fact already covered;
     · the source-level half of that check moved to tests/r347-checks.test.mjs ㋕ (Node, free);
     · six route requests to the public OSRM demo became one (the file is serial, the page is
       worker-scoped, so the first plan is reused — also politer to a server that asks for at
       most one request a second);
     · eight tests became seven: the nav-route structure is asserted inside the drive that has to
       build it anyway, not in a test of its own.
   Measured 14.3 s here against tests/r209.spec.js's 27.0 s under identical conditions; r209 is
   recorded as 10 s, so 5 s is that ratio. ⚠ The corpus is not this machine's wall clock — it must
   be calibrated, not copied, and a future round re-measuring on CI should correct it. */
const HISTORY = [
  ['#R354', 4892, "the submarine-cable round added tests/r354.spec.js (+8 s, gate: switch the cable row on and read the eleven paint/layout properties the brief forbids changing) and tests/r354-cables.spec.js (+31 s, nightly: the first-visit boot, OFF->ON->OFF->ON, the layer audit, the two click popups, and a load with data/subcables.json blocked). Paid for by re-measuring tests/r186.spec.js, which carried 315 s: all twelve of its tests now pass in 110.7 s of test time / 2.5 min of wall clock, and the entry is set to the conservative WALL figure of 150. Core 64 -> 50, total 5,024 -> 4,898."],
  ['#R353', 5024, 'Volcano Intelligence added TWO specs and the suite still went down. tests/r353.spec.js (+5 s) is the gate half — it opens the intelligence card and switches the four colour modes with NOTHING answering on the network; the three claims that DO need USGS, the Smithsonian relay and an ArcGIS service are tests/r353-live.spec.js (+6 s, deep). ⚠ BOTH WERE PAID FOR OUT OF STALE-HIGH ENTRIES, NOT OUT OF THE CEILING: internal-qa 22 -> 10 (measured 0.5 s; it boots once for three tests now) and r184-routing 40 -> 30 (measured 16.4 s; 30 is #R210s own arithmetic before it was rounded up, and #R337 and #R341 both named this entry as stale-high and untouched). ⚠ NOT USED FOR PAYMENT: the same run measured smoke at 66.5 s against an entry of 8, which is why a single local number is never written straight into this table.'],
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
