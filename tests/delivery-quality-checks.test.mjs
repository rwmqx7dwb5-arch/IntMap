/* ============================================================================
 *  delivery-quality — a red night is handed to the change that caused it
 * ----------------------------------------------------------------------------
 *  ① scripts/spec-reach.mjs    — what each browser spec guards, discovered from what it spells
 *  ② scripts/deep-history.mjs  — a regression carries its two nights (the last pass, the first red)
 *  ③ scripts/nightly-blame.mjs — the range of merges, the suspects with evidence, dispatch once
 *  ④ scripts/nightly-bisect.mjs — the verdict, measured: plan, count, judge, words
 *  ⑤ the wiring — the run name IS the dispatch key; inputs reach shells only through env; the
 *     nightly alarm job computes the section and appends it
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
const yaml = { load: yamlLoad };

import { isDesignToken, tokensOf, buildIndex, specReach, specsGuarding, reachMap } from '../scripts/spec-reach.mjs';
import { classify } from '../scripts/deep-history.mjs';
import { parseLog, suspects, blame, markdown, bisectKey, existingKeys, toDispatch, titleOf } from '../scripts/nightly-blame.mjs';
import { plan, countResults, stateOf, judge, words, MATRIX_MAX } from '../scripts/nightly-bisect.mjs';
import { body } from '../scripts/deep-alarm.mjs';
import { allSpecs } from '../scripts/tiers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* a small tree with the shapes the reach reads */
function fixtureTree() {
  const dir = mkdtempSync(join(tmpdir(), 'reach-'));
  const w = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  w('js/radar.js', "window.IntMapRadar = { add(){ map.addLayer({ id: 'lyr-radar' }); } };\n");
  w('js/hold.js', "window.IntMapLayerHold = { pending(){ return []; } }; const heldIds = 1;\n");
  w('js/shared-a.js', "const k = 'data-layer';\n");
  w('js/shared-b.js', "const k = 'data-layer';\n");
  w('js/shared-c.js', "const k = 'data-layer';\n");
  w('js/shared-d.js', "const k = 'data-layer';\n");
  w('js/reader.js', "IntMapRadar.add(); // reads, does not define\n");
  w('css/app.css', '.legend-min-btn { color: red; }\n');
  w('index.html', '<div id="map"></div>\n');
  w('tests/helpers/network.js', 'export const x = 1;\n');
  w('tests/a.spec.js', [
    "import { x } from './helpers/network.js';",
    "/* the radar row (js/radar.js) */",
    "await page.evaluate(() => window.IntMapLayerHold.pending());",
    "expect(ids).toContain('lyr-radar'); // the layer",
    "await page.click('[data-layer]');   // shared vocabulary: four files, past the bound",
    "await page.click('.legend-min-btn');",
    "test('every layer arrives', () => {});",
  ].join('\n'));
  w('tests/b.spec.js', "await page.evaluate(() => window.IntMapLayerHold.heldIds);\n");
  return dir;
}

/* ── ① ─────────────────────────────────────────────────────────────────────── */
test('① a design identifier is not a plain word', () => {
  for (const t of ['lyr-radar', 'heldIds', 'data_layer', 'r184x', 'data-legend-ec-slp']) assert.ok(isDesignToken(t), t);
  for (const t of ['every', 'layer', 'Arrives', 'map', '-lead', 'trail_']) assert.ok(!isDesignToken(t), t);
  assert.deepEqual([...tokensOf("every 'lyr-radar' layer heldIds")].sort(), ['heldIds', 'lyr-radar']);
});

test('① the reach: paths, imports (helpers), defining files of globals, distinctive tokens — and nothing shared', () => {
  const dir = fixtureTree();
  try {
    const idx = buildIndex(dir);
    const r = specReach('tests/a.spec.js', idx);
    assert.deepEqual(r.why['tests/helpers/network.js'], ['helper']);
    assert.ok(r.why['js/radar.js'].includes('path'), 'a path named in a comment');
    assert.ok(r.why['js/radar.js'].includes('token:lyr-radar'), 'a token in ≤ TOKEN_DF files');
    assert.deepEqual(r.why['js/hold.js'], ['global:IntMapLayerHold'], 'the file that ASSIGNS the global');
    assert.ok(!r.files.includes('js/reader.js'), 'a file that only reads a global is not where it is defined');
    for (const f of ['js/shared-a.js', 'js/shared-b.js', 'js/shared-c.js', 'js/shared-d.js']) assert.ok(!r.files.includes(f), `${f}: a token in four files is vocabulary, not evidence`);
    assert.ok(r.files.includes('css/app.css'), 'a class name spelt by one stylesheet');
    /* the bound is a parameter of the question, not of the tree */
    assert.ok(specReach('tests/a.spec.js', idx, { df: 4 }).files.includes('js/shared-a.js'));
    /* both directions */
    const map = { 'tests/a.spec.js': r, 'tests/b.spec.js': specReach('tests/b.spec.js', idx) };
    assert.deepEqual(specsGuarding(['js/hold.js'], map).map((h) => h.spec), ['tests/a.spec.js', 'tests/b.spec.js']);
    assert.deepEqual(specsGuarding(['js/radar.js'], map).map((h) => h.spec), ['tests/a.spec.js']);
    assert.deepEqual(specsGuarding(['js/unrelated.js'], map), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① a path a spec only MENTIONS under scripts/ is the suite talking about itself, not reach', () => {
  const dir = fixtureTree();
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, 'scripts/test-budget.mjs'), '');
    writeFileSync(join(dir, 'tests/c.spec.js', ), '// the ceiling is scripts/test-budget.mjs\n');
    assert.ok(!specReach('tests/c.spec.js', buildIndex(dir)).files.includes('scripts/test-budget.mjs'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① the real tree: every spec in every tier has a reach computed', () => {
  const map = reachMap();
  for (const s of allSpecs()) assert.ok(map[s], `${s} has a reach entry`);
});

/* ── ② ─────────────────────────────────────────────────────────────────────── */
const N = (day, sha, failed = [], flaky = []) => ({ runId: +day.replace(/-/g, ''), day, sha, conclusion: 'failure', read: true, failed, flaky });

test('② a regression carries the night it last passed and the first night it failed', () => {
  const id = 'tests/x.spec.js › it works';
  const h = classify([N('2026-10-03', 'ccc', [id]), N('2026-10-02', 'bbb', [id]), N('2026-10-01', 'aaa', [], [id]), N('2026-09-30', '999', [id])]);
  assert.equal(h.regressions.length, 1);
  const r = h.regressions[0];
  assert.deepEqual([r.bad.sha, r.good.sha, r.goodWasFlaky], ['bbb', 'aaa', true]);
});

test('② a streak that reaches the end of the window has no `good` — no range is invented', () => {
  const id = 'tests/x.spec.js › it works';
  const r = classify([N('2026-10-03', 'ccc', [id]), N('2026-10-02', 'bbb', [id])]).regressions[0];
  assert.equal(r.good, null);
  const b = blame({ known: true, nights: 2, read: 2, regressions: [r], mended: [], sporadic: [] }, { cwd: ROOT, index: { root: ROOT, files: new Set(), globals: new Map(), tokens: new Map() } });
  assert.equal(b.regressions[0].range, null);
  assert.match(b.regressions[0].why, /通った晩が無い/);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────── */
test('③ git log → commits with their PR and files', () => {
  const c = parseLog('@@aaa\tfirst change (#10)\njs/a.js\ntests/x.spec.js\n\n@@bbb\tdata: refresh\ndata/x.json\n');
  assert.deepEqual(c.map((x) => [x.sha, x.pr, x.files]), [['aaa', 10, ['js/a.js', 'tests/x.spec.js']], ['bbb', null, ['data/x.json']]]);
});

test('③ suspects: the spec edited ranks first, then by files of the reach; the rest are still listed', () => {
  const reach = { spec: 'tests/x.spec.js', files: ['js/a.js', 'js/b.js'], why: { 'js/a.js': ['token:lyr-a'], 'js/b.js': ['path'] } };
  const s = suspects(reach, [
    { sha: '1', subject: 's1 (#1)', pr: 1, files: ['js/a.js', 'js/b.js'] },
    { sha: '2', subject: 's2 (#2)', pr: 2, files: ['tests/x.spec.js'] },
    { sha: '3', subject: 's3 (#3)', pr: 3, files: ['README.md'] },
  ]);
  assert.deepEqual(s.withEvidence.map((c) => c.pr), [2, 1]);
  assert.deepEqual(s.without.map((c) => c.pr), [3]);
  const md = markdown({ known: true, nights: 14, read: 14, mended: 0, sporadic: 0, regressions: [{ id: 'tests/x.spec.js › t', streak: 2, since: '2026-10-02', good: { sha: 'aaa', day: '2026-10-01' }, bad: { sha: 'bbb', day: '2026-10-02' }, range: { commits: 3 }, ...s }] });
  /* `#2` in the issue body is what puts a cross-reference on PR #2's own timeline */
  assert.match(md, /\| #2 s2 \| edited the spec itself \|/);
  assert.match(md, /no static evidence: #3/);
});

test('③ dispatch is once per regression and range: the run list is the memory, and an unreadable list starts nothing', () => {
  const r = { id: 'tests/x.spec.js › t', good: { sha: 'aaa' }, bad: { sha: 'bbb' } };
  const b = { known: true, regressions: [{ ...r, key: bisectKey(r), range: { commits: 3 } }, { id: 'tests/y.spec.js › u', key: 'k2', range: null }] };
  assert.equal(toDispatch(b, new Set()).length, 1, 'a regression without a range is never dispatched');
  assert.equal(toDispatch(b, existingKeys(JSON.stringify([{ displayTitle: 'bisect: ' + bisectKey(r) }]))).length, 0);
  assert.equal(existingKeys('not json').size, 0);
  assert.equal(titleOf('tests/x.spec.js › describe › title'), 'describe › title');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────── */
test('④ plan: the control first, the range oldest-first; a range past the matrix limit is sampled with both ends kept', () => {
  const commits = Array.from({ length: 300 }, (_, i) => ({ sha: 'c' + i, pr: i, subject: 's' }));
  const small = plan('good', commits.slice(0, 3));
  assert.deepEqual(small.include.map((r) => r.sha), ['good', 'c0', 'c1', 'c2']);
  assert.equal(small.include[0].control, true);
  const big = plan('good', commits);
  assert.equal(big.sampled, true);
  assert.equal(big.include.length, MATRIX_MAX);
  assert.equal(big.include[0].sha, 'good');
  assert.equal(big.include[big.include.length - 1].sha, 'c299');
  assert.deepEqual(big.include.map((r) => r.order), big.include.map((_, i) => i));
});

test('④ results are counted from Playwright\'s own JSON; a commit that did not build is «error», never «pass»', () => {
  const rep = { suites: [{ suites: [{ specs: [{ tests: [{ results: [{ status: 'passed' }, { status: 'failed' }, { status: 'timedOut' }, { status: 'skipped' }] }] }] }] }] };
  assert.deepEqual(countResults(rep), { passed: 1, failed: 2 });
  assert.deepEqual(countResults(null), { passed: 0, failed: 0 });
  assert.equal(stateOf({ exists: false, built: true, passed: 3, failed: 0 }), 'absent');
  assert.equal(stateOf({ exists: true, built: false, passed: 0, failed: 0 }), 'error');
  assert.equal(stateOf({ exists: true, built: true, passed: 0, failed: 0 }), 'error');
  assert.equal(stateOf({ exists: true, built: true, passed: 3, failed: 0 }), 'pass');
  assert.equal(stateOf({ exists: true, built: true, passed: 0, failed: 3 }), 'fail');
  assert.equal(stateOf({ exists: true, built: true, passed: 2, failed: 1 }), 'mixed');
});

const P = (order, state, pr = null, control = false) => ({ order, sha: 's' + order, pr, control, subject: `c${order}`, state, passed: state === 'pass' ? 3 : 0, failed: state === 'fail' ? 3 : 0 });

test('④ judge: every outcome is a statement about what was run', () => {
  assert.equal(judge([P(0, 'pass', null, true), P(1, 'pass', 1), P(2, 'fail', 2), P(3, 'fail', 3)]).kind, 'culprit');
  assert.equal(judge([P(0, 'pass', null, true), P(1, 'pass', 1), P(2, 'fail', 2)]).commits[0].pr, 2);
  const n = judge([P(0, 'pass', null, true), P(1, 'error', 1), P(2, 'mixed', 2), P(3, 'fail', 3)]);
  assert.deepEqual([n.kind, n.commits.map((c) => c.pr)], ['narrowed', [1, 2, 3]]);
  assert.equal(judge([P(0, 'pass', null, true), P(1, 'pass', 1)]).kind, 'passes-alone');
  assert.equal(judge([P(0, 'mixed', null, true), P(1, 'fail', 1)]).kind, 'control-not-clean');
  assert.equal(judge([P(0, 'pass', null, true), P(1, 'mixed', 1)]).kind, 'flaky-at-bad');
  assert.equal(judge([P(0, 'pass', null, true), P(1, 'error', 1)]).kind, 'unmeasured');
  const nm = judge([P(0, 'pass', null, true), P(1, 'fail', 1), P(2, 'pass', 2), P(3, 'fail', 3)]);
  assert.deepEqual([nm.kind, nm.commits[0].pr, nm.nonMonotonic], ['culprit', 3, true]);
});

test('④ the words name the PR for a culprit, and blame no one when the test passes alone', () => {
  const rs = [P(0, 'pass', null, true), P(1, 'pass', 7), P(2, 'fail', 8)];
  assert.match(words(judge(rs), { test: 'tests/x.spec.js › t', good: 'aaa', bad: 'bbb', results: rs }), /#8 broke it/);
  const alone = [P(0, 'pass', null, true), P(1, 'pass', 7)];
  assert.match(words(judge(alone), { test: 'tests/x.spec.js › t', good: 'aaa', bad: 'bbb', results: alone }), /no merge in this range broke it/);
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────── */
test('⑤ the bisect run is NAMED by the dispatch key, so «already bisected» is a question to the run list', () => {
  const wf = yaml.load(rd('.github/workflows/nightly-bisect.yml'));
  const r = { id: 'tests/x.spec.js › a title', good: { sha: 'aaa' }, bad: { sha: 'bbb' } };
  const name = wf['run-name'].replace('${{ inputs.test }}', r.id).replace('${{ inputs.good }}', r.good.sha).replace('${{ inputs.bad }}', r.bad.sha);
  assert.ok(existingKeys(JSON.stringify([{ displayTitle: name }])).has(bisectKey(r)), `run-name «${name}» carries the key «${bisectKey(r)}»`);
  assert.deepEqual(Object.keys(wf.on.workflow_dispatch.inputs).sort(), ['bad', 'good', 'test'], 'nightly-blame dispatches exactly these inputs');
});

test('⑤ user-supplied inputs reach a shell only through env, never interpolated into run:', () => {
  const wf = yaml.load(rd('.github/workflows/nightly-bisect.yml'));
  for (const [jn, job] of Object.entries(wf.jobs)) for (const st of job.steps || []) {
    if (st.run) assert.ok(!/\$\{\{\s*(inputs|matrix)\./.test(st.run), `${jn} › ${st.name || st.run.slice(0, 40)} interpolates an input into the shell`);
  }
  /* the tool is checked out apart from the commit under test, which may predate it */
  const probe = wf.jobs.probe.steps;
  assert.ok(probe.some((s) => s.with && s.with.path === '_tool'));
  assert.ok(probe.some((s) => s.run && s.run.includes('node _tool/scripts/nightly-bisect.mjs run')));
});

test('⑤ the nightly alarm job computes the section, starts the bisect, and appends it to the issue', () => {
  const ci = yaml.load(rd('.github/workflows/ci.yml'));
  const job = ci.jobs['deep-alarm'];
  assert.equal(job.permissions.actions, 'write', 'reading the nights\' logs and dispatching the bisect');
  const steps = job.steps.map((s) => s.run || '').join('\n');
  assert.match(steps, /nightly-blame\.mjs --include-run "\$\{\{ github\.run_id \}\}" --markdown _blame\.md --dispatch/);
  assert.match(steps, /--append _blame\.md/);
  const blameStep = job.steps.find((s) => (s.run || '').includes('nightly-blame.mjs'));
  assert.equal(blameStep['continue-on-error'], true, 'a failure there must not silence the alarm');
  assert.equal(job.steps[0].with['fetch-depth'], 0, 'the range is history');
});

test('⑤ deep-alarm: the appended section sits above the footer; none, and the body is what it was', () => {
  const base = { failures: ['a › b'], runUrl: 'u', day: '2026-10-03', sawReports: true };
  const plain = body(base);
  assert.equal(body({ ...base, appendix: '  \n' }), plain);
  const withSec = body({ ...base, appendix: '### Regressions and their suspects\n\nx' });
  assert.ok(withSec.indexOf('### Regressions and their suspects') < withSec.indexOf('---'));
});
