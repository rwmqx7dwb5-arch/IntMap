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

test('② each shard runs the SAME glob the local suite runs, only sharded', () => {
  const step = CI.jobs.checks.steps.find((s) => typeof s.run === 'string' && s.run.includes('test:checks'));
  assert.ok(step, 'no step in the sharded job runs test:checks');
  /* ⚠ THE FILE SET IS THE npm SCRIPT'S, NOT A LIST HERE. If this step ever names files directly it
     stops being the same set `npm test` runs, and the two drift the way #R166 describes. */
  assert.match(step.run, /npm run test:checks --/, 'the shard step must delegate to the npm script, so the glob has one owner');
  assert.match(step.run, /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.of \}\}/, 'the shard argument must come from the matrix, not be written per leg');
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.match(pkg.scripts['test:checks'], /--test\b/, 'test:checks no longer invokes the node test runner');
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
