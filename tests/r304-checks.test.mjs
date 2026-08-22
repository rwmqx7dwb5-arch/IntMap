/* ============================================================================
 *  IntMap · #R304 — source-level checks
 * ----------------------------------------------------------------------------
 *  The round is about a tier of tests that ran every night, went red, and told nobody — and about
 *  two assertions inside it that were COPIES of facts rather than statements about them.
 *
 *    · js/lazy-modules.js knew eight modules when tests/r209.spec.js was written and ten by #R291.
 *      The spec said `toBe(8)`. It had been failing every night since the round that made it ten.
 *    · #R296 deleted three simulators on the user's instruction. tests/r166.spec.js went on
 *      demanding the globals they used to publish, and tests/r197.spec.js went on opening one of
 *      them. Both had been failing every night since that round.
 *    · The nightly itself was red on all fourteen runs from 2026-08-08 to 08-21 and `browser-gate`
 *      reported it honestly every time. Nobody was lied to; nobody looked.
 *
 *  So what is pinned here is (a) that the derivations those specs now read really do track their
 *  sources, and (b) that the nightly's verdict reaches a reader — an issue, and the command every
 *  session runs before it starts.
 *
 *  ⚠ THESE RUN IN `npm test`. A check that lives in a tier nobody watches is the disease, not the
 *  cure — which is why this file is in package.json's `test:checks` list in the same commit that
 *  creates it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { lazyModules, publishedGlobals } from './app-source.mjs';
import { junitFiles, failuresFrom, body, TITLE } from '../scripts/deep-alarm.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootURL = new URL('../', import.meta.url);
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that two dozen times; ask the question of the text that RUNS. */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/* ── ① THE LOADER'S TABLES ARE READABLE, AND THEY AGREE WITH THEMSELVES ───────────────────────
   Everything the two rewritten specs assert rests on this derivation working. If a round rewrote
   js/lazy-modules.js into a shape tests/app-source.mjs cannot read, `lazyModules()` would return an
   empty list and BOTH specs would pass vacuously — the exact failure this round exists to end. */
test('R304 ① every deferred module names a file and a global, both read out of the loader', () => {
  const L = lazyModules(rootURL);
  assert.ok(L.length >= 10, `js/lazy-modules.js declares ${L.length} modules — the derivation found nothing`);
  for (const m of L) {
    assert.ok(m.file && m.file.startsWith('js/'), `${m.name} names the file the loader import()s`);
    assert.ok(m.global && /^[A-Za-z_]/.test(m.global), `${m.name} names the global it must publish`);
    /* ⚠ EITHER THE MODULE OR THE LOADER PUBLISHES IT, and which one is a per-module fact:
       js/night-sky.js assigns its own global at import time, js/flight-sim.js returns an object that
       the loader's mount switch assigns. Both are 「the global arrived」; demanding the first shape
       would fail most of them for being written the way the loader asks them to be. */
    assert.ok(new RegExp('window\\.' + m.global + '\\s*=').test(read(m.file) + read('js/lazy-modules.js')),
      `js/lazy-modules.js or ${m.file} assigns window.${m.global}`);
  }
  const names = L.map((m) => m.name);
  assert.equal(new Set(names).size, names.length, 'no module is declared twice');
});

/* ── ② src/main.js's LAZY_FACTORIES IS THE LOADER'S LIST, MINUS THE ONE WITH NO FACTORY ───────
   That list exists so a deleted or renamed module still has somewhere to be missing from (its own
   comment says so), which only works while the two agree. It was checked in the browser by naming
   ONE member of it — and a list that is spot-checked drifts by exactly the members nobody named.
   Here rather than only in the deep tier, because this is a source fact and `npm test` can have it. */
test('R304 ② the boot guard names every deferred factory, and only those', () => {
  const L = lazyModules(rootURL);
  const want = L.filter((m) => m.factory).map((m) => m.name).sort();
  const m = /const LAZY_FACTORIES = \[([^\]]*)\]/.exec(read('src/main.js'));
  assert.ok(m, 'src/main.js declares LAZY_FACTORIES');
  const got = [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]).sort();
  assert.deepEqual(got, want, 'src/main.js\'s LAZY_FACTORIES equals the loader\'s factory-backed modules');
  /* the exception is one module and it is a fact about the loader, not a favourite */
  const noFactory = L.filter((x) => !x.factory).map((x) => x.name);
  assert.deepEqual(noFactory, ['nightSky'], 'nightSky is the only module that publishes itself at import');
});

/* ── ③ THE MOVED-BLOCK GLOBALS FOLLOW THE SOURCE, INCLUDING WHEN A FEATURE IS DELETED ─────────
   The #R296 deletions are the concrete case: the derived list must NOT contain them, and must still
   contain the ones that stayed. A derivation that returned everything, or nothing, would pass one
   of those and fail the other — so both directions are asserted. */
test('R304 ③ publishedGlobals() tracks js/, in both directions', () => {
  const FILES = ['js/map-ui.js', 'js/map-tools.js', 'js/weather.js', 'js/layer-packs.js',
    'js/analysis-panels.js', 'js/sims.js', 'js/playground.js', 'js/viewshed.js', 'js/dash-extended.js'];
  const t = publishedGlobals(rootURL, FILES);
  for (const f of FILES) assert.ok(Object.keys(t[f] || {}).length > 0, `${f} contributed factories`);
  const all = new Set(Object.values(t).flatMap((f) => Object.values(f).flat()));

  /* deleted by #R296 — 「電波・通信圏と見通し線解析を統合」/「4つのうち…全削除」/「存在意義が不明」 */
  for (const g of ['IntMapRF', 'IntMapDisaster', 'IntMapEarthReplay'])
    assert.ok(!all.has(g), `${g} was deleted, so nothing derives it any more`);
  /* still there, and each is a different SHAPE of publication the walk has to handle:
     a bare statement, an assignment from an IIFE, and one made inside an IIFE two levels down */
  for (const g of ['IntMapLayers', 'IntMapSun', 'IntMapLOS', 'IntMapBeta2', '_imPlacePopup', 'IntMapOverlays'])
    assert.ok(all.has(g), `${g} is still published by a factory, and the walk sees it`);
  assert.ok(all.size > 40, `the derived list is ${all.size} globals — it has not collapsed`);
});

/* ── ④ NO SPEC COUNTS THE DEFERRED MODULES ANY MORE ───────────────────────────────────────────
   The literal defect: `expect(s.names.length, …).toBe(8)`. Asked of the code that runs, so the
   sentence above explaining what went wrong does not trip it. */
test('R304 ④ the lazy-module list is derived wherever it is asserted, never counted', () => {
  for (const f of ['tests/r209.spec.js', 'tests/r209-checks.test.mjs']) {
    const src = noComments(read(f));
    assert.doesNotMatch(src, /names\(\)[^\n]*\.length[^\n]*(toBe|equal)\(\s*\d+/,
      `${f} must not assert a COUNT of the loader's modules`);
    assert.doesNotMatch(src, /\.names\s*\)?\.length\s*,[^\n]*\)\s*\.toBe\(\s*\d+\s*\)/,
      `${f} must not assert a COUNT of the loader's modules`);
  }
  assert.match(read('tests/r209.spec.js'), /lazyModules\(/, 'tests/r209.spec.js reads the loader instead');
  assert.match(read('tests/r166.spec.js'), /publishedGlobals\(/, 'tests/r166.spec.js reads the factories instead');
});

/* ── ⑤ THE NIGHTLY HAS SOMEWHERE TO SHOUT ─────────────────────────────────────────────────────
   #R203 attached the deep tier to a schedule and #R207 deliberately took it off `push` (「テスト時間
   が短くなりさえすればなんでもいい」). Neither is reopened here — what is added is that the answer it
   already produces reaches a reader. */
test('R304 ⑤ ci.yml runs the deep tier nightly and raises an issue when it is red', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /schedule:\s*\n\s*- cron: '0 18 \* \* \*'/, 'the nightly schedule is still there');
  assert.match(ci, /browser-deep:/, 'the deep matrix is still there');
  assert.match(ci, /deep-alarm:/, 'and the alarm job with it');
  const alarm = ci.slice(ci.indexOf('deep-alarm:'));
  assert.match(alarm, /needs: \[browser-deep\]/, 'the alarm reads the deep tier\'s result');
  assert.match(alarm, /github\.event_name == 'schedule'/, 'it is the NIGHTLY that is reported on');
  assert.match(alarm, /always\(\)/, 'and it runs whether that job passed or failed');
  assert.match(alarm, /issues: write/, 'it may open an issue');
  assert.match(alarm, /node scripts\/deep-alarm\.mjs/, 'through the script that owns the logic');
  /* ⚠ and `push` is NOT among the deep tier's triggers — #R207's measurement stands */
  const deep = ci.slice(ci.indexOf('browser-deep:'), ci.indexOf('timings:'));
  assert.doesNotMatch(deep, /event_name == 'push'/, '#R207 took the deep tier off every merge; leave it off');
  /* ⚠ «cancelled» IS NOT A PASS. The gate must keep saying so — two of the fourteen red nights
     were cancellations, and a run that was cut short proved nothing. */
  const gate = ci.slice(ci.indexOf('browser-gate:'), ci.indexOf('deep-alarm:'));
  assert.match(gate, /success\|skipped\) ;; \*\) exit 1/, 'only success or skipped is a pass for the deep tier');
});

/* ── ⑥ THE ALARM READS REAL JUNIT AND NAMES THE FAILURES ──────────────────────────────────────
   The issue is only worth opening if it says WHAT failed. A retried test that passed the second
   time is not a failure (CI retries once precisely so a blip clears itself, #R207) — reporting it
   would teach the reader to skip the issue, which is the disease this is treating. */
test('R304 ⑥ deep-alarm reads the shards\' junit.xml and reports only what really failed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imalarm-'));
  const shard = join(dir, 'playwright-report-deep-rest-1', 'test-results');
  mkdirSync(shard, { recursive: true });
  writeFileSync(join(shard, 'junit.xml'), [
    '<testsuites><testsuite>',
    '<testcase classname="tests/r166.spec.js:71:1 › every moved global is present"><failure>x</failure></testcase>',
    '<testcase classname="tests/r209.spec.js:21:1 › the boot guard is still clean"/>',
    /* failed, then passed on the retry — a blip, not a failure */
    '<testcase classname="tests/r174.spec.js:9:1 › a flaky one"><failure>x</failure></testcase>',
    '<testcase classname="tests/r174.spec.js:9:1 › a flaky one"/>',
    '</testsuite></testsuites>',
  ].join(''), 'utf8');

  assert.equal(junitFiles(dir).length, 1, 'it finds the shard\'s report at any depth');
  const f = failuresFrom(junitFiles(dir));
  assert.deepEqual(f, ['tests/r166.spec.js:71:1 › every moved global is present']);
  assert.equal(junitFiles(join(dir, 'nope')).length, 0, 'a missing directory is empty, not a throw');

  const txt = body({ failures: f, runUrl: 'http://x/1', day: '2026-01-01', sawReports: true });
  assert.match(txt, /tests\/r166\.spec\.js:71:1/, 'the issue names the failing test');
  assert.match(txt, /http:\/\/x\/1/, 'and links the run');
  assert.match(body({ failures: [], runUrl: '', day: '2026-01-01', sawReports: true }), /No individual test is red/,
    'a job that died around the suite says so instead of printing an empty list');
  assert.ok(TITLE.length > 0 && !/\n/.test(TITLE), 'the issue has one stable title to find it by');
});

/* ── ⑦ …AND THE VERDICT IS IN FRONT OF EVERY SESSION ──────────────────────────────────────────
   CLAUDE.md §1 sends every session through `node scripts/worktree.mjs status` before it starts, so
   that is where the answer is guaranteed to be read. ⚠ It must never make a session wait or fail:
   the header of that file says `status` never exits non-zero, and gh may be missing or offline. */
test('R304 ⑦ worktree.mjs status reports the nightly, and cannot break a session doing it', () => {
  const src = read('scripts/worktree.mjs');
  assert.match(src, /function nightly\(\)/, 'status can ask about the nightly');
  const fn = src.slice(src.indexOf('function nightly()'), src.indexOf('/* ── STATUS'));
  assert.match(fn, /--event=schedule/, 'it asks about the SCHEDULED run, not the newest run of any kind');
  assert.match(fn, /timeout: \d+/, 'the call is capped');
  assert.match(fn, /catch\s*\{\s*return null/, 'and every failure is a null, not a throw');
  assert.match(fn, /cancelled/, '«cancelled» is reported as not-green');
  assert.match(fn, /r\.conclusion === 'success'/, 'only success is green');
  /* both entry points say it: the hook's brief form shouts only when it is not green, the full
     form always answers — including «could not ask», so silence is never read as a pass. */
  const st = src.slice(src.indexOf('function status(brief)'));
  assert.match(st, /if \(nb && !nb\.ok\)/, 'the SessionStart hook line shouts when it is red');
  assert.match(st, /不明/, 'and the full status distinguishes «green» from «could not ask»');
});

/* ── ⑧ THIS FILE RUNS ─────────────────────────────────────────────────────────────────────────
   The round's own subject, applied to itself: a check that is not in the list nobody runs it. */
test('R304 ⑧ this round\'s checks are in package.json\'s test:checks list', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts['test:checks'], /tests\/r304-checks\.test\.mjs/,
    'tests/r304-checks.test.mjs is in test:checks');
});
