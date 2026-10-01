/* ============================================================================
 *  Test tiers, the build stamp, the nightly alarm, and the documents that record the rounds
 * ----------------------------------------------------------------------------
 *  主題単位の回帰検査。元はラウンド単位のファイルに散っていたものを、守っている主題ごとに
 *  まとめ直した（守っている事実は 1 つも減らしていない）。
 *    · 各 test の題名は元のまま。先頭の「#R<N>」はその検査が生まれたラウンドの札。
 *    · 1 つの { } ブロックが元のファイル 1 本分。ブロックの中の補助関数は元のファイルのもので、
 *      ブロックの外（このファイルの先頭）には複数のブロックが共有する補助だけを置く。
 *    · ブロックの冒頭コメントはそのラウンドの経緯（実測・理由）で、書き換えていない。
 *  統合元: tests/r286-checks.test.mjs, tests/r217-checks.test.mjs, tests/r204-checks.test.mjs, tests/r175-checks.test.mjs, tests/r304-checks.test.mjs, tests/r305-checks.test.mjs
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path, { resolve, join, dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { junitFiles, failuresFrom, body, TITLE } from '../scripts/deep-alarm.mjs';
import { entries, checkNotes, allNotesText } from '../scripts/dev-notes.mjs';
import { readLF } from '../scripts/eol.mjs';
import { allSpecs, coreNames, fixedCoreNames, changedSpecs, tierSpecs, isDeep, CORE_MAX_S, CORE_ALWAYS } from '../scripts/tiers.mjs';
import { generatedStampProblems } from './helpers/build-stamp.mjs';
import { codeOnly as noComments } from '../scripts/code-only.mjs';
import { readSpec } from '../scripts/architecture-spec.mjs';

/* shared by the blocks below: the repository root, and one of its files as text */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ══════════ from tests/r286-checks.test.mjs — 1 of its 6 test(s) ══════════ */
{
/* (#R286) the round's header note is kept with its largest block, in tests/layer-satellite-imagery-checks.test.mjs */
const read = (p) => readLF(resolve(ROOT, p));

/* ── ⑥ the OTHER defect this round hit: a check that was reading bytes instead of content ──────
   tests/r280-checks ② asserts that every doc-facts rule goes red when its fact is made wrong, and
   it locates each fact with an anchor written using LF. `privacy.html` is not pinned by
   .gitattributes, so a `core.autocrlf` checkout hands it back with CRLF and the `legal` anchor
   could not be found — red on Windows, green in CI, for a reason that has nothing to do with what
   it asserts. That is #R283's finding in a fourth file, and § ② now widens the ANCHOR (it must not
   normalise what it reads: it writes the same text back to restore the file).
   ⚠ BOTH DIRECTIONS, for #R283's reason: a widener that matched everything would pass the first
   half and is exactly how this would be "fixed" by weakening it. */
test('R286 ⑥: r280 ②\'s anchor follows the checkout\'s line endings and relaxes nothing else', async () => {
  const m = /const anchorRe = (\(s\) => new RegExp\([\s\S]*?\));\n/.exec(read('tests/doc-facts-legal-pages-checks.test.mjs'));
  assert.ok(m, 'tests/doc-facts-legal-pages-checks.test.mjs (#R280) still builds its anchors through one named helper');
  const anchorRe = new Function(`return (${m[1]});`)();

  /* (module-graph) privacy.html loads the policy text as a module now — the tag is the anchor, so it is spelt so */
  const anchor = '<script type="module" src="./js/legal-text.js"></script>\n';
  assert.equal(anchorRe(anchor).test('x<script type="module" src="./js/legal-text.js"></script>\ny'), true,
    'an LF checkout still matches — this is what CI reads');
  assert.equal(anchorRe(anchor).test('x<script type="module" src="./js/legal-text.js"></script>\r\ny'), true,
    'THE FIX: a CRLF checkout matches the same anchor');
  assert.equal(anchorRe(anchor).test('x<script type="module" src="./js/legal-text.js"></script>y'), false,
    '…and a line break that is genuinely ABSENT is still a failure');
  /* metacharacters stay literal — the widening is about line breaks and nothing else */
  assert.equal(anchorRe('a.c').test('abc'), false, 'a dot in an anchor is a dot');
  assert.equal(anchorRe('a.c').test('a.c'), true);
  assert.equal(anchorRe('x$y').test('x$y'), true, 'and a dollar sign is a dollar sign');

  /* …and it finds the real anchor in the real file, whichever way this machine checked it out */
  /* an unlocked read of privacy.html once saw tests/doc-facts-legal-pages-checks.test.mjs's mutant (PR #817 CI,
     2026-09-30); that test breaks a private copy of the checkout now (mutation-tests-off-tree), so a
     plain read of the tree is a read of the tree */
  const raw = readFileSync(resolve(ROOT, 'privacy.html'), 'utf8');
  assert.equal(anchorRe(anchor).test(raw), true,
    'privacy.html still loads the one copy of the policy text, on this checkout');
});
}

/* ══════════ from tests/r217-checks.test.mjs — 4 of its 23 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（開発記録と仕様書） */
/* (#R217) the round's header note is kept with its largest block, in tests/layer-place-labels-rivers-checks.test.mjs */
const rd = read;

/* ═══ ⑦ THE DOCUMENTS HAVE ONE JOB AND ONE ORDER EACH ═════════════════════════════════════════
   「DEVNOTESやArchitectureはかなり煩雑になったり…両者が混同されて混ざったり…これを機に一斉整理して。」
   The split is only worth anything while it holds, and all three of its properties are mechanical. */

const ROUND_HEADS = (md) => [...md.matchAll(/^## R(\d+)/gm)].map((m) => +m[1]);

/* (2026-09-25) The recent record is ONE FILE PER ENTRY under dev-notes/ and DEV-NOTES.md is their
   generated index (scripts/dev-notes.mjs). The order #R217 established is kept — and now it is kept
   by the generator: the numbered entries are read here as the generator reads them, newest first,
   and `check:docs` (rule dev-notes) fails when the index is not what the generator writes. */
const LIVE_ROUNDS = () => entries(ROOT).filter((e) => e.kind === 'legacy').map((e) => e.round);

test('R217 ⑦a: DEV-NOTES.md is the RECENT rounds only, newest first', () => {
  const rounds = LIVE_ROUNDS();
  assert.ok(rounds.length > 0, 'it still has round headings');
  assert.deepEqual(checkNotes(ROOT), [], 'the index is the generated one, and every entry file is well-formed');
  /* ⚠ (#R218) THE ASSERTION IS THE ORDER, NOT THE NUMBER. This line read `rounds[0] === 217`, which is
     a test that pins the value the round that wrote it happened to have — so it fails on the next
     round for doing exactly what standing instruction 9 asks (prepend). It is the same trap the memory
     index records for #R203. What #R217 was protecting is that the newest heading is FIRST, which is
     the max, and the loop below already re-checks the whole ordering. The build stamp is separately
     tied to this same maximum by tests/r207 ⑬, so "which round is newest" still has one owner. */
  assert.equal(rounds[0], Math.max(...rounds), 'the newest round is at the top (standing instruction 9 — prepend)');
  assert.ok(Math.min(...rounds) >= 200, `nothing below R200 is left here — found R${Math.min(...rounds)}`);
  for (let i = 1; i < rounds.length; i++) {
    assert.ok(rounds[i] < rounds[i - 1], `newest-first: R${rounds[i]} follows R${rounds[i - 1]}`);
  }
});

test('R217 ⑦b: DEV-NOTES-ARCHIVE.md is everything older, oldest first', () => {
  assert.ok(existsSync(join(ROOT, 'DEV-NOTES-ARCHIVE.md')), 'the archive exists');
  const md = rd('DEV-NOTES-ARCHIVE.md');
  const rounds = ROUND_HEADS(md);
  assert.ok(rounds.includes(199) && rounds.includes(86), 'it carries the range it took over');
  /* ⚠ (#R280) THE BOUNDARY IS NOT A CONSTANT. #R217 put it at 199 and #R280 moved it to 259,
     because DEV-NOTES.md had grown back to 14,704 lines. What must hold is the RELATION — the
     two files never overlap — so that is what is asserted, and the boundary can move again
     without this test having to be edited to keep meaning the same thing. */
  const live = LIVE_ROUNDS();
  assert.ok(Math.max(...rounds) < Math.min(...live),
    `the archive and DEV-NOTES.md overlap — archive reaches R${Math.max(...rounds)}, DEV-NOTES starts at R${Math.min(...live)}`);
  for (let i = 1; i < rounds.length; i++) {
    assert.ok(rounds[i] >= rounds[i - 1], `oldest-first: R${rounds[i]} follows R${rounds[i - 1]}`);
  }
});

test('R217 ⑦c: Architecture.md is the CURRENT spec — no round appendices left in it', () => {
  const md = readSpec(ROOT);   /* the spec: the map and its chapters (architecture-split) */
  assert.ok(!/^## 19\. ラウンド別補足/m.test(md), '§19 moved to the round records');
  assert.equal([...md.matchAll(/^### #R\d+ 補足/gm)].length, 0,
    'a per-round appendix in the spec is what "両者が混同されて混ざる" was');
});

test('R217 ⑦d: every §19 appendix landed under its own round, and none was dropped', () => {
  const H = '### 仕様補足（旧 `Architecture.md` §19 より移設・#R217）';
  const n = (md) => md.split(H).length - 1;
  assert.equal(n(allNotesText(ROOT)) + n(rd('DEV-NOTES-ARCHIVE.md')), 49,
    'the 51 appendices covered 49 rounds; each of those rounds carries one moved block');
});
}

/* ══════════ from tests/r204-checks.test.mjs — 3 of its 14 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: scripts/test-budget.mjs の天井は宣言が成果物（段の導出は scripts/tiers.mjs を実行している） */
/* (#R204) the round's header note is kept with its largest block, in tests/layer-simulators-checks.test.mjs */
const rd = read;

/* ── ① THE GATE IS A PRICE, NOT A LIST ────────────────────────────────────────────────────────
   「毎回毎回、テストに時間がかかりすぎ…明らかにテストが過剰。大幅に過剰。簡易でいい。」 */
test('R204 ① every spec in the gate is cheap, or is one of the two documented exceptions', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const bare = (f) => path.basename(String(f)).replace(/\.spec\.js$/, '');
  /* the second exception is the change's own specs — read from the diff, not from a name */
  const touched = new Set(changedSpecs());
  for (const f of tierSpecs('core')) {
    const n = bare(f), t = dur['tests/' + n + '.spec.js'];
    if (CORE_ALWAYS.includes(n) || touched.has(n)) continue;
    assert.ok(!(t > CORE_MAX_S), `${n} costs ${t}s and is neither always-on nor touched by this change`);
  }
  /* …and the exceptions are exactly the two the header names */
  for (const n of CORE_ALWAYS) assert.ok(!isDeep('tests/' + n + '.spec.js'), `${n} must gate`);
  /* a spec the change touched gates its PR whatever it costs — stated for an expensive one */
  const dear = allSpecs().find((f) => isDeep(f));
  assert.ok(dear && coreNames({ IM_CHANGED_SPECS: dear }).includes(bare(dear)), 'the change does not gate its own spec');
});

test('R204 ①b the gate got much cheaper and the whole suite did not grow', () => {
  const dur = JSON.parse(rd('tests/durations.json'));
  const times = Object.entries(dur).filter(([, v]) => typeof v === 'number').map(([, v]) => v).sort((a, b) => a - b);
  const p75 = times[Math.floor(times.length * 0.75)];
  const cost = (f) => (typeof dur[f] === 'number' ? dur[f] : p75);
  const core = tierSpecs('core', { fixed: true }).reduce((a, f) => a + cost(f), 0);
  const whole = allSpecs().reduce((a, f) => a + cost(f), 0);
  /* #R203 shipped a 484 s gate; this round is about that number being still too big */
  assert.ok(core < 484, `the gate is ${core}s, and #R203 already had 484s`);
  /* the ceilings: the gate's own, and the TOTAL — which is what stops "fix the gate by moving files" */
  const b = rd('scripts/test-budget.mjs');
  const cap = Number(/const BUDGET_S = (\d+);/.exec(b)[1]);
  const tot = Number(/const TOTAL_BUDGET_S = (\d+);/.exec(b)[1]);
  assert.ok(cap <= 200, `the gate ceiling is ${cap}s`);
  assert.ok(core <= cap, `the gate is ${core}s against its ${cap}s ceiling`);
  assert.ok(whole <= tot, `the suite is ${whole}s against its ${tot}s ceiling`);
  /* ⚠ #R203's two ceilings added up to 5,250; this round must not have created headroom */
  assert.ok(tot <= 5250, `the total ceiling is ${tot}s; #R203's two ceilings came to 5,250`);
  /* and nothing was deleted to get there */
  assert.ok(allSpecs().length >= 57, `${allSpecs().length} spec files — nothing may be deleted for speed`);
  assert.equal(tierSpecs('core', { fixed: true }).length + tierSpecs('deep').length, allSpecs().length);
});

test('R204 ①c the tier split is derived, not written down twice', () => {
  const t = rd('scripts/tiers.mjs');
  assert.doesNotMatch(t, /raw\.deep/, 'the explicit deep list is gone — the rule is the price');
  const dur = JSON.parse(rd('tests/durations.json'));
  assert.equal(dur.deep, undefined, 'and tests/durations.json no longer carries one');
  /* the change's own specs are computed, not named — and from the DIFF, not from a file-name
     pattern. «The newest rNNN spec» stopped matching at r668 once names carried a subject, and not
     one later round's spec ran in front of its PR; a diff has no spelling to drift from. */
  assert.doesNotMatch(t, /export function currentRoundSpec\b/, 'the name-derived «current round spec» is back');
  const some = allSpecs().slice(-2);
  const env = { IM_CHANGED_SPECS: some.join('\n') };
  assert.deepEqual(changedSpecs(env), some.map((f) => path.basename(f, '.spec.js')).sort());
  for (const n of changedSpecs(env)) assert.ok(coreNames(env).includes(n), `${n} was touched and is not in core`);
  assert.ok(fixedCoreNames().every((n) => coreNames({ IM_CHANGED_SPECS: '' }).includes(n)), 'the fixed gate is always in core');
});
}

/* ══════════ from tests/r175-checks.test.mjs — 1 of its 16 test(s) ══════════ */
{
/* (#R175) the round's header note is kept with its largest block, in tests/layer-boot-graph-checks.test.mjs */

const root = new URL('../', import.meta.url);
const ROOT = fileURLToPath(root);
const index = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('R175 ③: the build stamp was bumped', async () => {
  /* (#R176) The point of this test is that the stamp MOVES. (#R756) …and «each round pins its own
     value» was a rule a round had to REMEMBER: #R756 shipped, merged and deployed with the stamp
     still naming R755 while every gate was green, and the fix then tied the stamp to «the newest
     `## R<N>` in DEV-NOTES.md» — a second hand-kept fact for the first to agree with.

     (2026-09-25) THE STAMP IS NOW WRITTEN BY THE BUILD from the commit being built
     (scripts/build-stamp.mjs: `<committer time>Z-<sha>`), so it moves with every commit and nobody
     can forget it. What this test guarded — «a build that ships without moving the stamp is
     indistinguishable in production from the one before it» — can now only come back if a stamp is
     typed into index.html again or the build stops filling it; that is what is asked.
     (consolidation) 'R204 ⑦b both build stamps name the SAME round, and it is not an older one'
     asked exactly this of exactly this file, and is folded in here. Its note: #R205 found that pin
     naming 'R204' failed the round after — the third time a stamp did that (#R174 left it at R171,
     #R203 pinned its own spec's file name); the invariant was always «the stamps agree and neither
     goes backwards», which the build now guarantees. */
  assert.deepEqual(await generatedStampProblems(index), [], 'the build stamp can go stale again');
});
}

/* ══════════ from tests/r304-checks.test.mjs — 3 of its 7 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（ci.yml）・scripts/worktree.mjs は gh を呼ぶ CLI で副作用なしには起動できない（deep-alarm は実行している） */
/* (#R304) the round's header note is kept with its largest block, in tests/layer-boot-graph-checks.test.mjs */

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
  /* (ci-build-once) …and the build's: the deep tier now needs the run's one build, so a red nightly
     build SKIPS it — the alarm must still fire on that night, not read «skipped» and stay quiet. */
  assert.match(alarm, /needs: \[(?:[\w-]+, )*browser-deep(?:, [\w-]+)*\]/, 'the alarm reads the deep tier\'s result');
  assert.match(alarm, /needs: \[[^\]]*\bbuild\b[^\]]*\][\s\S]*?needs\.build\.result != 'success'/, 'a red build must wake the alarm, not skip it');
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
   AGENTS.md §1 sends every session through `node scripts/worktree.mjs status` before it starts, so
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
}

/* ══════════ from tests/r305-checks.test.mjs — 1 of its 17 test(s) ══════════ */
{
/* 綴りのまま残した検査の理由: 対象が CSS・HTML・文書・設定ファイルで、そのテキスト自体が出荷物である（docs/FILES.md） */
/* (#R305) the round's header note is kept with its largest block, in tests/layer-warnings-drawing-checks.test.mjs */
/* ⚠ A CHECK THAT SAYS 「this spelling must be gone」 HITS THE COMMENT THAT EXPLAINS WHY IT WENT.
   This project has paid for that twenty-five times; ask the question of the text that RUNS. */

/* ── ⑯ the report file that is no longer in the repository is not claimed to be ──────────────
   「USGS.能登.pdf は不要なため削除してください。」 The file ledger is a statement about what is here. */
test('R305 ⑯ the deleted source PDF is gone from the tree and from the ledger', () => {
  assert.ok(!existsSync(resolve(ROOT, 'USGS.能登.pdf')), 'the file is deleted');
  const files = read('docs/FILES.md');
  assert.ok(!/USGS\.能登\.pdf/.test(files), 'and docs/FILES.md no longer lists it');
  /* ⚠ the MMI ramp it was read out of does NOT change — the numbers were taken from it in #R224 and
     they are still the numbers. What changes is only the claim that the paper is in this repo. */
  const sm = noComments(read('js/seismic.js'));
  assert.match(sm, /MMI/, 'the seismic module still carries the scale it was read into');
});
}
