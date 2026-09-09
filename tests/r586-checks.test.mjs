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
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CI = yaml.load(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'));

test('① the regression shards cover 1..n exactly once, for one n', () => {
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

test('② sharding actually SHARDS — measured through the shipped runner', () => {
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

test('②b the shard step delegates the file set to the one script that owns it', () => {
  const step = CI.jobs.checks.steps.find((s) => typeof s.run === 'string' && s.run.includes('test:checks'));
  assert.ok(step, 'no step in the sharded job runs test:checks');
  /* the file set is the npm script's; naming files here would make CI and `npm test` two lists */
  assert.match(step.run, /npm run test:checks --/, 'the shard step must delegate to the npm script, so the glob has one owner');
  assert.match(step.run, /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.of \}\}/, 'the shard argument must come from the matrix, not be written per leg');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['test:checks'], /scripts\/test-checks\.mjs/, 'test:checks must go through the runner that puts options in front of the glob');
});

test('③ a required check names the whole suite, not one leg', () => {
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

test('④ the heavy step really left the Static checks job', () => {
  /* the whole point of the round. If it comes back, «Static checks» is 13 minutes again and the
     merge race this round exists to end is back with it. */
  const static_ = CI.jobs.static.steps.map((s) => s.run || '').join('\n');
  assert.doesNotMatch(static_, /npm run test:checks/, 'test:checks is back in the Static checks job');
});
