/* ============================================================================
 *  IntMap · MAIN'S OWN TEST RESULT, KEPT  —  attribution without an experiment  (#R195)
 * ----------------------------------------------------------------------------
 *  「いやだからそもそもここまで時間かかるのがおかしい」
 *
 *  THE WASTE THIS REMOVES. When a PR goes red, the standing rule is to prove whether the failure is
 *  yours before touching anything: run it again on the same tree, then run it on main. That rule is
 *  right — it is the only thing that separates a regression from a flake, and #R195 was saved by it
 *  once and burned by skipping the CI half of it once. But the way it is carried out is absurd:
 *  main's result is RECOMPUTED, by hand, at 9-12 minutes a go — while CI has already run every test
 *  on main and thrown the answer away.
 *
 *  Measured on the round this was written in: 21 minutes of the ~1 h 45 m of waiting went to
 *  re-deriving something CI knew. And the one time that experiment was skipped, two Cesium failures
 *  were misattributed to "pre-existing" and shipped into a second red CI cycle — the local machine
 *  said pre-existing, CI on main said otherwise, and only CI was right.
 *
 *  So main keeps its answer. Every CI run on main writes tests/baseline.json — one entry per test
 *  id, its outcome and how long it took — and a PR classifies its own failures against it:
 *
 *      node scripts/baseline.mjs --classify test-results/junit.xml
 *        ✗ tests/r180-cesium.spec.js:169  MINE        (main: passed 12.3s)
 *        ✗ tests/r180-cesium.spec.js:217  ALSO ON MAIN (main: failed)
 *
 *  「MINE」 is a fact about this branch, available the moment the run finishes, with no second run.
 *  A test main has never recorded is reported as UNKNOWN — never quietly as someone else's problem.
 *
 *  ⚠ The baseline is written ONLY from main, and only from a full green-or-red run of the whole
 *  suite. A PR must never write it, or a branch would define its own idea of "normal".
 *
 *      node scripts/baseline.mjs --update <junit.xml…>     # main's CI does this
 *      node scripts/baseline.mjs --classify <junit.xml…>   # a PR does this
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'tests', 'baseline.json');

const has = (k) => process.argv.includes(k);
const files = (k) => process.argv.slice(process.argv.indexOf(k) + 1).filter((a) => !a.startsWith('--'));

/* Playwright's JUnit writes one <testcase> per test, with <failure>/<error> children when it failed
   and no such child when it passed. `classname` carries "tests/x.spec.js:12:1 › title". */
function parse(paths) {
  const out = {};
  for (const p of paths) {
    if (!existsSync(p)) continue;
    const xml = readFileSync(p, 'utf8');
    for (const m of xml.matchAll(/<testcase\b([^>]*)>([\s\S]*?)<\/testcase>|<testcase\b([^>]*)\/>/g)) {
      const attrs = m[1] || m[3] || '', body = m[2] || '';
      const cls = /classname="([^"]*)"/.exec(attrs);
      const time = /time="([\d.]+)"/.exec(attrs);
      if (!cls) continue;
      const id = cls[1].replace(/\s*›[\s\S]*$/, '').trim();   /* tests/x.spec.js:12:1 */
      const failed = /<failure|<error/.test(body);
      const prev = out[id];
      /* a test that failed then passed on retry is RECORDED AS FLAKY rather than as either one */
      out[id] = prev
        ? { status: prev.status === (failed ? 'failed' : 'passed') ? prev.status : 'flaky', time: +(time ? time[1] : 0) }
        : { status: failed ? 'failed' : 'passed', time: +(time ? time[1] : 0) };
    }
  }
  return out;
}

/* (#R202) the same missing half as shard-plan's — union the per-shard fragments a main run uploads,
   so main's own last result is what a branch is compared against instead of a hand-pasted snapshot. */
if (has('--merge')) {
  const list = files('--merge');
  const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { tests: {} };
  const tests = { ...(old.tests || {}) };
  let read = 0, n = 0;
  for (const f of list) {
    if (!existsSync(f)) continue;
    let j = null;
    try { j = JSON.parse(readFileSync(f, 'utf8')); } catch (_) { continue; }
    read++;
    for (const [k, v] of Object.entries(j.tests || {})) { tests[k] = v; n++; }
  }
  if (!read) { console.error('baseline --merge: no fragments'); process.exit(1); }
  writeFileSync(FILE, JSON.stringify({ ref: 'main', tests }, null, 1) + '\n');
  console.log(`baseline: merged ${read} fragment(s), ${n} results (${Object.keys(tests).length} known)`);
  process.exit(0);
}

if (has('--update')) {
  const got = parse(files('--update'));
  if (!Object.keys(got).length) { console.error('baseline --update: no <testcase> found'); process.exit(1); }
  const old = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { tests: {} };
  /* merge: a shard only knows about its own share, so one run's shards accumulate */
  const tests = { ...(old.tests || {}), ...got };
  writeFileSync(FILE, JSON.stringify({ ref: 'main', tests }, null, 1) + '\n');
  console.log(`baseline: ${Object.keys(got).length} results recorded (${Object.keys(tests).length} known)`);
  process.exit(0);
}

if (has('--classify')) {
  const base = existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')).tests || {}) : {};
  const got = parse(files('--classify'));
  const bad = Object.entries(got).filter(([, v]) => v.status !== 'passed');
  if (!bad.length) { console.log('baseline: nothing failed'); process.exit(0); }
  let mine = 0;
  console.log('\n  failure                                            verdict        main');
  for (const [id, v] of bad) {
    const b = base[id];
    const verdict = !b ? 'UNKNOWN' : (b.status === 'passed' ? 'MINE' : 'ALSO ON MAIN');
    if (verdict !== 'ALSO ON MAIN') mine++;
    console.log(`  ${id.padEnd(50)} ${verdict.padEnd(14)} ${b ? b.status : '(never recorded)'}`);
  }
  console.log(`\n  ${mine} failure(s) not explained by main.` +
    (mine ? '  ⚠ Do not call these flakes without evidence.' : '  Every failure also happens on main.'));
  process.exit(0);
}

console.error('usage: baseline.mjs --update <junit.xml…> | --classify <junit.xml…>');
process.exit(1);
