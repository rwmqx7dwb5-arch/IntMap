/* ============================================================================
 *  IntMap · CI SHARD PLANNER — partition the browser suite by MEASURED TIME  (#R195)
 * ----------------------------------------------------------------------------
 *  「いやじゃあ待ち時間をどうにかしろや」「今回だけで終わるな。そもそもの構造をどうにかしろ」
 *
 *  THE STRUCTURAL DEFECT, stated plainly: `playwright test --shard=i/n` splits by TEST COUNT, and a
 *  shard's DURATION has nothing to do with its test count. This suite's specs range from 2 s to
 *  689 s. So every round, one machine drew the heavy tests and became the whole pipeline's
 *  wall-clock, and the fix each time was for a human to NOTICE a heavy family and carve it into its
 *  own suite by regex — #R186 did that for `-cesium`, and #R195 was about to do it again for the
 *  flight-sim specs. That is not a fix; it is a subscription. The next slow spec restarts it, and
 *  nobody finds out until a shard times out.
 *
 *  Measured on the two CI runs this was written from (43 spec files, 109 minutes of serial time):
 *      r179 689 s · r174 651 s · r182-cesium 650 s · r177 515 s · r171 424 s · r173 377 s
 *      … and a long tail of specs under 30 s.
 *  On that run the shards came out 2m11, 2m20, 7m14, 8m51, 11m17 and **35m58**. Six machines
 *  finished half an hour before the seventh, and the seventh decided when CI was done.
 *
 *  So the partition is computed from the times themselves. `tests/durations.json` holds the measured
 *  seconds per spec FILE; this script packs the files into N groups with longest-processing-time-first
 *  greedy bin-packing (LPT — provably within 4/3 of the optimal makespan, and far better than that in
 *  practice on a distribution like this one). A spec with no recorded time is charged the MEDIAN, so a
 *  newly added file is never silently treated as free.
 *
 *  Two pools, because one property really is per-file rather than per-time: some specs only pass with
 *  the machine to themselves (#R186 measured this for Cesium — contention is what they fail on). That
 *  is expressed as DATA in tests/durations.json (`"solo": [...]`), not as another regex in the config.
 *
 *  USAGE
 *    node scripts/shard-plan.mjs --pool rest   --group 2 --of 5   # spec paths for that group
 *    node scripts/shard-plan.mjs --pool cesium --group 1 --of 3
 *    node scripts/shard-plan.mjs --plan                            # the whole plan, for humans
 *    node scripts/shard-plan.mjs --update <junit.xml…>             # refresh the measured times
 *
 *  REFRESHING THE TIMES is deliberately a separate, explicit step (`--update`, fed by the JUnit XML
 *  CI already writes). A plan that silently rewrote itself on every run would make a slow spec
 *  invisible again — the whole point is that the numbers are checked in, diffable, and reviewed.
 * ==========================================================================*/
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
/* (#R203) the core/deep split, read from the same table as the times (see scripts/tiers.mjs). */
import { inTier, NEVER } from './tiers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUR = join(ROOT, 'tests', 'durations.json');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes(k);

function load() {
  const raw = existsSync(DUR) ? JSON.parse(readFileSync(DUR, 'utf8')) : {};
  const solo = raw.solo || [];
  const times = {};
  for (const [k, v] of Object.entries(raw)) if (k !== 'solo' && typeof v === 'number') times[k] = v;
  /* per-TEST times come from main's own baseline (scripts/baseline.mjs) — the same record that
     answers "does this fail on main too". One measurement, two uses. */
  const BL = join(ROOT, 'tests', 'baseline.json');
  const perTest = existsSync(BL) ? (JSON.parse(readFileSync(BL, 'utf8')).tests || {}) : {};
  return { times, solo, perTest };
}

/* every spec that exists IN THE REQUESTED TIER, so a file added without a measurement still gets
   scheduled. `--tier` defaults to core: the plan a PR is gated on. */
const TIER = (() => { const v = String(arg('--tier', 'core')).toLowerCase();
  return (v === 'deep' || v === 'all') ? v : 'core'; })();
function specs() {
  return readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.spec.js') && !NEVER.some((r) => r.test(f)))
    .map((f) => 'tests/' + f)
    .filter((f) => inTier(f, TIER));
}

function isSolo(file, solo) { return solo.some((p) => new RegExp(p).test(file)); }

/* LPT: sort by cost descending, put each item on the currently lightest machine. */
function pack(items, n) {
  const groups = Array.from({ length: n }, () => ({ files: [], cost: 0 }));
  for (const it of [...items].sort((a, b) => b.cost - a.cost)) {
    const g = groups.reduce((m, x) => (x.cost < m.cost ? x : m), groups[0]);
    g.files.push(it.file); g.cost += it.cost;
  }
  return groups;
}

/* ══ SPLITTING THE FILES THAT ARE THEMSELVES THE FLOOR ══════════════════════════════════════════
   Packing whole files bounds CI below by the LARGEST FILE, and measured on main that is
   tests/r174.spec.js at 651 s — three of its nine tests are 294 s, 150 s and 120 s. No number of
   machines goes under that while the file is the unit. Playwright takes `file:line` on the command
   line, and tests/baseline.json records each test's own time, so a file that is bigger than the
   target is expanded into its tests and they spread.

   ⚠ A LINE NUMBER IS NOT A STABLE NAME. Editing a spec moves its tests, and asking for a line that
   no longer starts a test is "no tests found" — a job that passes without running anything. So every
   expanded id is CHECKED against the file's current `test(` lines, and any file whose lines no longer
   agree falls back to being scheduled whole. Being slow is recoverable; silently running nothing is
   not. */
/* the lines that START A TEST — `test.describe(` is a group, not a test, and counting it made every
   file look like it had one more test than the baseline knew, so nothing ever expanded */
function testLinesOf(file) {
  const src = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const at = new Set();
  for (let i = 0; i < src.length; i++) {
    const l = src[i];
    if (/^\s*test\s*\(/.test(l) || /^\s*test\.(only|skip|fixme|fail|slow)\s*\(/.test(l)) at.add(i + 1);
  }
  return at;
}

function expand(file, perTest) {
  const ids = Object.keys(perTest).filter((k) => k.startsWith(file + ':'));
  if (ids.length < 2) return null;
  const lines = testLinesOf(file);
  const idLines = new Set();
  const items = [];
  for (const id of ids) {
    const line = +id.slice(file.length + 1).split(':')[0];
    if (!lines.has(line)) return null;                 /* the file moved — schedule it whole */
    idLines.add(line);
    items.push({ file: `${file}:${line}`, cost: perTest[id].time || 0 });
  }
  /* …and every test the file declares TODAY must be covered, or some would never run at all */
  for (const l of lines) if (!idLines.has(l)) return null;
  return items;
}

function plan(pool, n) {
  const { times, solo, perTest } = load();
  const all = specs();
  const known = Object.values(times).filter((v) => v > 0).sort((a, b) => a - b);
  /* ══ (#R196) AN UNMEASURED FILE IS CHARGED THE 75th PERCENTILE, NOT THE MEDIAN ══════════════
     #R195's rule was that a new spec is "never silently treated as free", and the median delivered
     that. It is still a GUESS, and the guess is optimistic by construction: half of the measured
     files are heavier than it. Measured this round — tests/r196.spec.js really costs 174 s and was
     charged 78, so it landed on the group that already held r186 (317 s) and r192 (98 s), and the
     job failed on a test whose margin that contention ate. The p75 is still cheap when the new file
     turns out to be small and no longer under-books a heavy one; and the stderr notice below means
     nobody has to infer from a red job that a spec was never measured. */
  const median = known.length ? known[Math.min(known.length - 1, Math.floor(known.length * 0.75))] : 30;
  const mine = all.filter((f) => (pool === 'cesium') === isSolo(f, solo));
  const unmeasured = mine.filter((f) => times[f] == null);
  if (unmeasured.length) console.error(`shard-plan: ${unmeasured.length} spec(s) have no measured time and are charged ${median}s each — refresh with --update: ${unmeasured.join(', ')}`);
  /* a solo pool runs one worker, so its wall-clock IS its serial time; the rest run two */
  const div = pool === 'cesium' ? 1 : 2;
  const total = mine.reduce((a, f) => a + (times[f] == null ? median : times[f]), 0) / div;
  const target = total / n;
  const items = [];
  for (const f of mine) {
    const cost = (times[f] == null ? median : times[f]) / div;
    /* only the files that are themselves over the target are worth expanding — every extra argument
       is another chance for a line to drift, and the small files are already spread fine */
    const parts = cost > target ? (() => { try { return expand(f, perTest); } catch (_) { return null; } })() : null;
    /* ⚠ (#R201) SAY SO WHEN A FILE THAT SHOULD SPLIT CANNOT. `expand` refuses whenever the baseline's
       line numbers no longer match the file — which is right (running nothing is worse than running
       slowly) — but it refuses SILENTLY, and the only symptom is that CI's wall clock doubles. It
       happened in this round: editing tests/r182-cesium.spec.js by five lines moved every test in it,
       and the cesium pool went straight back to 639 s in one group. The fix is to remap
       tests/baseline.json (the titles are stable even when the lines are not); the point of this line
       is that nobody has to work that out from a slow job. */
    if (!parts && cost > target)
      console.error(`shard-plan: ${f} is ${Math.round(cost)}s against a ${Math.round(target)}s target but cannot be split by test — tests/baseline.json's line numbers no longer match the file. Remap it (or refresh it from a main run) or this pool's wall clock is this file.`);
    if (parts) for (const p of parts) items.push({ file: p.file, cost: p.cost / div });
    else items.push({ file: f, cost });
  }
  return pack(items, n);
}

/* ══ (#R202) THE TABLE FINALLY HAS A WRITER ═════════════════════════════════════════════════════
   「毎回毎回、テストに時間がかかりすぎ。いい加減にしろ。」
   ci.yml has run `--update` on main since #R195 and uploaded the result as an artifact, next to a
   comment saying "Both are committed by the job below". #R201 went looking for that job: THERE IS
   NO SUCH JOB. Nothing has ever written tests/durations.json back to the repository, so the packing
   has been done from whatever timings a human last pasted in — and by #R201 two of the eight `rest`
   groups were planned at 254 s and actually took 695 s, which is the whole of the wall clock this
   instruction is about. `--merge` is the missing half: it takes the twelve per-shard fragments the
   run already produces and unions them, and the job that calls it commits the result. */
if (has('--merge')) {
  const files = process.argv.slice(process.argv.indexOf('--merge') + 1).filter((a) => !a.startsWith('--'));
  const raw = existsSync(DUR) ? JSON.parse(readFileSync(DUR, 'utf8')) : {};
  const acc = {};
  let read = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    let j = null;
    try { j = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { continue; }
    read++;
    for (const [k, v] of Object.entries(j)) {
      if (k === 'solo' || typeof v !== 'number') continue;
      /* a file can only appear in one shard, so a collision means one of the fragments is stale —
         the LARGER number is the safe one to plan with (it can only make a group shorter) */
      acc[k] = Math.max(acc[k] || 0, Math.round(v));
    }
  }
  if (!read || !Object.keys(acc).length) { console.error('shard-plan --merge: no fragments with timings'); process.exit(1); }
  /* ⚠ a fragment set that covers only part of the suite must not DELETE the rest of the table: an
     absent spec is charged p75 by plan(), which would silently re-open the packing defect above. */
  const kept = {};
  for (const [k, v] of Object.entries(raw)) if (k !== 'solo' && typeof v === 'number' && !(k in acc)) kept[k] = v;
  const out = { ...acc, ...kept, solo: raw.solo || [] };
  writeFileSync(DUR, JSON.stringify(out, null, 1) + '\n');
  console.log(`shard-plan: merged ${read} fragment(s) → ${Object.keys(acc).length} measured, ${Object.keys(kept).length} carried over`);
  process.exit(0);
}

if (has('--update')) {
  const files = process.argv.slice(process.argv.indexOf('--update') + 1).filter((a) => !a.startsWith('--'));
  const raw = existsSync(DUR) ? JSON.parse(readFileSync(DUR, 'utf8')) : {};
  const acc = {};
  for (const f of files) {
    const xml = readFileSync(f, 'utf8');
    /* JUnit from Playwright: <testcase name="…" classname="tests/x.spec.js:12:1 › …" time="3.4"> */
    for (const m of xml.matchAll(/classname="([^"]*?\.spec\.js)[^"]*"[^>]*?time="([\d.]+)"/g)) {
      /* ⚠ (#R201) NORMALISE THE KEY. Playwright writes the classname RELATIVE TO testDir, so what
         comes out of a CI junit is `r179.spec.js` while `specs()` — and therefore every lookup in
         plan() and every entry in the committed table — says `tests/r179.spec.js`. An `--update`
         that wrote the raw form produced a file in which NOTHING matched: every spec would be
         charged p75 and the packing would be a guess with a measurement sitting next to it.
         Measured on the twelve fragments of a real green main run, which is how this was found. */
      const key = m[1].startsWith('tests/') ? m[1] : 'tests/' + m[1].replace(/^\.?\//, '');
      acc[key] = (acc[key] || 0) + Math.round(+m[2]);
    }
  }
  if (!Object.keys(acc).length) { console.error('shard-plan --update: no testcase timings found'); process.exit(1); }
  const out = { ...acc, solo: raw.solo || [] };
  writeFileSync(DUR, JSON.stringify(out, null, 1) + '\n');
  console.log(`shard-plan: refreshed ${Object.keys(acc).length} file timings in tests/durations.json`);
  process.exit(0);
}

if (has('--plan')) {
  for (const pool of ['rest', 'cesium']) {
    const n = +arg(pool === 'cesium' ? '--cesium-of' : '--rest-of', pool === 'cesium' ? 3 : 5);
    console.log(`\n== ${pool} · ${n} groups ==`);
    plan(pool, n).forEach((g, i) => console.log(
      String(i + 1).padStart(2), `~${String(Math.round(g.cost)).padStart(4)}s `,
      g.files.map((f) => f.replace('tests/', '')).join(' ')));
  }
  process.exit(0);
}

const pool = arg('--pool', 'rest');
const group = +arg('--group', 1), of = +arg('--of', 5);
const g = plan(pool, of)[group - 1];
if (!g) { console.error(`shard-plan: no group ${group} of ${of}`); process.exit(1); }
/* an empty group would make `playwright test` run EVERYTHING — say so and fail instead */
if (!g.files.length) { console.error(`shard-plan: group ${group}/${of} of pool ${pool} is empty`); process.exit(1); }
process.stdout.write(g.files.join(' '));
