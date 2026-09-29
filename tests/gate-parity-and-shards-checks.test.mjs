/* ============================================================================
 *  gate-parity-and-shards — `npm test` runs the gates CI runs; the node suite is split by seconds;
 *  a line ceiling is found by what it IS, not by how it is spelled
 * ----------------------------------------------------------------------------
 *  Three structural defects, each measured on 2026-09-29:
 *    ① scripts/test-parallel.mjs listed its gates by hand and ran 23 of the 31 package.json declares,
 *       while CI (scripts/ci-gates.mjs) discovered all 31. Both now take the universe from
 *       scripts/gate-universe.mjs; a gate may stay out of `npm test` only with a sentence in CI_ONLY.
 *    ② the «Regression i/3» shards split the files by COUNT (node's --test-shard) and took
 *       11m16s / 8m32s / 4m52s on run 36513330956. scripts/checks-shards.mjs packs them by the
 *       measured seconds in .github/checks-cost.json, and scripts/test-checks.mjs answers the flag.
 *    ③ #R795's «no line ceiling comes back» was a regex over `assert.ok(<listed name> < N,` and five
 *       ceilings survived it on spelling alone. tests/helpers/line-ceilings.mjs asks about the fact.
 *  Every property is asked of the running code (the planners are evaluated, the detector is run
 *  against mutations), because the defect in all three was a check that read a spelling.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { declaredGates, gatesInDeclaredOrder, needsBuild, lpt, medianOf } from '../scripts/gate-universe.mjs';
import { localPlan as planOf, CI_ONLY, ciOnlyLine } from '../scripts/test-parallel.mjs';
import { testFiles, planShards, parseShard, foldTimings, readLedger } from '../scripts/checks-shards.mjs';
import { GLOB } from '../scripts/test-checks.mjs';
import { lineCeilings, repositoryLineCeilings } from './helpers/line-ceilings.mjs';
import { localPlan, plannedGates } from './helpers/ci-reach.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const stub = (g) => ['node', ['stub-for-' + g]];

/* ── ① npm test and CI run the same declared gates ─────────────────────────────────────────── */
test('① every declared check:* is run by `npm test`, or named in CI_ONLY with a reason — asked of the plan', () => {
  const plan = localPlan();                     /* node scripts/test-parallel.mjs --planned, evaluated */
  assert.deepEqual(plan.problems, [], 'the exclusion table is not a table of reasons');
  const declared = declaredGates();
  assert.ok(declared.length >= 31, `only ${declared.length} check:* read out of package.json — this test needs rewriting`);
  const excluded = plan.ciOnly.map((x) => x.gate);
  const unaccounted = declared.filter((g) => !plan.gates.includes(g) && !excluded.includes(g));
  assert.deepEqual(unaccounted, [], 'declared gates `npm test` neither runs nor excuses — a push can pass locally and be red in CI');
  /* …and every one of them is a STEP exactly once, not merely a name in a list */
  const stepGates = plan.halves.flatMap((h) => h.steps.map((s) => s.gate)).filter(Boolean);
  assert.deepEqual(stepGates.slice().sort(), plan.gates.slice().sort(), 'each gate `npm test` claims must be one step, once');
  for (const x of plan.ciOnly) assert.ok(x.reason && x.reason.trim().length, `${x.gate} is excluded without a reason`);
});

test('① the two runners take the SAME universe — CI plans exactly what `npm test` runs plus what it excuses', () => {
  const plan = localPlan();
  const ci = plannedGates();                    /* node scripts/ci-gates.mjs --planned, evaluated */
  assert.deepEqual(ci.slice().sort(), [...plan.gates, ...plan.ciOnly.map((x) => x.gate)].sort());
  assert.deepEqual(ci.slice().sort(), declaredGates());
});

test('① a gate declared tomorrow runs in `npm test` the same day, with nobody editing the runner', () => {
  const declared = [...gatesInDeclaredOrder(), 'check:declared-tomorrow'];
  const plan = planOf({ declared, readsBuild: () => false, command: stub });
  assert.ok(plan.gates.includes('check:declared-tomorrow'));
  const checks = plan.halves.find((h) => h.tag === 'checks').steps;
  assert.equal(checks.filter((s) => s.gate === 'check:declared-tomorrow').length, 1);
});

test('① CI_ONLY without a reason — or naming a gate that does not exist — stops the run', () => {
  const declared = ['check:a', 'check:b', 'check:c'];
  const base = { declared, readsBuild: () => false, command: stub };
  for (const bad of [{ 'check:a': '' }, { 'check:a': '   ' }, { 'check:a': null }, { 'check:a': 'check:a' }]) {
    const p = planOf({ ...base, ciOnly: bad });
    assert.ok(p.problems.some((m) => /without a sentence/.test(m)), 'accepted an exclusion with no reason: ' + JSON.stringify(bad));
  }
  assert.ok(planOf({ ...base, ciOnly: { 'check:gone': 'it was removed' } }).problems.some((m) => /does not declare/.test(m)));
  const ok = planOf({ ...base, ciOnly: { 'check:b': 'needs a service only CI can reach' } });
  assert.deepEqual(ok.problems, []);
  assert.ok(!ok.gates.includes('check:b'), 'an excused gate must not run');
  assert.deepEqual(ok.ciOnly, [{ gate: 'check:b', reason: 'needs a service only CI can reach' }]);
  /* the run prints the table every time: each excused gate by name with its reason, or «なし» */
  assert.match(ciOnlyLine(ok), /check:b（needs a service only CI can reach）/);
  assert.match(ciOnlyLine(planOf({ ...base, ciOnly: {} })), /なし/);
  /* and the live table obeys the same rule */
  assert.deepEqual(planOf({ ciOnly: CI_ONLY }).problems, []);
});

test('① the gates that read the build run after `npm run build`, at the end of the browser half', () => {
  const plan = localPlan();
  const built = declaredGates().filter((g) => needsBuild(g));
  assert.ok(built.length >= 1, 'the build-reading discovery found nothing — scripts/gate-universe.mjs READS_BUILD no longer matches');
  const checks = plan.halves.find((h) => h.tag === 'checks').steps;
  const browser = plan.halves.find((h) => h.tag === 'browser').steps;
  for (const g of built) assert.ok(!checks.some((s) => s.gate === g), `${g} would read dist/ while the browser half's server is building it`);
  const buildAt = browser.findIndex((s) => s.args.join(' ') === 'run build');
  const suiteAt = browser.findIndex((s) => s.args.some((a) => /run-tests\.mjs$/.test(a)));
  assert.ok(suiteAt === 0 && buildAt > suiteAt, 'the build must follow the browser suite (its server builds dist/ while it runs)');
  for (const g of built) assert.ok(browser.findIndex((s) => s.gate === g) > buildAt, `${g} runs before the build`);
});

test('① the checks half keeps its order: the data first, the gates in declared order, the suite last', () => {
  const checks = localPlan().halves.find((h) => h.tag === 'checks').steps;
  assert.deepEqual(checks[0].args, ['scripts/data-assets.mjs', 'verify']);
  assert.deepEqual(checks[checks.length - 1].args, ['run', 'test:checks']);
  const order = checks.filter((s) => s.gate).map((s) => s.gate);
  const declaredOrder = gatesInDeclaredOrder().filter((g) => order.includes(g));
  assert.deepEqual(order, declaredOrder);
});

/* ── ② the node suite is split by measured seconds ─────────────────────────────────────────── */
test('② the shard plan is a partition of the runner\'s glob, for every shard count', () => {
  const files = testFiles(GLOB);
  assert.ok(files.length > 100, `${files.length} files — the glob found too little to be the suite`);
  assert.ok(files.includes('tests/gate-parity-and-shards-checks.test.mjs'), 'the planner does not see this very file');
  for (const of of [1, 2, 3, 4, 7]) {
    const all = planShards(files, of).bins.flatMap((b) => b.files);
    assert.equal(all.length, files.length, `of=${of}: ${all.length} placements for ${files.length} files`);
    assert.deepEqual(all.slice().sort(), files, `of=${of}: not every file exactly once`);
  }
});

test('② the plan is deterministic — N machines each compute only their own bin', () => {
  const files = testFiles(GLOB);
  const a = planShards(files, 3);
  const b = planShards(files.slice().reverse(), 3);
  assert.deepEqual(a.bins.map((x) => x.files), b.bins.map((x) => x.files), 'input order changed the plan');
  assert.deepEqual(a, planShards(files, 3));
});

test('② an unmeasured file is charged the median and still lands on exactly one shard', () => {
  const files = [...testFiles(GLOB), 'tests/zz-added-tomorrow-checks.test.mjs'];
  const p = planShards(files, 3);
  assert.ok(p.unmeasured.includes('tests/zz-added-tomorrow-checks.test.mjs'));
  assert.equal(p.bins.filter((b) => b.files.includes('tests/zz-added-tomorrow-checks.test.mjs')).length, 1);
  const known = Object.values(readLedger().seconds || {});
  assert.equal(p.median, medianOf(files.map((f) => readLedger().seconds[f]).filter(Number.isFinite), 1));
  assert.ok(known.length > 100, 'the ledger holds too few measurements to balance anything');
});

test('② the packing keeps the LPT guarantee — no shard over 4/3 of the best possible', () => {
  const secs = readLedger().seconds;
  const files = testFiles(GLOB);
  const p = planShards(files, 3);
  const cost = (f) => (Number.isFinite(secs[f]) ? secs[f] : p.median);
  const total = files.reduce((s, f) => s + cost(f), 0);
  const lower = Math.max(total / 3, ...files.map(cost));       /* no plan can do better than this */
  const worst = Math.max(...p.bins.map((b) => b.cost));
  assert.ok(worst <= lower * 4 / 3 + 1e-6, `worst shard ${worst.toFixed(0)}s against a floor of ${lower.toFixed(0)}s`);
  /* the same packing is the one ci-gates.mjs uses for the gates (scripts/gate-universe.mjs lpt) */
  assert.deepEqual(lpt([['a', 5], ['b', 4], ['c', 3], ['d', 3]], 2, (x) => x[1], (x) => x[0]).map((b) => b.items.map((x) => x[0])), [['a', 'd'], ['b', 'c']]);   /* 5→A, 4→B, 3→B (4<5), 3→A (5<7) */
});

test('② --test-shard=i/n runs the planned files, and --timings writes seconds per file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'im-gps-'));
  try {
    for (let i = 0; i < 3; i++) writeFileSync(join(dir, `f${i}.test.mjs`), `import test from 'node:test';\ntest('t${i}', () => {});\n`);
    const out = join(dir, 'timings.json');
    const env = { ...process.env, IM_CHECKS_GLOB: join(dir, '*.test.mjs') };
    delete env.NODE_TEST_CONTEXT;     /* see tests/r586 ② — a nested runner that sees it goes silent */
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/test-checks.mjs'), '--test-shard=1/1', '--timings', out], { cwd: ROOT, encoding: 'utf8', env });
    assert.match(r.stdout, /shard 1\/1 · 3 files/, r.stdout + r.stderr);
    assert.match(r.stdout, /ℹ pass 3/, 'the spec reporter still prints');
    const t = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(Object.keys(t).length, 3, 'one entry per file: ' + JSON.stringify(t));
    for (const [k, v] of Object.entries(t)) { assert.match(k, /f\d\.test\.mjs$/); assert.ok(!k.includes('\\'), 'keys are forward-slashed'); assert.ok(Number.isFinite(v)); }
    const bad = spawnSync(process.execPath, [join(ROOT, 'scripts/test-checks.mjs'), '--test-shard=4/3'], { cwd: ROOT, encoding: 'utf8', env });
    assert.notEqual(bad.status, 0, 'a shard outside 1..n must fail, not run something');
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.deepEqual(parseShard('2/3'), { i: 2, of: 3 });
  assert.equal(parseShard('0/3'), null);
  assert.equal(parseShard('x'), null);
});

test('② measured seconds fold into the ledger; the ledger names no file that is gone', () => {
  const next = foldTimings({ seconds: { 'tests/a.test.mjs': 9 } }, [{ 'tests/a.test.mjs': 1.26 }, { 'tests/b.test.mjs': 3 }], 'stamp');
  assert.deepEqual(next, { seconds: { 'tests/a.test.mjs': 1.3, 'tests/b.test.mjs': 3 }, measured: 'stamp' });
  const out = execFileSync(process.execPath, [join(ROOT, 'scripts/checks-shards.mjs'), '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /ちょうど1回ずつ/);
});

test('② CI shards through the runner and uploads what it measured', () => {
  const job = loadYaml(rd('.github/workflows/ci.yml')).jobs.checks;
  const step = job.steps.find((s) => typeof s.run === 'string' && s.run.includes('test:checks'));
  assert.match(step.run, /--test-shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.of \}\}/);
  assert.match(step.run, /--timings checks-timings\.json/);
  const up = job.steps.find((s) => String(s.uses || '').startsWith('actions/upload-artifact'));
  assert.ok(up && up.with.path === 'checks-timings.json' && /checks-timings-/.test(up.with.name), 'the measured seconds are thrown away');
});

/* ── ③ a line ceiling is found by what it is ───────────────────────────────────────────────── */
const FIXTURE_FILE = join(ROOT, 'tests', 'line-ceiling-fixture.test.mjs');   /* never written; resolves imports */
const PRELUDE = `import { readFileSync } from 'node:fs';
import * as fs from 'node:fs';
import { readLF } from '../scripts/eol.mjs';
import { execFileSync } from 'node:child_process';
const read = (p) => readFileSync(p, 'utf8');
const viaImport = (p) => readLF(p);
const n = (p) => read(p).split('\\n').length;
const NL = String.fromCharCode(10);
const FILES = ['a.js', 'b.js'];
`;
const found = (body) => lineCeilings(PRELUDE + body, { file: FIXTURE_FILE }).length;

test('③ every orientation and every spelling of a ceiling is caught', () => {
  const caught = [
    "const lines = read('a.js').split('\\n').length; assert.ok(lines < 10);",
    "const lines = read('a.js').split('\\n').length; assert.ok(lines <= 10);",
    "const lines = read('a.js').split('\\n').length; assert.ok(10 > lines);",
    "const lines = read('a.js').split('\\n').length; assert.ok(10 >= lines);",
    "const body = read('a.js'); assert.ok(body.split('\\n').length<=4400, 'x');",
    "const whatever = read('a.js').split(/\\r?\\n/).length; if (whatever < 5_300) {}",
    "const ok = n('a.js') < 1_000;",
    "assert.equal(read('a.js').split(NL).length < 9, true);",
    "assert.ok(read('a.js').split(String.fromCharCode(10)).length < 4_910);",
    "assert.ok(readFileSync('a.js', 'utf8').split('\\n').length < 5);",
    "assert.ok(fs.readFileSync('a.js', 'utf8').split('\\n').length < 5);",
    "assert.ok(viaImport('a.js').split('\\n').length < 5);",
    "const ls = read('a.js').split('\\n'); assert.ok(ls.length < 5);",
    "const k = read('a.js').split('\\n').filter((l) => !/^import/.test(l)).length; assert.ok(k < 130);",
    "const k = FILES.map(read).join('\\n').split('\\n').length; assert.ok(k < 8050);",
    "const src = read('a.js').replace(/x/g, ''); assert.ok(src.split(`\\n`).length < 9);",
  ];
  for (const body of caught) assert.equal(found(body), 1, 'missed: ' + body);
});

test('③ a floor, a character count, and a tool\'s output are not ceilings', () => {
  const clean = [
    "const lines = read('a.js').split('\\n').length; assert.ok(lines > 0);",
    "const lines = read('a.js').split('\\n').length; assert.ok(lines >= 1);",
    "const lines = read('a.js').split('\\n').length; assert.ok(5 < lines);",
    "assert.ok(read('a.js').length < 50000);",
    "const out = execFileSync('node', ['x']); assert.ok(out.split('\\n').length < 5);",
    "assert.ok(read('a.js').split(',').length < 5);",
  ];
  for (const body of clean) assert.equal(found(body), 0, 'reported: ' + body);
});

test('③ mutation: re-inserting each retired ceiling into its own file is caught; the repository has none', () => {
  /* the five sites this round retired, put back — using each file's own helpers — must each be seen */
  const probes = [
    ['tests/r291-checks.test.mjs', "\ntest('probe', () => { const body = read('js/app-body.js'); assert.ok(body.split('\\n').length <= 4400); });\n"],
    ['tests/r199-checks.test.mjs', "\ntest('probe', () => { const n = (p) => read(p).split('\\n').length; const body = n('js/app-body.js'); assert.ok(body < 5_200); });\n"],
    ['tests/r200-checks.test.mjs', "\ntest('probe', () => { const n = (p) => read(p).split('\\n').length; const body = n('js/app-body.js'); assert.ok(body < 4_400); });\n"],
    ['tests/r278-checks.test.mjs', "\ntest('probe', () => { const n = ATLAS().split(/\\r?\\n/).length; assert.ok(n < 5300); });\n"],
    ['tests/r350-checks.test.mjs', "\ntest('probe', () => { const n = read('js/atlas-console.js').split(/\\r?\\n/).length; assert.ok(n < 5300); });\n"],
  ];
  for (const [rel, probe] of probes) {
    const file = join(ROOT, rel);
    const src = readFileSync(file, 'utf8');
    assert.equal(lineCeilings(src, { file }).length, 0, `${rel} still holds a ceiling`);
    assert.equal(lineCeilings(src + probe, { file }).length, 1, `${rel}: the re-inserted ceiling was not seen`);
  }
  assert.deepEqual(repositoryLineCeilings(ROOT), []);
});
