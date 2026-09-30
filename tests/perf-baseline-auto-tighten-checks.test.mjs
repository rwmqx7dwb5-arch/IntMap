/* ============================================================================
 *  IntMap · the start-up budget's ceilings are lowered by main's CI, not by every pull request
 *  (scripts/perf-budget.mjs, .github/workflows/perf-ceiling.yml, .github/actions/land-bot-pr,
 *   the `build` job of .github/workflows/ci.yml)
 * ----------------------------------------------------------------------------
 *  Measured 2026-09-30: tests/perf-baseline.json was the conflict of four to five parallel pull
 *  requests in one day. The gate failed an eager IMPROVEMENT past 4 % and any change of the two
 *  counts, so every pull request that touched the start-up graph — in either direction — rewrote
 *  the file, and `--update` rewrote every row, so two pull requests that each changed one row still
 *  collided on all of them.
 *
 *  The rule now:
 *    · a pull request fails ONLY when a row grows past ceiling + band (counts: band 0);
 *    · `--update` (raise) writes only the rows that are over;
 *    · main's CI (tighten) lowers every ceiling main fell below, never raises, and lands it.
 *  ⚠ A ratchet that only closes on main must not become a ratchet that never closes: ⑥ states the
 *    bound on the headroom as a number, and ⑧ holds the wiring that makes «main's CI» true.
 *
 *  EVALUATED: the policy functions are imported from the gate and driven with a synthetic BUILD
 *  REPORT (the shape scripts/build-report.mjs writes) and a dist/ directory written here, through
 *  the same measureFrom() the gate uses — not with numbers typed into the shape the policy reads.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { band, judge, limit, measureFrom, metrics, raise, tighten } from '../scripts/perf-budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

/* A build report in the shape scripts/build-report.mjs writes: chunks keyed by hashed filename,
   the async list naming them, the eager totals with css nested. Two files share a chunk NAME, as
   happens when Rolldown splits a name twice — the gate keeps the larger. */
function report(over = {}) {
  const chunks = {
    'assets/cesium-AAAA.js': { name: 'cesium', raw: 4_800_000 },
    'assets/atlas-console-BBBB.js': { name: 'atlas-console', raw: 700_000 },
    'assets/katex-CCCC.js': { name: 'katex', raw: 250_000 },
    'assets/katex-DDDD.js': { name: 'katex', raw: 9_000 },
    ...(over.chunks || {}),
  };
  for (const k of over.drop || []) delete chunks[k];
  return {
    eager: { raw: 4_000_000, gzip: 1_400_000, brotli: 1_100_000, requests: 9, modules: 291,
      css: { raw: 350_000, gzip: 57_000 }, ...(over.eager || {}) },
    async: { raw: 8_000_000, gzip: 2_500_000, chunks: Object.keys(chunks), ...(over.async || {}) },
    chunks,
  };
}
/* A dist/ directory with real files: the dist totals are measured by walking it, as the gate does. */
function withDist(sizes, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'perf-tighten-'));
  try {
    for (const [rel, n] of Object.entries(sizes)) {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), Buffer.alloc(n));
    }
    return fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const DIST = { 'index.html': 10_000, 'data/a.json': 600_000, 'assets/app.js': 300_000 };
const measured = (over, dist = DIST) => withDist(dist, (d) => measureFrom(report(over), d));
const BASE = measured({});
const errorsOf = (m, b = BASE) => judge(m, b).errors;

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① a pull request that shrinks, or moves inside the band, is green with the ceiling file untouched', () => {
  assert.equal(BASE.async.chunks.katex, 250_000, 'the report is read the way the gate reads it (larger of a shared name)');
  assert.deepEqual(BASE.dist, { total: 910_000, data: 600_000, assets: 300_000 }, 'dist/ is measured by walking it');
  const cases = {
    'eager raw −20 %': { eager: { raw: 3_200_000 } },
    'one module fewer': { eager: { modules: 290 } },
    'one request fewer': { eager: { requests: 8 } },
    'eager raw +1 kB (churn)': { eager: { raw: 4_001_000 } },
    'a chunk gone': { drop: ['assets/atlas-console-BBBB.js'] },
    'a new chunk': { chunks: { 'assets/new-feature-EEEE.js': { name: 'new-feature', raw: 40_000 } } },
  };
  for (const [what, over] of Object.entries(cases)) {
    assert.deepEqual(errorsOf(measured(over)), [], `${what} must not fail the pull request`);
  }
  assert.deepEqual(errorsOf(measured({}, { ...DIST, 'data/a.json': 100_000 })), [], 'a smaller deploy is green');
  const n = judge(measured(cases['a new chunk']), BASE).notes.join('\n');
  assert.match(n, /new async chunk "new-feature".*main's CI records/, 'a new chunk is said, and left to main');
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
test('② growth past ceiling + band fails, in every kind of row — and exactly at the edge', () => {
  const grown = {
    'eager.raw': { eager: { raw: 4_100_000 } },
    'eager.modules': { eager: { modules: 292 } },
    'eager.requests': { eager: { requests: 10 } },
    'async.raw': { async: { raw: 8_200_000 } },
    'async chunk "cesium"': { chunks: { 'assets/cesium-AAAA.js': { name: 'cesium', raw: 4_900_000 } } },
  };
  for (const [what, over] of Object.entries(grown)) {
    const e = errorsOf(measured(over));
    assert.ok(e.some((s) => s.startsWith(what + ' grew')), `${what} growing past its band must fail: ${JSON.stringify(e)}`);
    assert.ok(e.every((s) => /--update/.test(s)), 'and the message names the decision a PR makes: raise it with --update');
  }
  assert.ok(errorsOf(measured({}, { ...DIST, 'data/a.json': 700_000 })).some((s) => s.startsWith('dist.data grew')));
  /* the edge: limit() is the largest value a pull request may reach undecided */
  const edge = limit('raw', BASE.eager.raw);
  assert.equal(edge, BASE.eager.raw + Math.max(2048, BASE.eager.raw * 0.005));
  assert.deepEqual(errorsOf(measured({ eager: { raw: edge } })), [], 'exactly the band is still churn');
  assert.equal(errorsOf(measured({ eager: { raw: edge + 1 } })).length, 1, 'one byte past it is a decision');
  assert.equal(band('modules', 291), 0, 'a count has no band');
  assert.equal(band('bytes', 100), 2048, 'a small chunk gets the absolute floor');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ tighten() never raises, and after it every ceiling equals the measurement it lowered to', () => {
  /* a deterministic walk over perturbations of every row, both directions, several sizes */
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 300; i++) {
    const m = JSON.parse(JSON.stringify(BASE));
    for (const x of metrics(m, BASE)) {
      if (x.v == null) continue;
      const f = 1 + (rnd() - 0.5) * (rnd() < 0.5 ? 0.02 : 0.4);
      const v = Math.max(0, Math.round(x.v * f));
      let t = m; for (const p of x.path.slice(0, -1)) t = t[p];
      t[x.path[x.path.length - 1]] = x.key === 'requests' || x.key === 'modules' ? Math.round(x.v + (rnd() - 0.5) * 4) : v;
    }
    const { due, baseline } = tighten(m, BASE);
    for (const x of metrics(m, BASE)) {
      let nb = baseline; for (const p of x.path) nb = nb == null ? nb : nb[p];
      if (x.ceil != null && nb != null) assert.ok(nb <= x.ceil, `${x.path.join('.')} was raised ${x.ceil} → ${nb}`);
    }
    if (due) {
      const after = judge(m, baseline);
      assert.deepEqual(after.loose, [], 'no ceiling is left above the tree it measured');
      /* rows that were OVER stay over: tightening is not a way to accept growth */
      assert.deepEqual(after.errors.map((s) => s.split(' grew')[0]).sort(), judge(m, BASE).errors.map((s) => s.split(' grew')[0]).sort());
    }
  }
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ tighten() proposes only when something is due — churn does not open a pull request per push', () => {
  const churn = measured({ eager: { raw: 3_999_000 }, async: { raw: 7_990_000 } });
  const r = tighten(churn, BASE);
  assert.equal(r.due, false, 'inside the band on every row is not due');
  assert.equal(r.baseline, BASE, 'and the baseline is handed back untouched (no write, no diff)');

  const fewer = tighten(measured({ eager: { modules: 290 } }), BASE);
  assert.equal(fewer.due, true, 'a count one lower is due at once');
  assert.equal(fewer.baseline.eager.modules, 290);

  const both = tighten(measured({ eager: { raw: 3_000_000, gzip: 1_399_000 } }), BASE);
  assert.equal(both.due, true);
  assert.equal(both.baseline.eager.raw, 3_000_000, 'the due row is lowered');
  assert.equal(both.baseline.eager.gzip, 1_399_000, 'and once proposing, an in-band row is lowered with it');

  const gone = tighten(measured({ drop: ['assets/atlas-console-BBBB.js'] }), BASE);
  assert.equal(gone.due, true);
  assert.ok(!('atlas-console' in gone.baseline.async.chunks), 'a gone chunk loses its row');

  const fresh = tighten(measured({ chunks: { 'assets/aaa-new-FFFF.js': { name: 'aaa-new', raw: 12_345 } } }), BASE);
  assert.equal(fresh.due, true);
  assert.equal(fresh.baseline.async.chunks['aaa-new'], 12_345, 'a new chunk gets its own ceiling');
  assert.deepEqual(Object.keys(fresh.baseline.async.chunks), Object.keys(fresh.baseline.async.chunks).sort(),
    'chunk rows stay in sorted order, so the bot\'s diff is the rows that moved and nothing else');
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ --update (raise) writes only the rows that are over — not the whole file', () => {
  const m = measured({ eager: { raw: 4_200_000, gzip: 1_300_000, modules: 293 } });
  const { baseline, changes } = raise(m, BASE);
  assert.deepEqual(changes.map((c) => c.what).sort(), ['eager.modules', 'eager.raw']);
  assert.equal(baseline.eager.raw, 4_200_000);
  assert.equal(baseline.eager.modules, 293);
  assert.equal(baseline.eager.gzip, BASE.eager.gzip, 'a row that fell is NOT lowered by the PR — that is main\'s write, and the conflict this removes');
  assert.deepEqual(errorsOf(m, baseline), [], 'after raising, the pull request is green');
  /* the whole-file rewrite is what made two PRs collide on rows neither changed */
  const untouched = JSON.stringify({ ...baseline, eager: { ...baseline.eager, raw: 0, modules: 0 } });
  assert.equal(untouched, JSON.stringify({ ...BASE, eager: { ...BASE.eager, raw: 0, modules: 0 } }), 'every other row is byte-identical');
});

/* ── ⑥ ─────────────────────────────────────────────────────────────────────── */
test('⑥ the slack is bounded and measured: at most one band above the tree once main has tightened', () => {
  /* judge() reports every ceiling above the build, in bands, and the growth each lets through
     undecided — the number «the ratchet went slack» would be. */
  const shrunk = measured({ eager: { raw: 3_000_000 } });
  const r = judge(shrunk, BASE);
  assert.ok(r.slackest && r.slackest.what === 'eager.raw' && r.slackest.bands > 1, 'the loosest row is named, in bands');
  assert.equal(r.slackest.undecided, BASE.eager.raw - 3_000_000 + band('raw', BASE.eager.raw),
    'what it lets grow undecided is its slack plus its band');
  /* not due ⇒ every row is within one band of the build; due ⇒ tighten() leaves zero. So after the
     bot has run on a main, no later pull request can grow any row by more than two bands without
     failing — the band it is allowed plus at most one band the bot left in place. */
  for (const m of [measured({ eager: { raw: 3_999_000 } }), measured({ eager: { raw: 3_000_000 } })]) {
    const t = tighten(m, BASE);
    const b = t.due ? t.baseline : BASE;
    for (const l of judge(m, b).loose) {
      assert.ok(l.by <= band(l.key, l.ceil), `${l.what} sits ${l.by} above the build after the bot ran (band ${band(l.key, l.ceil)})`);
      assert.ok(l.undecided <= 2 * band(l.key, l.ceil));
    }
  }
});

/* ── ⑦ ─────────────────────────────────────────────────────────────────────── */
test('⑦ the tracked baseline round-trips: tightening it against itself changes no byte', () => {
  const file = read('tests/perf-baseline.json');
  const b = JSON.parse(file);
  const r = tighten(b, b);
  assert.equal(r.due, false, 'a measurement equal to the ceilings is not due');
  assert.equal(JSON.stringify(r.baseline, null, 2) + '\n', file.replace(/\r\n/g, '\n'), 'and the file the bot would write is the file');
  assert.deepEqual(Object.keys(b.async.chunks), Object.keys(b.async.chunks).sort(), 'the tracked chunk rows are sorted, as tighten() writes them');
});

/* ── ⑧ ─────────────────────────────────────────────────────────────────────── */
/* 綴りのまま（一部）: 対象は GitHub が走らせる workflow。YAML は構造として読み、run: の中身だけを綴りで確かめる */
test('⑧ «main\'s CI lowers it» is wired: every push to main is measured, tightened and landed on the main it measured', () => {
  const ci = load(read('.github/workflows/ci.yml'));
  const pc = load(read('.github/workflows/perf-ceiling.yml'));
  const act = load(read('.github/actions/land-bot-pr/action.yml'));

  /* the trigger: every completed CI run on main — the bot's period is one push, not a schedule */
  const on = pc.on || pc[true];
  assert.deepEqual(on.workflow_run.workflows, [ci.name], 'woken by the workflow ci.yml names itself');
  assert.deepEqual(on.workflow_run.types, ['completed']);
  assert.deepEqual(on.workflow_run.branches, ['main']);
  assert.ok(!on.schedule, 'not a schedule: the bound is one push-to-main cycle');
  assert.equal(pc.concurrency['cancel-in-progress'], true, 'a newer main supersedes an older measurement');
  const job = pc.jobs.tighten;
  assert.match(job.if, /workflow_run\.event == 'push'/, 'a pull request\'s run measures a tree that is not main');

  /* the measurement: produced by ci.yml's build job on a push to main, under the name the bot downloads */
  const bsteps = ci.jobs.build.steps;
  const rep = bsteps.find((s) => /perf-budget\.mjs --report > perf-measured\.json/.test(s.run || ''));
  assert.ok(rep, 'the build job writes the measurement of its own build');
  const up = bsteps.find((s) => /^actions\/upload-artifact@/.test(s.uses || '') && s.with.path === 'perf-measured.json');
  assert.ok(up && /^perf-measured-/.test(up.with.name), 'and uploads it');
  for (const s of [rep, up]) assert.match(s.if, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/, 'on a push to main only');
  const dl = job.steps.find((s) => /^actions\/download-artifact@/.test(s.uses || ''));
  assert.equal(dl.with.pattern, 'perf-measured-*', 'the bot downloads the name the build uploads');
  assert.match(dl.with['run-id'], /workflow_run\.id/, 'from the run that woke it');

  /* the write: tighten only, from that measurement — never --update */
  const runs = job.steps.map((s) => s.run || '').join('\n');
  assert.match(runs, /perf-budget\.mjs --tighten --measured/);
  assert.ok(!/perf-budget\.mjs --update/.test(runs), 'the bot never raises');
  assert.match(runs, /git add tests\/perf-baseline\.json/, 'and commits the ceiling file alone');

  /* the landing: the shared lander, which must not merge onto a main it did not measure */
  const land = job.steps.find((s) => s.uses === './.github/actions/land-bot-pr');
  assert.ok(land, 'landed by the lander tle-refresh.yml uses — not a copy of it');
  assert.equal(String(land.with['require-current']), 'true');
  assert.ok(act.inputs['require-current'], 'the lander declares the input');
  const body = act.runs.steps.map((s) => s.run || '').join('\n');
  assert.match(body, /REQUIRE_CURRENT" = "true" \] && ! current; then[\s\S]*?finish superseded/,
    'after the checks pass, a moved main stops the merge');
  assert.match(body, /gh pr merge "\$PR" --squash --delete-branch=false --match-head-commit "\$SHA"/, 'and it merges exactly the head it checked');
});
