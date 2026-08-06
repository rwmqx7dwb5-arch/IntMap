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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DUR = join(ROOT, 'tests', 'durations.json');

/* Specs that never take part in a sharded browser run (see playwright.config.js for each one). */
const NEVER = [/^prod-smoke\.spec\.js$/, /^r184-imagery-profile\.spec\.js$/];

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

/* every spec that exists, so a file added without a measurement still gets scheduled */
function specs() {
  return readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.spec.js') && !NEVER.some((r) => r.test(f)))
    .map((f) => 'tests/' + f);
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
  const median = known.length ? known[known.length >> 1] : 30;
  const mine = all.filter((f) => (pool === 'cesium') === isSolo(f, solo));
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
    if (parts) for (const p of parts) items.push({ file: p.file, cost: p.cost / div });
    else items.push({ file: f, cost });
  }
  return pack(items, n);
}

if (has('--update')) {
  const files = process.argv.slice(process.argv.indexOf('--update') + 1).filter((a) => !a.startsWith('--'));
  const raw = existsSync(DUR) ? JSON.parse(readFileSync(DUR, 'utf8')) : {};
  const acc = {};
  for (const f of files) {
    const xml = readFileSync(f, 'utf8');
    /* JUnit from Playwright: <testcase name="…" classname="tests/x.spec.js:12:1 › …" time="3.4"> */
    for (const m of xml.matchAll(/classname="([^"]*?\.spec\.js)[^"]*"[^>]*?time="([\d.]+)"/g)) {
      acc[m[1]] = (acc[m[1]] || 0) + Math.round(+m[2]);
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
