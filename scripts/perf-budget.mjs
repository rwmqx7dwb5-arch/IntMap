/* ============================================================================
 *  IntMap · THE STARTUP BUDGET  (#R311)
 * ----------------------------------------------------------------------------
 *  「現在のCIでは、3,000KB超chunkを検出しても成功扱いになる構成があります。」 — measured, and true:
 *  before this file the ONLY thing CI weighed was TEST TIME (scripts/test-budget.mjs). Not one byte
 *  of the deploy was under a gate. `vite build` printed «Some chunks are larger than 3000 kB» on
 *  every single run and exited 0, which is the same as printing nothing.
 *
 *  ── WHY IT IS NOT "ONE NUMBER FOR THE BIGGEST CHUNK" ───────────────────────────────────────────
 *  「async chunkは、大きいこと自体を即失敗条件にしないでください。」 The largest chunk in this repo is
 *  Cesium at 4.7 MB and a MapLibre session never asks for it. A gate that failed on "biggest chunk"
 *  would be loudest about the one number that costs a default session nothing, and silent about a
 *  hundred kilobytes moving INTO the entry — which is the only thing that actually slows start-up.
 *  So the two halves are weighed separately, out of the graph Rollup finished with
 *  (scripts/build-report.mjs):
 *
 *    EAGER — a RATCHET IN BOTH DIRECTIONS. Over the ceiling is a regression and fails. More than a
 *            little UNDER it is also a failure, saying so and telling you to run --update: a ceiling
 *            that does not follow the measurement stops asserting anything (#R194's rule for the
 *            test-time budget, applied to bytes). This is the half this round exists to shrink, and
 *            a ratchet is what stops it drifting back up one round at a time.
 *    ASYNC — a CEILING ONLY. It may shrink freely and no one has to touch this file; it may not grow
 *            past the ceiling without someone deciding to raise it. Per-chunk as well as in total,
 *            so a heavy feature cannot double while the total hides it behind another that shrank.
 *
 *  ── AND BOTH raw AND gzip, BECAUSE THEY ARE DIFFERENT COSTS ────────────────────────────────────
 *  「gzipだけ見てraw parse負荷を無視する / rawだけ見て転送量を無視する」 are both listed as forbidden.
 *  gzip and brotli are what the network costs; raw is what the parser and compiler cost, and on a
 *  phone that second number is the one that shows up as a frozen screen. Both are gated.
 *
 *  ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────────────────────────
 *  First map pixel, interaction-ready, long tasks and heap are NOT in this gate. They need a browser
 *  and they are genuinely noisy, and a flaky gate in front of every push teaches people to re-run it
 *  rather than to read it. 「毎回重すぎる場合は軽量gateと定期full profileを分ける」 — so the bytes
 *  (deterministic: same tree, same numbers) stand in front of every push, and the runtime numbers are
 *  measured by scripts/frame-profile.mjs on the nightly deep tier, where a slow run costs nobody a
 *  merge. docs/TESTING.md says which is which.
 *
 *  USAGE
 *    node scripts/perf-budget.mjs            check .perf/build-report.json against the baseline
 *    node scripts/perf-budget.mjs --report   print the table without judging
 *    node scripts/perf-budget.mjs --update   write the measurement back as the new baseline
 * ==========================================================================*/
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = join(ROOT, '.perf', 'build-report.json');
const BASELINE = join(ROOT, 'tests', 'perf-baseline.json');
const DIST = join(ROOT, 'dist');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

/* ── tolerances ────────────────────────────────────────────────────────────
   A build is deterministic — the same tree produces the same bytes — so there is no measurement
   noise to absorb here and the slack is not for noise. It is for CHURN: a comment, a renamed
   variable or a minifier bump moves a few hundred bytes, and a gate that fired on that would be
   edited to be ignored within a month. Anything past it is a decision someone made. */
const GROW = { rel: 0.005, abs: 2048 };     /* fail above ceiling × 1.005, or +2 kB, whichever is larger */
const STALE = { rel: 0.04, abs: 16384 };    /* eager only: fail if the ceiling has drifted 4 % / 16 kB above reality */
/* ⚠ …AND TWO OF THE METRICS ARE NOT MEASURED IN BYTES. `requests` (6) and `modules` (275) are
   counts, and a byte-sized slack swallows them whole: 6 > 6 + max(2048, 0.03) is false for every
   value a count can take, so both rows would have sat in the table looking gated while being
   incapable of failing — the exact shape of defect #R301 found in two whole suites. They get an
   EXACT match instead, which is the right rule for them anyway: a count is deterministic, and a
   module entering or leaving the eager graph is precisely the event this budget exists to notice. */
const COUNTS = new Set(['requests', 'modules']);
const slack = (k, s) => (COUNTS.has(String(k).trim()) ? { rel: 0, abs: 0 } : s);

function dirBytes(p) {
  let n = 0;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f); else n += statSync(f).size;
    }
  };
  if (existsSync(p)) walk(p);
  return n;
}

/* The measurement: the build graph plus what actually landed in dist/. The second half matters
   because the biggest thing this repo deploys is not JavaScript at all — data/ is 68 MB of the
   118 MB tree, and none of it passes through Rollup, so the build report cannot see it. */
function measure() {
  if (!existsSync(REPORT)) {
    console.error(`perf-budget: no build report at ${relative(ROOT, REPORT)} — run \`npm run build\` first.`);
    process.exit(1);
  }
  const r = JSON.parse(readFileSync(REPORT, 'utf8'));
  const asyncChunks = {};
  for (const f of r.async.chunks) {
    /* keyed by the chunk's NAME, not its hashed filename — the hash changes on every content
       change and a baseline keyed by it would be stale by construction. */
    const c = r.chunks[f];
    asyncChunks[c.name] = Math.max(asyncChunks[c.name] || 0, c.raw);
  }
  return {
    eager: {
      raw: r.eager.raw, gzip: r.eager.gzip, brotli: r.eager.brotli,
      requests: r.eager.requests, modules: r.eager.modules,
      cssRaw: r.eager.css.raw, cssGzip: r.eager.css.gzip,
    },
    async: { raw: r.async.raw, gzip: r.async.gzip, chunks: asyncChunks },
    dist: { total: dirBytes(DIST), data: dirBytes(join(DIST, 'data')), assets: dirBytes(join(DIST, 'assets')) },
  };
}

const kb = (n) => (n / 1024).toFixed(1) + ' kB';
/* ⚠ COUNTS ARE NOT BYTES. `requests` and `modules` are integers, and printing «6» as «0.0 kB»
   makes the one row that says how many round-trips a cold start costs unreadable. The label is
   trimmed before the test because the table indents nested rows. */
const fmt = (k, n) => { const t = String(k).trim(); return (t === 'requests' || t === 'modules') ? String(n) : kb(n); };

/* ── the policy, as a pure function ────────────────────────────────────────
   Exported so a test can drive it with synthetic numbers. A gate that is only ever exercised by
   the tree it guards has never been shown to FAIL, and this project has shipped several checks
   that were green because they asserted nothing (#R301 found two suites that had never run at
   all). tests/r311-checks.test.mjs feeds this both a regression and an improvement and requires
   an error from each. */
export function judge(m, b) {
  const errors = [], notes = [], rows = [];
  const over = (v, ceil, k) => { const g = slack(k, GROW); return v > ceil + Math.max(g.abs, ceil * g.rel); };
  const under = (v, ceil, k) => { const t = slack(k, STALE); return v < ceil - Math.max(t.abs, ceil * t.rel); };

  rows.push(['EAGER — ratchet (both ways)', null, null]);
  for (const k of Object.keys(b.eager)) {
    const v = m.eager[k], ceil = b.eager[k];
    rows.push(['  ' + k, v, ceil]);
    if (over(v, ceil, k)) errors.push(`eager.${k} grew: ${fmt(k, v)} > ceiling ${fmt(k, ceil)}. A startup cost that goes up needs a reason — say it, or take it back out. To accept it deliberately: node scripts/perf-budget.mjs --update`);
    else if (under(v, ceil, k)) errors.push(`eager.${k} IMPROVED to ${fmt(k, v)} but the ceiling still says ${fmt(k, ceil)} — a ceiling that does not follow the measurement asserts nothing. Lower it: node scripts/perf-budget.mjs --update`);
  }
  rows.push(['ASYNC — ceiling only (it may shrink freely)', null, null]);
  for (const k of ['raw', 'gzip']) {
    rows.push(['  ' + k, m.async[k], b.async[k]]);
    if (over(m.async[k], b.async[k], k)) errors.push(`async.${k} grew: ${fmt(k, m.async[k])} > ceiling ${fmt(k, b.async[k])}`);
  }
  for (const [name, ceil] of Object.entries(b.async.chunks || {})) {
    const v = m.async.chunks[name];
    if (v == null) { notes.push(`async chunk "${name}" is gone from the build — if that is deliberate, --update`); continue; }
    if (over(v, ceil, 'bytes')) errors.push(`async chunk "${name}" grew: ${kb(v)} > ceiling ${kb(ceil)}`);
  }
  for (const name of Object.keys(m.async.chunks)) {
    if (!(name in (b.async.chunks || {}))) notes.push(`new async chunk "${name}" (${kb(m.async.chunks[name])}) — not yet in the baseline; --update to record it`);
  }
  rows.push(['DEPLOY — ceiling only', null, null]);
  for (const k of ['total', 'data', 'assets']) {
    rows.push(['  dist.' + k, m.dist[k], b.dist[k]]);
    if (over(m.dist[k], b.dist[k], 'bytes')) errors.push(`dist.${k} grew: ${kb(m.dist[k])} > ceiling ${kb(b.dist[k])}`);
  }
  return { errors, notes, rows };
}

function main() {
  const m = measure();
  if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(m, null, 2) + '\n');
    console.log(`perf-budget: no baseline yet — wrote ${relative(ROOT, BASELINE)} from this build.`);
    return 0;
  }
  const b = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { errors, notes, rows } = judge(m, b);

  console.log('\nIntMap · startup budget                    measured        ceiling        Δ');
  console.log('  ───────────────────────────────────────────────────────────────────────────');
  for (const [label, v, ceil] of rows) {
    if (v == null) { console.log('  ' + label); continue; }
    const d = v - ceil;
    console.log(`  ${label.padEnd(26)}${fmt(label, v).padStart(12)}${fmt(label, ceil).padStart(15)}   ${d > 0 ? '+' : ''}${fmt(label, d)}`);
  }

  for (const n of notes) console.log(`\n  note: ${n}`);
  if (errors.length) {
    console.error('\nperf-budget FAILED:');
    for (const e of errors) console.error('  · ' + e);
    console.error('');
    return 1;
  }
  console.log('\nperf-budget: within budget.\n');
  return 0;
}

/* ⚠ guarded: tests/r311-checks.test.mjs imports judge() from this file, and an unguarded CLI would
   then run the whole gate — against whatever dist/ happened to be on disk — as a side effect of the
   import. Same shape as scripts/build-report.mjs. */
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (has('--update')) {
    const m = measure();
    writeFileSync(BASELINE, JSON.stringify(m, null, 2) + '\n');
    console.log(`perf-budget: baseline updated — ${relative(ROOT, BASELINE)}`);
    console.log(`  eager raw ${kb(m.eager.raw)} · gzip ${kb(m.eager.gzip)} · ${m.eager.requests} requests · ${m.eager.modules} modules`);
  } else if (has('--report')) {
    console.log(JSON.stringify(measure(), null, 2));
  } else {
    process.exit(main());
  }
}
