/* ============================================================================
 *  IntMap · the test tiers and shards still cover the whole suite, once
 * ----------------------------------------------------------------------------
 *  A suite that silently stops covering part of itself is green. Held here: `test:checks` DISCOVERS
 *  its files (#R529 — the hand list that left r210/r211 unrun for ninety rounds is gone), the
 *  regression shards partition it and really shard (#R586), the browser shard plan runs every
 *  spec exactly once and main's result is kept for attribution (#R195), the gate got cheaper
 *  without deleting anything and `npm test` runs its halves in parallel (#R205), and the 28+
 *  declared gates are planned onto CI machines as a partition (#R771). #R301 / #R390 are the
 *  rounds that found the un-run files, kept for their records.
 *
 *  Each block below was one round-numbered file until the tests were regrouped by subject. A block
 *  keeps that file's helpers private to it (a `{ … }` scope), so two rounds' `docFacts()` or
 *  `scenario()` cannot shadow each other; the helpers every block shared — ROOT, rd/read and the
 *  line-ending-tolerant anchor — are declared once above. Titles keep their round tag so a failure
 *  still names the round whose record explains it.
 *
 *  Was: tests/r529, r586, r195 ⑥⑦⑧, r205 ⑧, r771 (6)–(10), r301 ⑤⑦, r390
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs, { cpSync, existsSync, globSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import path, { basename, delimiter, dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { entries, entryText, latestEntry, renderIndex } from '../scripts/dev-notes.mjs';
import { allSpecs, CORE_ALWAYS, CORE_MAX_S, coreNames, fixedCoreNames, tierSpecs } from '../scripts/tiers.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { localCommands } from './helpers/ci-reach.mjs';
import { scratchTree } from './helpers/scratch-tree.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const read = rd;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R529 — was tests/r529-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  #R529 — the node tier is DISCOVERED, not listed
 * ----------------------------------------------------------------------------
 *  `test:checks` was one hand-written literal in package.json naming all 292 files, and three
 *  guards had been stacked on it because the literal kept finding new ways to be wrong:
 *
 *    #R301  a file left out of it never runs — so it is not a weaker test, it is not a test.
 *           tests/r210 and tests/r211 had never once been executed; five of r211's twelve
 *           assertions were red, the earliest broken ninety rounds before anybody looked.
 *    #R385  the list against ITSELF — it named tests/r356-checks.test.mjs twice for twenty-two
 *           green rounds, because the guard's first act was `new Set(listed)`.
 *    #R390  what counted as a test was read off the NAME, so tests/security-logic.mjs (31 tests,
 *           #R138) was outside anything the guard could demand, and sat unlisted for three rounds
 *           with every gate in the repository green.
 *
 *  Every one of those is a true finding about a list that did not have to exist. `node --test`
 *  finds test files itself, so this round deleted the literal, scripts/check-test-list.mjs (132
 *  lines), the `node-tests` rule in scripts/doc-facts.mjs, and the twelve assertions in other
 *  rounds' files that said «this file is in the list». MEASURED before and after: the set the glob
 *  discovers is the same 292 paths the literal named, with no difference in either direction.
 *
 *  ⚠ WHAT THESE CHECKS EXIST TO STOP:
 *   ① The literal coming back — a `tests/…` path re-appearing in the script, one round at a time.
 *   ② #R390's hazard outliving the list it was written against. The runner's idea of a test file
 *      is its NAME, so a `.mjs` under tests/ that imports `node:test` under any other name is
 *      invisible: it never runs, so it never fails and never passes. That is why
 *      tests/security-logic.mjs was RENAMED this round rather than special-cased a second time.
 *      ⚠ The question is asked of what each file CONTAINS, not of any spelling in the script —
 *      and the population that must NOT be demanded (helpers, fixtures, corpora) is shown to be
 *      non-empty, because a subset test over an empty universe passes by looking at nothing.
 *   ③ The declared floor drifting off the one the command needs. Node 20 SEARCHES DIRECTORIES and
 *      does not accept a glob; Node ≥21 globs and rejects a bare directory (measured here on
 *      24.18.0: `node --test tests` resolves the directory as a MODULE and fails). `engines` is
 *      the promise and `.nvmrc` is what CI installs, so they have to agree.
 * ==========================================================================*/

const pkg = () => JSON.parse(read('package.json'));
const posix = (p) => p.split(String.fromCharCode(92)).join('/');
/* the four spellings of the import, as scripts/check-test-list.mjs read them from #R390 until
   this round removed it — the rule has to hold for a file nobody has written yet */
const DECLARES_NODE_TESTS =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)['"]node:test['"]/m;

/* the pattern is read OUT of whatever runs it, never restated here: a check that carries its own
   copy of the glob would pass against a pattern nobody runs (#R500)

   ⚠ (#R621) IT FOLLOWS ONE DELEGATION NOW. `test:checks` used to be `node --test "<glob>"`, and CI
   sharded it with `npm run test:checks -- --test-shard=i/n` — which does not shard, because npm can
   only APPEND and node ignores an option that lands after the positional (measured: 155 tests with
   the flag in front, 441 with it behind, 441 with no flag at all). So the glob moved into
   scripts/test-checks.mjs, which puts arguments in front of it.
   ⚠ THE RULE #R529 WROTE IS UNCHANGED: ONE pattern, discovered, and no test file named anywhere.
   Only its address moved, and this reads it from the new address rather than from a copy. */
const patternInUse = () => {
  const s = pkg().scripts['test:checks'];
  let src, where;
  const direct = /^node --test (.+)$/.exec(s.trim());
  if (direct) { src = direct[1]; where = 'package.json test:checks'; }
  else {
    const via = /^node ([\w./-]+\.mjs)$/.exec(s.trim());
    assert.ok(via, 'test:checks neither starts the node runner nor delegates to a single runner script: ' + s);
    const runner = read(via[1]);
    /* the runner must hand the pattern to `node --test`, and hold exactly one */
    assert.match(runner, /'--test'/, via[1] + ' does not start the node test runner');
    const g = /export const GLOB = '([^']+)';/.exec(runner);
    assert.ok(g, via[1] + ' does not export a single GLOB — the file set must have one written home');
    src = '"' + g[1] + '"'; where = via[1] + ' GLOB';
  }
  const args = src.trim().split(/\s+/);
  assert.equal(args.length, 1,
    where + ' carries ' + args.length + ' arguments — one pattern, discovered, is the whole of #R529');
  assert.match(args[0], /^".+"$/,
    'the pattern is not double-quoted — an unquoted glob is expanded by some shells and passed through by others');
  return args[0].slice(1, -1);
};

/* ── ① the script discovers, and names no file ──────────────────────────────────────────────── */
test('#R529 ① test:checks carries one pattern, and no individual test file is named anywhere', () => {
  patternInUse();
  /* the failure this round removed: paths creeping back in one at a time. Asked of every script,
     because the literal was moved between them twice before it settled here. */
  for (const [key, v] of Object.entries(pkg().scripts)) {
    if (key.startsWith('//')) continue;                       /* the prose keys describe the history */
    const named = String(v).match(/tests\/r\d+[a-z]*-checks\.test\.mjs/g);
    assert.equal(named, null,
      `package.json scripts["${key}"] names ${named && named[0]} — a hand-maintained list of test files is coming back`);
  }
});

/* ── ② everything that declares tests is reached by the pattern the script actually uses ────── */
test('#R529 ② every .mjs under tests/ that declares node tests is discovered, and nothing else is demanded', () => {
  const discovered = new Set(globSync(patternInUse(), { cwd: ROOT }).map(posix));
  const all = globSync('tests/**/*.mjs', { cwd: ROOT }).map(posix);
  const declaring = all.filter((f) => DECLARES_NODE_TESTS.test(read(f)));

  assert.ok(discovered.size > 250,
    `only ${discovered.size} files discovered — the tier has been cut apart by a pattern change`);
  assert.ok(declaring.length > 250, `only ${declaring.length} files declare node tests — the evidence is missing, not the tests`);

  const invisible = declaring.filter((f) => !discovered.has(f));
  assert.deepEqual(invisible, [],
    'these import node:test but the runner never opens them, so they can be red for ever: ' + invisible.join(', '));

  /* ⚠ the population this rule must NOT demand has to be shown to exist, or the subset test above
     is satisfiable by a tests/ directory containing nothing but test files (#R521) */
  const others = all.filter((f) => !declaring.includes(f));
  assert.ok(others.length >= 3,
    `only ${others.length} .mjs under tests/ are helpers/fixtures/corpora — «not demanded» is being asserted over an empty set`);
  for (const f of others) {
    assert.ok(!discovered.has(f), `${f} declares no tests but the runner executes it as one`);
  }

  /* the file whose NAME was the exception until this round (#R390; 31 tests, #R138) */
  assert.ok(discovered.has('tests/security-logic.test.mjs'),
    'tests/security-logic.test.mjs is not discovered — the one file that needed a source rule is invisible again');
  assert.equal(pkg().scripts['test:security'], 'node --test tests/security-logic.test.mjs',
    'test:security still points at the old path');
});

/* ── ③ the declared floor is a version the command actually runs on ─────────────────────────── */
test('#R529 ③ engines and .nvmrc agree, and the floor is a version that globs', () => {
  const declared = pkg().engines.node;
  const m = declared.match(/^>=(\d+)$/);
  assert.ok(m, `engines.node is "${declared}" — this check reads a ">=N" floor`);
  const floor = Number(m[1]);
  const pinned = Number(read('.nvmrc').trim());
  assert.ok(Number.isInteger(pinned), '.nvmrc does not hold a major version');
  assert.equal(floor, pinned,
    `engines.node promises >=${floor} but .nvmrc installs ${pinned} — CI tests a version the declaration does not describe`);
  assert.ok(floor >= 21,
    `engines.node allows Node ${floor}, where \`node --test\` searches DIRECTORIES instead of globbing — test:checks would run nothing`);
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R586 — was tests/r586-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R586 — the regression suite runs as shards, and the shards still cover it
 * ----------------------------------------------------------------------------
 *  #R586 lifted `npm run test:checks` out of the «Static checks» job and gave it a matrix of its
 *  own. The saving is real (558 s of that job's 760 s, measured on job 102601448559), but a sharded
 *  suite has a failure mode a single step does not: a shard can go missing and everything stays
 *  green, because the files it held are simply never named. A suite that silently stops covering
 *  part of itself is the shape this repository has paid for repeatedly — so the covering is what is
 *  measured here, not the speed.
 * ==========================================================================*/

const CI = loadYaml(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));

test('#R586 ① the regression shards cover 1..n exactly once, for one n', () => {
  const job = CI.jobs.checks;
  assert.ok(job, 'the sharded regression job is gone — the suite may have quietly returned to one step');
  const legs = job.strategy.matrix.include;
  assert.ok(Array.isArray(legs) && legs.length > 1, 'a matrix with one leg is not a shard set');

  /* every leg must agree on how many shards there are — `--test-shard=2/3` and `--test-shard=3/4`
     in the same matrix would run some files twice and others never. */
  const ofs = [...new Set(legs.map((l) => l.of))];
  assert.deepEqual(ofs, [legs.length], `the legs disagree about the shard count (of=${ofs.join(',')} across ${legs.length} legs)`);

  const shards = legs.map((l) => l.shard).sort((a, b) => a - b);
  assert.deepEqual(shards, legs.map((_, i) => i + 1), `shards are ${shards.join(',')} — every index from 1 to ${legs.length} must appear exactly once`);
});

test('#R586 ② sharding actually SHARDS — measured through the shipped runner', () => {
  /* ⚠ THE FIRST VERSION OF THIS CHECK READ THE COMMAND AND BELIEVED IT. It asserted that the step
     carried a --test-shard argument built from the matrix — which it did — while the flag was being
     SILENTLY IGNORED: `npm run … --` can only APPEND, and node ignores an option that arrives after
     the positional. Three CI runners each ran the whole suite and the shard numbers in their names
     were decoration. Measured on Node 24.18 over tests/r5*-checks.test.mjs:
         --test-shard=1/3 BEFORE the glob → 155 tests
         --test-shard=1/3 AFTER  the glob → 441 tests   (= unsharded)
     So this asks the runner to shard something and COUNTS what came back.

     ⚠ It shards a handful of throwaway files rather than the real suite: sharding 3,510 tests three
     times to learn one arithmetic fact would cost half an hour, and the fact does not depend on
     which files they are. */
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-shard-'));
  try {
    for (let i = 0; i < 6; i++) {
      fs.writeFileSync(path.join(dir, 'p' + i + '.test.mjs'),
        "import test from 'node:test';\ntest('t" + i + "', () => {});\n");
    }
    const count = (args) => {
      const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test-checks.mjs')].concat(args), {
        cwd: ROOT, encoding: 'utf8',
        /* ⚠ NODE_TEST_CONTEXT MUST NOT REACH THE CHILD. The runner sets it, and a nested
           `node --test` that sees it switches to the v8-serialised child protocol — the probe then
           reads no counts at all and reports «blind» on a runner that is working perfectly. */
        env: (() => { const e = Object.assign({}, process.env, { IM_CHECKS_GLOB: path.join(dir, '*.test.mjs') });
          delete e.NODE_TEST_CONTEXT; return e; })(),
      });
      /* node's default reporter prints «ℹ pass N»; the TAP one prints «# pass N» — accept either */
      const m = /^(?:#|ℹ) pass (\d+)\s*$/m.exec(r.stdout || String(r.stderr || ""));
      return m ? Number(m[1]) : null;
    };
    const whole = count([]);
    assert.equal(whole, 6, 'the probe could not run its own fixtures (got ' + whole + ') — this check is blind, fix it rather than deleting it');
    const a = count(['--test-shard=1/2']);
    const b = count(['--test-shard=2/2']);
    assert.ok(a !== null && b !== null, 'a shard run produced no count');
    assert.ok(a < whole && b < whole,
      'sharding changed nothing: 1/2 saw ' + a + ', 2/2 saw ' + b + ', the whole is ' + whole + ' — the flag is being ignored');
    assert.equal(a + b, whole,
      'the halves are ' + a + ' + ' + b + ' = ' + (a + b) + ' but the whole is ' + whole + ' — shards must PARTITION the suite, not sample it');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('#R586 ②b the shard step delegates the file set to the one script that owns it', () => {
  const step = CI.jobs.checks.steps.find((s) => typeof s.run === 'string' && s.run.includes('test:checks'));
  assert.ok(step, 'no step in the sharded job runs test:checks');
  /* the file set is the npm script's; naming files here would make CI and `npm test` two lists */
  assert.match(step.run, /npm run test:checks --/, 'the shard step must delegate to the npm script, so the glob has one owner');
  assert.match(step.run, /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.of \}\}/, 'the shard argument must come from the matrix, not be written per leg');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['test:checks'], /scripts\/test-checks\.mjs/, 'test:checks must go through the runner that puts options in front of the glob');
});

test('#R586 ③ a required check names the whole suite, not one leg', () => {
  /* browser-gate exists for this reason and this job copies it: a matrix leg's NAME contains its
     shard numbers, so requiring «Regression 2/3» would silently stop being required the day the
     shard count changes. The aggregating job's name does not move. */
  const gate = CI.jobs['checks-gate'];
  assert.ok(gate, 'the aggregating gate is gone — the required check would have to name a matrix leg');
  assert.deepEqual(gate.needs, ['checks'], 'the gate must wait on the shard matrix');
  const run = gate.steps.map((s) => s.run || '').join('\n');
  assert.match(run, /needs\.checks\.result.*=.*"success"|test "\$\{\{ needs\.checks\.result \}\}" = "success"/s,
    'the gate must fail unless every shard succeeded — `always()` without that assertion is a gate that passes on failure');
  assert.equal(gate.if, '${{ always() }}', 'without always() the gate is skipped when a shard fails, and a skipped required check blocks nothing');
});

test('#R586 ④ the heavy step really left the Static checks job', () => {
  /* the whole point of the round. If it comes back, «Static checks» is 13 minutes again and the
     merge race this round exists to end is back with it. */
  const static_ = CI.jobs.static.steps.map((s) => s.run || '').join('\n');
  assert.doesNotMatch(static_, /npm run test:checks/, 'test:checks is back in the Static checks job');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R195 — was tests/r195-checks.test.mjs ⑥⑦⑧
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  R195 — the source-level invariants behind this round's four changes.
 *
 *  These are the claims a browser test cannot make cheaply: that a literal is
 *  written in exactly two places and they agree, that a moved body really moved,
 *  and that the one value a split module cannot inherit is handed to it.
 * ==========================================================================*/

/* ── ⑦ the CI plan covers every spec exactly once ─────────────────────────────────────────────── */
test('R195 ⑦: the measured shard plan runs every spec exactly once, and is balanced', () => {
  const ci = rd('.github/workflows/ci.yml');
  /* the group counts CI actually asks for — read them rather than assuming, so this test tracks
     the workflow instead of a copy of it */
  /* ⚠ (#R203) TWO TIERS NOW, AND THE PROPERTY IS ABOUT BOTH OF THEM TOGETHER. The gate runs the core
     tier and the nightly/on-demand job runs the deep one, so neither plan covers the suite on its
     own — but their UNION still must, exactly once, or a spec has quietly stopped running anywhere.
     The tiers and their group counts are read out of the workflow, so this tracks it rather than
     copying it: each `browser*` job states its tier once, in the `with:` line of the composite action. */
  const jobs = [];
  for (const m of ci.matchAll(/\{ suite: (\w+), shard: \d+, of: (\d+)(, allow-empty: '(true|false)')? \}/g)) {
    /* which job block is this matrix entry in? the nearest `tier: <x>` BELOW it in the file */
    const tier = (/with: \{ tier: (\w+),/.exec(ci.slice(m.index)) || [, 'core'])[1];
    if (!jobs.some((j) => j.tier === tier && j.pool === m[1])) jobs.push({ tier, pool: m[1], of: +m[2], allowEmpty: m[4] === 'true' });
  }
  assert.ok(jobs.some((j) => j.tier === 'core'), 'the core tier appears in the matrix');
  assert.ok(jobs.some((j) => j.tier === 'deep' && j.pool === 'cesium'), 'and the deep tier carries the solo pool');

  /* ⚠ (2026-09-25) THE PARTITION IS PLANNED WITH NO DIFF. The core tier also runs whatever the change
     touched (scripts/tiers.mjs changedSpecs), and those specs stay in the nightly too — so on a
     branch that edits a spec, «nothing runs twice» is false by design. IM_CHANGED_SPECS='' asks the
     planner for the fixed partition, which is what «every spec exactly once» is a claim about. */
  const run = (a) => execFileSync(process.execPath, [join(ROOT, 'scripts/shard-plan.mjs'), ...a],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, IM_CHANGED_SPECS: '' } });
  const seen = [];
  for (const j of jobs) {
    for (let g = 1; g <= j.of; g++) {
      const files = run(['--tier', j.tier, '--pool', j.pool, '--group', String(g), '--of', String(j.of),
        ...(j.allowEmpty ? ['--allow-empty'] : [])]).trim().split(/\s+/).filter(Boolean);
      /* a pool that may be empty is one whose content is the diff: with no diff it IS empty, and the
         action skips it rather than calling playwright with no paths (.github/actions/browser-tier) */
      if (j.allowEmpty) { assert.deepEqual(files, [], `${j.tier}/${j.pool} plans specs with no diff — it is not a diff-only pool`); continue; }
      assert.ok(files.length && files[0], `${j.tier}/${j.pool} group ${g} is not empty — an empty list makes ` +
        'playwright run the WHOLE suite, which reads as a very slow pass');
      seen.push(...files);
    }
  }
  /* ⚠ THE PROPERTY THAT MATTERS: nothing falls between the pools, and nothing runs twice. The old
     hand-split asserted this in a comment ("31 + 329 = 360"); it is checked now.
     An entry may be a whole file or one test of it (`tests/x.spec.js:233`) — a file over the target
     is expanded so its own tests can spread. Either way every spec must be represented. */
  const expected = readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.spec.js'))
    .filter((f) => !/^prod-smoke\.spec\.js$|^r184-imagery-profile\.spec\.js$/.test(f))
    .map((f) => 'tests/' + f).sort();
  const fileOf = (e) => e.replace(/:\d+$/, '');
  assert.deepEqual([...new Set(seen.map(fileOf))].sort(), expected,
    'every spec CI is meant to run appears in the plan');
  assert.equal(new Set(seen).size, seen.length, 'and nothing is scheduled twice');

  /* ⚠ AND AN EXPANDED FILE MUST BE EXPANDED COMPLETELY. Asking for `x.spec.js:233` runs that test
     and no other, so a file that is expanded but missing one of its tests loses it silently — the
     exact failure mode ("ran nothing, reported green") this whole mechanism must not have. */
  const expanded = new Set(seen.filter((e) => /:\d+$/.test(e)).map(fileOf));
  for (const f of expanded) {
    const src = readFileSync(join(ROOT, f), 'utf8').split('\n');
    const lines = src.reduce((a, l, i) => (/^\s*test(\.(only|skip|fixme|fail|slow))?\s*\(/.test(l) ? a.concat(i + 1) : a), []);
    const got = seen.filter((e) => fileOf(e) === f && /:\d+$/.test(e)).map((e) => +e.split(':').pop()).sort((a, b) => a - b);
    assert.deepEqual(got, lines.sort((a, b) => a - b),
      `${f} is expanded, so every one of its tests must appear — otherwise the missing ones never run`);
  }
});

test('R195 ⑦: a spec with no recorded time is scheduled, not treated as free', () => {
  const src = rd('scripts/shard-plan.mjs');
  assert.match(src, /times\[f\] == null \? median : times\[f\]/,
    'an unmeasured spec is charged the median — otherwise a new slow file is invisible to the plan');
  assert.match(src, /process\.exit\(1\)/, 'and an empty group is an error rather than "run everything"');
  /* the solo property is data, not another regex in the config */
  const dur = JSON.parse(rd('tests/durations.json'));
  assert.ok(Array.isArray(dur.solo) && dur.solo.length, 'tests/durations.json carries the solo list');
  assert.doesNotMatch(rd('playwright.config.js'), /IM_SUITE === 'flight'/,
    'the hand-carved flight suite is gone — the planner is what spreads those specs now');
});

/* ── ⑧ main's own result is kept, so attribution is a lookup and not a 12-minute experiment ───── */
test('R195 ⑧: a failure is classified against main without re-running main', () => {
  const base = JSON.parse(rd('tests/baseline.json'));
  assert.equal(base.ref, 'main', 'the baseline is main\'s, and says so');
  const n = Object.keys(base.tests || {}).length;
  assert.ok(n > 200, `the baseline covers the suite; it has ${n} entries`);
  /* the three outcomes must all be expressible — a run that only ever records "passed" would
     classify every real pre-existing failure as MINE and send the next round chasing itself */
  const kinds = new Set(Object.values(base.tests).map((t) => t.status));
  assert.ok(kinds.has('passed'), 'passes are recorded');
  assert.ok(kinds.has('flaky') || kinds.has('failed'),
    'and so is main failing — otherwise ALSO ON MAIN can never be the answer');

  const src = rd('scripts/baseline.mjs');
  assert.match(src, /b\.status === 'passed' \? 'MINE' : 'ALSO ON MAIN'/, 'the verdict rule');
  assert.match(src, /!b \? 'UNKNOWN'/, 'a test main never recorded is UNKNOWN, never someone else\'s problem');
  /* ⚠ only main may write it: a branch recording its own results would define its own "normal" */
  /* (#R203) the shard's own steps live in the composite action both browser jobs call */
  const act = rd('.github/actions/browser-tier/action.yml');
  assert.match(act, /if: \$\{\{ github\.ref == 'refs\/heads\/main' && !cancelled\(\) \}\}[\s\S]{0,200}?baseline\.mjs --update/,
    'the baseline is written only on main');
  assert.match(act, /if: \$\{\{ failure\(\) \}\}[\s\S]{0,200}?baseline\.mjs --classify/,
    'and a red PR job says which failures main does not have');
});

/* ── ⑥ the local worker count is written down, not remembered ─────────────────────────────────── */
test('R195 ⑥: a local run does not need a flag nobody can remember', () => {
  const cfg = rd('playwright.config.js');
  assert.match(cfg, /Number\(process\.env\.PW_WORKERS \|\| 2\)/,
    'the local default is 2 workers — this machine produces contention failures above that');
  assert.doesNotMatch(cfg, /workers: isCI \? \([^)]*\) : undefined/, 'the old implicit default is gone');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R205 — was tests/r205-checks.test.mjs ⑧
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ============================================================================
 *  IntMap · R205 source-level checks
 * ----------------------------------------------------------------------------
 *  Node tests, no browser. Every assertion is DERIVED from the source or RUN against it — #R203 and
 *  #R204 between them lost seven of their own pins by writing VALUES and FILE NAMES that the next
 *  round, moving in the same direction, had to change. So: relations, not literals; and where a
 *  number is unavoidable it is read out of the file that owns it.
 * ==========================================================================*/

/* ── ⑧ 「毎回毎回、テストに時間がかかりすぎ…簡易でいい」 ───────────────────────────────────── */
test('R205 ⑧ the gate is cheaper than the round before it, and nothing was deleted to do it', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.values(dur).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const p75 = times[Math.floor(times.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const fixedCore = tierSpecs('core', { fixed: true });
  const core = fixedCore.reduce((a, f) => a + cost(f), 0);
  /* ⚠ MEASURED files only for the comparison. An unmeasured spec is charged p75 by the budget, which
     is the right direction for a CEILING and the wrong quantity for "did the gate get cheaper" — a
     brand-new file would otherwise make any round look like a regression until CI has timed it. */
  const coreMeasured = fixedCore.filter((f) => typeof dur[f] === 'number').reduce((a, f) => a + dur[f], 0);
  assert.ok(CORE_MAX_S < 10, `the price was 10 s in #R204 and is ${CORE_MAX_S}`);
  assert.ok(coreMeasured < 173, `the gate's measured files come to ${coreMeasured}s and #R204 shipped 173 s`);
  assert.ok(fixedCore.length < 17, `${fixedCore.length} files in the gate; #R204 had 17`);
  /* ⚠ AND THE CHANGE'S OWN SPECS DO NOT STAY. It is the reason the gate does not grow a spec per
     round: what joins the gate for a PR is read from THAT PR's diff (scripts/tiers.mjs
     changedSpecs), so once it merges the next change's diff no longer holds it — the same
     self-demotion #R205 relied on, which is where 49 of #R204's 173 s went. With no diff the gate
     is the fixed set and nothing else. */
  const t = rd('scripts/tiers.mjs');
  const fn = /export function coreNames\([^)]*\)\s*\{[\s\S]{0,900}?\n\}/.exec(t);
  assert.ok(fn, 'coreNames was not found');
  assert.match(fn[0], /changedSpecs\(/, 'the gate no longer reads the diff');
  assert.deepEqual(coreNames({ IM_CHANGED_SPECS: '' }), fixedCoreNames(), 'with no diff the gate is exactly the fixed set');
  const roundSpecsInCore = fixedCoreNames().filter((n) => /^r\d+/.test(n) && !CORE_ALWAYS.includes(n));
  assert.ok(roundSpecsInCore.length <= 7, `${roundSpecsInCore.length} per-round specs are in the gate`);
  /* nothing removed, and both tiers still partition the suite */
  assert.ok(allSpecs().length >= 58, `${allSpecs().length} spec files — nothing may be deleted for speed`);
  assert.equal(fixedCore.length + tierSpecs('deep').length, allSpecs().length);
  for (const n of CORE_ALWAYS) assert.ok(coreNames().includes(n), `${n} must gate`);
  /* the ceilings still bind, and the TOTAL did not gain headroom */
  const b = rd('scripts/test-budget.mjs');
  const cap = Number(/const BUDGET_S = (\d+);/.exec(b)[1]);
  const tot = Number(/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1]);
  assert.ok(cap < 180, `the gate ceiling is ${cap}s; #R204's was 180`);
  assert.ok(allSpecs().length >= 59, `${allSpecs().length} spec files`);
  assert.ok(core <= cap, `the gate is ${core}s against its ${cap}s ceiling`);
  /* (landing-showcase) «the TOTAL did not gain headroom» was a copied number (5250 s) that every round adding a
     measured spec had to raise by hand. The property is scripts/test-budget.mjs's own: the whole suite fits its
     ceiling AND the ceiling is not stale against what was measured (#R194's 12 % slack). Ask it. */
  const tb = spawnSync(process.execPath, ['scripts/test-budget.mjs'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(tb.status, 0, `the total ceiling (${tot}s) does not track the measured suite: ` + (tb.stderr || '').trim().slice(0, 400));
});

test('R205 ⑧b `npm test` runs its two independent halves at the same time', () => {
  const pkg = JSON.parse(rd('package.json'));
  assert.equal(pkg.scripts.test, 'node scripts/test-parallel.mjs');
  /* the old sequential order is kept as an escape hatch rather than deleted */
  assert.match(pkg.scripts['test:seq'], /static-checks[\s\S]*run-tests/);
  const r = rd('scripts/test-parallel.mjs');
  assert.match(r, /Promise\.all\(HALVES\.map\(runHalf\)\)/);
  /* both halves always run — a static-check failure must not hide a browser regression */
  assert.ok(!/Promise\.race/.test(r));
  assert.match(r, /results\.some\(\(r\) => r\.code !== 0\)/);
  /* every step of the old chain is still there */
  /* (gate-parity-and-shards) asked of `npm test`'s evaluated plan (tests/helpers/ci-reach.mjs), not of
     scripts/test-parallel.mjs's text: that file discovers its gates from package.json and names none. */
  const cmds = localCommands().join('\n');
  for (const s of ['static-checks.mjs', 'engine-coupling.mjs', 'test-budget.mjs', 'test:checks', 'run-tests.mjs']) {
    assert.ok(cmds.includes(s), `${s} must still run`);
  }
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R771 — was tests/r771-shorten-round-waiting-checks.test.mjs (6)–(10) (history: see process-worktree-status-checks)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
/* ══ THE OTHER HALF OF #R771: the gates run on three machines ═════════════════════════════════
 *  The tests above measure the deferred steps. These measure the split that made deferring worth
 *  doing — and they measure it by EVALUATING scripts/ci-gates.mjs, not by reading ci.yml for the
 *  spelling of a gate name. That distinction is the round's second finding: the two doc-facts
 *  rules that policed «is this gate reachable from CI» were reading spellings, and went red on all
 *  28 gates the moment the call became indirect while every one of them still ran.
 *  ⚠ THE INVARIANT IS A PARTITION, NOT A COUNT. A gate that lands on no shard is the one failure
 *  this whole mechanism exists to prevent (CI stays green while nothing checks it), and it is
 *  invisible to any assertion about how many gates there are. */
const CIG = join(ROOT, 'scripts', 'ci-gates.mjs');
const cig = (...args) => spawnSync(process.execPath, [CIG, ...args], { cwd: ROOT, encoding: 'utf8' });

test('R771 (6) every declared gate is planned exactly once, for any shard count', () => {
  const declared = Object.keys(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts)
    .filter((k) => /^check:/.test(k)).sort();
  assert.ok(declared.length >= 10, `only ${declared.length} declared gates — this test needs rewriting`);

  /* ⚠ NOT ONE SHARD COUNT. The partition must hold for every count CI could be set to, because the
     count is a matrix edit away and a planner that only balances at 3 would drop gates at 4. */
  for (const of of [1, 2, 3, 4, 7]) {
    const r = cig('--planned', '--of', String(of));
    assert.equal(r.status, 0, `--planned --of ${of} failed: ${r.stderr}`);
    const planned = JSON.parse(r.stdout.trim());
    assert.deepEqual([...planned].sort(), declared,
      `--of ${of}: the planned set is not the declared set`);
    assert.equal(new Set(planned).size, planned.length, `--of ${of}: a gate is planned twice`);
    assert.equal(cig('--check', '--of', String(of)).status, 0, `--check failed at --of ${of}`);
  }
});

test('R771 (7) the gates packed with the build are the ones that cannot run without it', async () => {
  /* ⚠ TWO DRAFTS OF THIS TEST WERE WRONG, AND EACH FAILURE IS THE POINT OF A COMMENT HERE.

     (1) It first looked for the string «dist» in a gate's source. `check:static` contains it
     because it SKIPS dist/ while scanning — mentioning a path is not depending on it. The
     predicate that matters is behavioural: does this gate fail when the build output is absent?

     (2) The behavioural version then moved a file in the working tree WITHOUT TAKING THE TREE
     LOCK, in a suite whose mutation tests (r399 / r403 / r500) exist precisely because two
     processes must never edit one tree at once (#R623 measured the breakage). It passed alone and
     failed in CI's Regression shard, which is exactly how that class of defect presents. Nothing
     below edits this checkout: the gates run in a private copy that has no build output. */
  const plan = cig('--plan', '--of', '3');
  assert.equal(plan.status, 0, plan.stderr);
  const buildLines = plan.stdout.split(/\r?\n/).filter((l) => l.includes('npm run build'));
  assert.equal(buildLines.length, 1, 'the build must be paid on exactly one shard, not zero or two');

  const packed = [...buildLines[0].matchAll(/check:[a-z0-9]+/g)].map((m) => m[0]);
  assert.ok(packed.length > 0, 'the build task carries no gates — the discovery is dead');

  /* The gate scripts are invoked directly rather than through `npm run`: one process instead of
     two per gate. */
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
  /* ⚠ (mutation-tests-off-tree) «without the build output» is a PRIVATE COPY OF THE CHECKOUT
     (tests/helpers/scratch-tree.mjs): it carries what git carries and nothing gitignored, so it has
     no .perf/build-report.json and no dist/ by construction. This used to RENAME this checkout's
     .perf/build-report.json away under the tree lock — and every other file that read the report
     during that window found it missing. */
  const SCRATCH = scratchTree();
  assert.equal(SCRATCH.exists('.perf/build-report.json'), false, 'the private copy carries a build report — it is not «without the build»');
  for (const g of packed) {
    const m = String(pkg[g]).match(/scripts\/[\w.-]+\.mjs/);
    assert.ok(m, `${g} does not resolve to a script file`);
    const args = String(pkg[g]).split(/\s+/).slice(2);
    const r = SCRATCH.node(m[0], args, { timeout: 120000 });
    assert.notEqual(r.code, 0,
      `${g} is packed with the build, but passed without the build output — it does not belong there`);
  }

  /* ⚠ WHAT THIS DOES NOT PROVE: that no OTHER gate needs the build. Running all 28 without dist/
     would cost more than the CI job this round exists to shorten. That direction is covered the way
     scripts/ci-gates.mjs' header says — loudly, at the moment it happens: a gate that needs the
     build and was not discovered runs without dist/ and fails on its own terms in CI. Visible, not
     silent, so it is a bug report rather than a green lie. */
});

test('R771 (8) ci.yml invokes the planner, and the required check keeps the name the ruleset asks for', () => {
  /* ⚠ COMMENTS ARE NOT CALLERS (#R628, and doc-facts strips them for the same reason): a sentence
     explaining the shard step looks exactly like the shard step. */
  const live = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
    .split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n');
  assert.match(live, /scripts\/ci-gates\.mjs\s+--shard/, 'no non-comment step runs a gate shard');

  const y = live;
  /* The aggregate job must carry the name the branch ruleset requires — a matrix leg cannot, because
     leg names change with the shard count (#R586). If this name drifts, every PR blocks forever on a
     required check that never reports. */
  assert.match(y, /name:\s*Static checks/, 'the required check name «Static checks» is gone');
  /* …and it must both always() and assert success: always() alone SKIPS on failure, and a skipped
     required check stops nothing. */
  const staticJob = y.slice(y.indexOf('  static:'), y.indexOf('  upstream:') > 0 ? y.indexOf('  upstream:') : undefined);
  assert.match(staticJob, /always\(\)/, 'the aggregate must run on always()');
  assert.match(staticJob, /needs\.gates\.result.*=.*success|test "\$\{\{ needs\.gates\.result \}\}" = "success"/s,
    'the aggregate must assert the shards succeeded, not merely run');
});

test('R771 (9) a shard reports every red gate in its bin, not just the first', () => {
  /* The measured cost of stopping at the first red was a second full CI round trip (11.9 / 12.2 min).
     ⚠ (tests regrouped by subject) THE COMMENT HERE SAID «EVALUATED, NOT READ» OVER THREE REGEXES
     OF cmdShard's SOURCE — so it is evaluated now: the real scripts/ci-gates.mjs (with what it
     imports) runs in a throw-away tree whose package.json declares stand-in gates — two red, one
     green, one that reads the build — and whose build is red. Each gate leaves a mark when it runs. */
  const T = mkdtempSync(join(tmpdir(), 'r771-shard-'));
  try {
    mkdirSync(join(T, 'scripts'), { recursive: true });
    const take = (f) => {
      if (existsSync(join(T, 'scripts', f))) return;
      cpSync(join(ROOT, 'scripts', f), join(T, 'scripts', f));
      for (const m of readFileSync(join(ROOT, 'scripts', f), 'utf8').matchAll(/\bfrom\s*['"]\.\/([^'"]+)['"]/g)) take(m[1]);
    };
    take('ci-gates.mjs');
    const gate = (name, code, extra = '') => writeFileSync(join(T, 'scripts', name + '.mjs'),
      `import { writeFileSync } from 'node:fs';\n${extra}\nwriteFileSync(${JSON.stringify(join(T, 'ran-' + name))}, '');\nprocess.exit(${code});\n`);
    gate('ga', 1);
    gate('gb', 0);
    gate('gc', 1);
    /* the spelling scripts/gate-universe.mjs READS_BUILD recognises: this gate reads the build output */
    gate('gd', 0, "const ROOT = '.'; const where = (a, b) => a + b; where(ROOT, 'dist'); /* join(ROOT, 'dist') */");
    writeFileSync(join(T, 'scripts', 'build.mjs'), 'process.exit(1);\n');
    writeFileSync(join(T, 'package.json'), JSON.stringify({ name: 'r771-shard', private: true, scripts: {
      build: 'node scripts/build.mjs', 'check:aa': 'node scripts/ga.mjs', 'check:bb': 'node scripts/gb.mjs',
      'check:cc': 'node scripts/gc.mjs', 'check:dd': 'node scripts/gd.mjs' } }, null, 2));

    const r = spawnSync(process.execPath, [join(T, 'scripts', 'ci-gates.mjs'), '--shard', '1/1'], { cwd: T, encoding: 'utf8' });
    const said = (r.stdout || '') + (r.stderr || '');
    assert.notEqual(r.status, 0, 'a shard with red gates exited 0:\n' + said);
    for (const g of ['check:aa', 'check:cc']) assert.ok((r.stderr || '').includes(g), `the shard's verdict does not name ${g}:\n${r.stderr}`);
    /* every gate in the bin ran — the second red was not hidden behind the first */
    for (const g of ['ga', 'gb', 'gc']) assert.ok(existsSync(join(T, 'ran-' + g)), `check:${g.slice(1).repeat(2)} never ran — the shard stopped at the first red:\n${said}`);
    /* …and the build is the one exception: its failure skips its own task only */
    assert.ok((r.stderr || '').includes('npm run build'), `a failed build is not reported as a failure:\n${r.stderr}`);
    assert.ok(!existsSync(join(T, 'ran-gd')), 'a gate that needs the build ran after the build failed — it measured a dist/ nobody wrote');
  } finally { rmSync(T, { recursive: true, force: true, maxRetries: 5 }); }
});

test('R771 (10) doc-facts asks the planner, and goes red when the shard step disappears', () => {
  /* ⚠ THE POINT OF THIS ONE: the fix to the two doc-facts rules could have been «widen them until
     they pass». It was not — they must still be able to fail. Removing the shard invocation has to
     bring back exactly the complaint the indirection would otherwise have silenced.
     (tests regrouped by subject) That half is EVALUATED elsewhere: #R628 ③ (process-doc-facts-sweep)
     and #R403 ⑥ (process-doc-facts-instruction-docs) blank the shard step in ci.yml and require
     `gate-callers` / `ci-gates` to go red. ⚠ What stays here is a source pin, because doc-facts runs its
     rules at import over the whole tree and exports none of them: whether it ASKS the planner (rather
     than re-reading ci.yml) and strips comments before it trusts the step cannot be observed without
     writing a commented-out shard step into the real ci.yml, and the tree writers above already hold
     the lock for the removal direction. */
  const DF = join(ROOT, 'scripts', 'doc-facts.mjs');
  const df = readFileSync(DF, 'utf8');
  assert.match(df, /ci-gates\.mjs.*--planned|\'--planned\'/s, 'doc-facts must ask the planner');
  assert.match(df, /--shard/, '…and must require the invocation to be present before trusting it');
  /* the guard is on a comment-stripped copy of the workflow */
  assert.match(df, /filter\(\(l\) => !\/\^\\s\*#\/\.test\(l\)\)[\s\S]{0,200}ci-gates/, 'the guard must ignore comments');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R301 — was tests/r301-checks.test.mjs ⑤⑦
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
// R301 source-level regression checks.
//
// The round: `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` were never in the
// `test:checks` list, so from the rounds that wrote them until now neither had ever been executed.
// r210 would have passed. r211 was RED — five of its twelve tests — and nothing printed it.
//
// The cure this round wrote — a hand-maintained list, and a guard comparing it against tests/ —
// was itself retired by #R529: `test:checks` now discovers `tests/**/*.test.mjs`, so there is no
// list for a file to be left out of. «Is this file listed?» is no longer a question anything can
// ask, and the checks that asked it (①–④ here) went with the list.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for. #R298 paid for the difference: a
// check that asks 「is the call written?」 is green while the call returns early on every device.

/* ── ⑤ the revived r211 asserts RELATIONS, derived from the repository ──────────────────── */
/* ⚠ ASKED IN THE POSITIVE ONLY, ON PURPOSE. The obvious version of this test — 「tests/r211 no
   longer contains `collectPond(`, `label:'➤'`, `for(const mult of [`」 — cannot work: the rewritten
   r211 names every one of those spellings, in the comment explaining why it stopped pinning it and
   in the assertion that it has not come back. A check written that way hits its own prose, which
   this project has now done more than twenty times. What is checkable is the shape of what
   REPLACED them: a construct that reads the repository cannot be satisfied by a literal. */
test('#R301 ⑤ the revived r211 derives its assertions instead of pinning spellings', () => {
  /* FOUND BY WHAT IT CONTAINS, NOT BY ITS NAME: #R211's checks left tests/r211-checks.test.mjs when
     the suite was regrouped by topic (2026-09-29) and are now spread over several files, so the text
     asked about is every test file that declares an #R211 test. */
  const r211Files = readdirSync(join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => /\btest\(\s*['`]#?R211\b/.test(read('tests/' + f)));
  assert.ok(r211Files.length >= 1, 'no test file carries an #R211 test any more — this check is reading nothing');
  const r211 = r211Files.map((f) => read('tests/' + f)).join('\n');
  assert.match(r211, /\[\.\.\.code\.matchAll\(\/\\bfetch\\\(\/g\)\]/,
    'the fetch guard is swept over every call site rather than four named throws');
  assert.match(r211, /readdirSync\(new URL\('\.\.\/js\/locales\//,
    'the science page is asked about every language the app ships, not about five');
  assert.match(r211, /const pushesFirst =/, 'undo is asserted as an ORDER, not as a signature');
  assert.match(r211, /matchAll\(\/kind:'\(\[a-z\]\+\)'\/g\)/, 'the vector kinds are read off the file');
  /* and it records what it cost, so the next reader does not have to re-derive it */
  assert.match(r211, /THIS FILE WAS NEVER RUN/, 'the header says why five of its tests were red');
});

/* ── ⑦ the round is written down where the next session will look ─────────────────────────────── */
test('#R301 ⑦ the round is in DEV-NOTES, and the two build stamps name it', async () => {
  /* (2026-09-25) the record is one file per entry now; DEV-NOTES.md is their generated index */
  assert.ok(entries(ROOT).some((e) => e.round === 301), 'the record has this round');
  assert.match(renderIndex(ROOT), /\bR301\b/, 'and the index lists it');
  /* ⚠ (#R302) BOTH STAMPS NAME **THIS** ROUND, AND 「THIS」 IS NOT A LITERAL. The relation #R174 wrote
     down — the two stamps name the SAME build, and it is the one being shipped — is kept by the build
     now: it fills both from the commit being built (scripts/build-stamp.mjs). */
  assert.deepEqual(await generatedStampProblems(read('index.html')), [], 'the build stamp can go stale again');
});
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  #R390 — was tests/r390-checks.test.mjs
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
{
// R390 source-level regression checks.
//
// The round: the guard #R301 built to stop a node test file from being left out of `test:checks`
// decided what a test WAS by asking its NAME — /\.test\.mjs$/. So the one file of tests in this
// repository that predates the convention was outside anything the guard could demand:
// `tests/security-logic.mjs` (#R138 — 31 tests over the constant-time secret comparison, the admin
// console's data-literal parser, the fail-closed refresh-news guard, the pinned GitHub Actions).
// #R377 dropped it from the list as collateral in that one long hand-maintained line, and
// `npm test`, `npm run check:static` and CI all stayed green for three rounds — until #R380
// happened to put it back. MEASURED before this round's fix, on this tree: with that one path
// deleted from `test:checks`, `node scripts/static-checks.mjs` exited 0 and said nothing about it.
//
// The guard this round widened — it asked the file what it CONTAINS rather than what it is
// CALLED — is gone since #R529, together with the list it compared against: `test:checks` now
// discovers `tests/**/*.test.mjs`, so no hand-maintained line can drop a file, name one twice, or
// name one that is not there. The naming exception that made all of this necessary is gone too:
// `tests/security-logic.mjs` was renamed to `tests/security-logic.test.mjs`, so the only rule
// left is the one the runner itself applies. ①–⑤ below asked about the guard and went with it.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for (#R298).

const HERE = fileURLToPath(import.meta.url);
const ROOT = join(dirname(HERE), '..');

/* ── ⑥ the change is written where the next reader will look ─────────────────────────────────── */
test('#R390 ⑥ the round is in DEV-NOTES, and docs/TESTING.md still describes the node tier', () => {
  /* (tests regrouped by subject) This read the round off the file's own name, so that a renumber
     before push could not leave the stamp pointing at another round (#R381). The file is named for
     its subject now and renumbering went with the numbers, so the round is the one this block was
     written in — #R390 — stated once, here. */
  const round = [null, '390'];
  /* ⚠ ASSERTED AS BOOLEANS, NOT `assert.match`. A failed match prints the WHOLE haystack, and
     DEV-NOTES.md is ~900,000 characters — the report of the failure buries the run it came from. */
  /* (2026-09-25) the record is one file per entry (scripts/dev-notes.mjs); DEV-NOTES.md is their
     generated index, and the old hand-written index rows live in dev-notes/legacy-index.md */
  const own = entryText(round[1], ROOT);
  assert.ok(own && new RegExp('^## R' + round[1] + '\\b').test(own), 'the record has a section for this round');
  assert.ok(new RegExp('^- R' + round[1] + ' · ', 'm').test(renderIndex(ROOT)), '…the generated index lists it');
  assert.ok(new RegExp('^- \\*\\*#R' + round[1] + '\\*\\*', 'm').test(read('dev-notes/legacy-index.md')), '…and its old index line survived');
  const t = read('docs/TESTING.md');
  assert.ok(/node:test/.test(t), 'docs/TESTING.md still names the framework the node tier runs on');
  assert.ok(/security-logic/.test(t), '…and still names the file the name-only rule could not protect');
});
}
