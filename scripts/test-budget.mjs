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
const BUDGET_S = 5200;                  /* 86.7 min — measured 85.7, headroom 1.0 min */
const HISTORY = [
  ['#R197', 5200, 'the viewpoint sweep merged out of r172/r173/r176/r177/r178 into r179 (−21.4 min), and nine specs that were CHARGED p75 were measured instead (−11.7 min of pure fiction)'],
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

let total = 0;
const rows = [];
for (const s of specs) {
  const known = typeof dur[s] === 'number' && isFinite(dur[s]);
  const t = known ? dur[s] : p75;
  total += t;
  rows.push({ spec: s, t, known });
}
const unmeasured = rows.filter(r => !r.known);

if (process.argv.includes('--report')) {
  rows.sort((a, b) => b.t - a.t);
  process.stdout.write('spec                                    time    share\n');
  for (const r of rows) {
    process.stdout.write(r.spec.padEnd(40) + String(r.t).padStart(5) + 's'
      + (100 * r.t / total).toFixed(1).padStart(7) + '%' + (r.known ? '' : '   (unmeasured — charged p75)') + '\n');
  }
  process.stdout.write('\ntotal ' + (total / 60).toFixed(1) + ' min over ' + rows.length + ' specs; budget '
    + (BUDGET_S / 60).toFixed(1) + ' min\n');
  process.exit(0);
}

process.stdout.write('test budget: ' + (total / 60).toFixed(1) + ' min over ' + rows.length + ' specs'
  + (unmeasured.length ? (' (' + unmeasured.length + ' unmeasured, charged p75 = ' + p75 + 's each)') : '')
  + ' — ceiling ' + (BUDGET_S / 60).toFixed(1) + ' min\n');

if (total > BUDGET_S) {
  process.stderr.write('\n✗ THE TEST SUITE IS OVER ITS CEILING by ' + ((total - BUDGET_S) / 60).toFixed(1) + ' min.\n'
    + '  Do not raise BUDGET_S. Take the time out instead — `node scripts/test-budget.mjs --report`\n'
    + '  shows where it is, and #R197 is the worked example: five files were sweeping one invariant.\n'
    + '  The last change: ' + HISTORY[HISTORY.length - 1].join('  ') + '\n');
  process.exit(1);
}
if (total < BUDGET_S - 300) {
  process.stderr.write('\n✗ THE CEILING IS STALE: the suite is ' + ((BUDGET_S - total) / 60).toFixed(1)
    + ' min under it. Lower BUDGET_S to ' + Math.ceil((total + 60) / 60) * 60 + ' and record why in HISTORY.\n'
    + '  A ceiling that is not tracking the floor has stopped asserting anything (#R194).\n');
  process.exit(1);
}
process.stdout.write('✓ test budget OK\n');
