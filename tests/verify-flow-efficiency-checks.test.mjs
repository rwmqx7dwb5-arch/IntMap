/* verify-flow-efficiency — the parts of the post-implementation flow that were made shorter, and the reason none of them
   catches less. Each assertion is about a mechanism (evaluated where it can be, read from ci.yml where only the
   workflow can say), never about a count. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as yaml from 'js-yaml';
import { selectTests, selectGates, closureOf, buildReaches, CHEAP_S } from '../scripts/preflight.mjs';
import { declaredGates, needsBuild } from '../scripts/gate-universe.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CI = yaml.load(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8'));
const gatesCli = (...a) => spawnSync(process.execPath, [join(ROOT, 'scripts/ci-gates.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });

test('① preflight reaches a test by the path its source names, and never by a list', () => {
  const files = { 'tests/a.test.mjs': "new URL('../js/foo.js')", 'tests/b.test.mjs': 'nothing here', 'tests/c.test.mjs': "read('tests/fixtures/p.json')" };
  const read = (p) => files[p] || '';
  const tests = Object.keys(files);
  assert.deepEqual(selectTests(['js/foo.js'], { tests, read }), ['tests/a.test.mjs']);
  assert.deepEqual(selectTests(['tests/fixtures/p.json'], { tests, read }), ['tests/c.test.mjs'], 'a fixture is reached through the test that names it');
  assert.deepEqual(selectTests(['tests/b.test.mjs'], { tests, read }), ['tests/b.test.mjs'], 'a changed test is itself selected');
  assert.deepEqual(selectTests(['dev-notes/x.md'], { tests, read }), [], 'a record is named by nobody');
});

test('② preflight reaches a gate through its script and the scripts it imports; cheap gates always run; a name like `scripts/` is not evidence', () => {
  const src = { 'scripts/g.mjs': "import './h.mjs'; read('data/x.json')", 'scripts/h.mjs': 'export const a = 1', 'scripts/other.mjs': 'nothing' };
  const read = (p) => src[p] || '';
  const scriptOf = (g) => ({ 'check:g': 'scripts/g.mjs', 'check:o': 'scripts/other.mjs', 'check:cheap': 'scripts/other.mjs' }[g]);
  const gates = ['check:g', 'check:o', 'check:cheap'];
  const cost = { 'check:g': 100, 'check:o': 100, 'check:cheap': CHEAP_S };
  const pick = (changed) => selectGates(changed, { gates, cost, read, scriptOf }).map((x) => x.gate).sort();
  assert.deepEqual(pick(['scripts/h.mjs']), ['check:cheap', 'check:g'], 'an imported helper changed → the gate that imports it');
  assert.deepEqual(pick(['data/x.json']), ['check:cheap', 'check:g'], 'a path the script names');
  assert.deepEqual(pick(['scripts/unrelated.mjs']), ['check:cheap'], 'editing some other script reaches no expensive gate');
  assert.deepEqual([...closureOf('scripts/g.mjs', read)].sort(), ['scripts/g.mjs', 'scripts/h.mjs']);
  assert.ok(buildReaches(['js/app.js']) && !buildReaches(['tests/x.test.mjs', 'docs/a.md', 'dev-notes/b.md']));
});

test('③ the gate pools are a partition: build-free gates start with the run, the build readers are their own job behind the build', () => {
  const r = gatesCli('--check');
  assert.equal(r.status, 0, r.stderr);
  const free = JSON.parse(gatesCli('--planned', '--pool', 'free').stdout);
  const built = JSON.parse(gatesCli('--planned', '--pool', 'build', '--of', '1').stdout);
  assert.deepEqual([...free, ...built].sort(), declaredGates(), 'every declared gate exactly once');
  assert.ok(free.every((g) => !needsBuild(g)) && built.length && built.every((g) => needsBuild(g)));
  assert.ok(![].concat(CI.jobs.gates.needs || []).includes('build'), 'the build-free gates do not wait for the build');
  assert.ok([].concat(CI.jobs['gates-build'].needs).includes('build'));
  assert.ok([].concat(CI.jobs.static.needs).includes('gates-build'), '«Static checks» reads the build-reading job too');
});

test('④ a push of a tree that already passed on its PR skips the tests — and ONLY then, and never the build', () => {
  const need = (id) => [].concat(CI.jobs[id].needs || []);
  for (const id of ['checks', 'gates', 'gates-build', 'browser']) {
    assert.ok(need(id).includes('reuse'), `${id} asks reuse`);
    assert.match(String(CI.jobs[id].if), /needs\.reuse\.outputs\.green != 'true'/, `${id} is skipped only on the receipt`);
  }
  assert.ok(!/reuse/.test(String(CI.jobs.build.if || '')) && !need('build').includes('reuse'), 'the build always runs: the published bytes are built here');
  /* the receipt is looked up only for a push to main; the tree decides, not a branch or a sha */
  const ask = CI.jobs.reuse.steps.find((s) => s.id === 'ask').run;
  assert.match(ask, /GITHUB_EVENT_NAME" = push/);
  assert.match(ask, /refs\/heads\/main/);
  assert.match(ask, /HEAD\^\{tree\}/);
  assert.match(ask, /green-tree-\$tree/);
  /* it is written only by a PR run whose three required aggregates all passed */
  const w = CI.jobs['green-receipt'];
  assert.match(w.if, /github\.event_name == 'pull_request'/);
  for (const a of ['static', 'checks-gate', 'browser-gate']) assert.match(w.if, new RegExp(`needs\\.${a}\\.result == 'success'`));
  /* the aggregates take «skipped» as a pass only together with the receipt */
  for (const id of ['static', 'checks-gate', 'browser-gate']) {
    const run = CI.jobs[id].steps.map((s) => s.run || '').join('\n');
    assert.match(run, /needs\.reuse\.outputs\.green }}" = "true"/, `${id} names the receipt before it accepts skipped`);
    assert.ok(need(id).includes('reuse'));
  }
  assert.match(String(CI.jobs.static.steps[0].run), /test "\$\{\{ needs\.build\.result \}\}" = "success"/, 'a red build is never excused');
  /* the nightly and manual runs are not reused: `reuse` answers false for anything but a push to main */
  assert.match(ask, /green=false/);
});

test('⑤ the regression suite is split on more machines than before, and a partition for any count', () => {
  const legs = CI.jobs.checks.strategy.matrix.include;
  assert.ok(legs.length >= 4 && legs.every((l, i) => l.shard === i + 1 && l.of === legs.length), 'shards 1..n of n');
  for (const n of [legs.length]) {
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/checks-shards.mjs'), '--check', '--of', String(n)], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
});
