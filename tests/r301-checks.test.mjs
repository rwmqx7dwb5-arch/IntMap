// R301 source-level regression checks.
//
// The round: `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` were never in the
// `test:checks` list, so from the rounds that wrote them until now neither had ever been executed.
// r210 would have passed. r211 was RED — five of its twelve tests — and nothing printed it.
//
// tests/r260-checks.test.mjs ⑥ guards the opposite face of the same hazard («a checks file left out
// of the list is green for ever»), but only for itself. This round generalises it, and the guard
// deliberately does NOT live in the list it guards: it runs from `npm run check:static`.
//
// Everything below is a RELATION, per the standing practice — and where a relation is about a piece
// of machinery, the machinery is RUN rather than grepped for. #R298 paid for the difference: a
// check that asks 「is the call written?」 is green while the call returns early on every device.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkTestList, checkTestListHere, listMjs, IS_NODE_TEST } from '../scripts/check-test-list.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const listedIn = (script) => new Set(String(script).split(/\s+/).filter((x) => /^tests\//.test(x)));
const pkg = () => JSON.parse(read('package.json'));

/* ── ① the two orphans are in the list, and so is this file ───────────────────────────────────── */
test('#R301 ① the two files that had never run are in `npm run test:checks` — and so is this one', () => {
  const listed = listedIn(pkg().scripts['test:checks']);
  for (const f of ['tests/r210-checks.test.mjs', 'tests/r211-checks.test.mjs', 'tests/r301-checks.test.mjs']) {
    assert.ok(listed.has(f), `${f} is not in test:checks — it would assert nothing`);
  }
});

/* ── ② …and so is EVERY node test file, which is the general form of ① ────────────────────────── */
test('#R301 ② no node test file on disk is missing from the list, and no listed path is missing from disk', () => {
  /* the real repository, through the same entry point static-checks.mjs uses */
  assert.deepEqual(checkTestListHere(ROOT).map((p) => p.msg), [],
    'the list and the disk disagree — see scripts/check-test-list.mjs');
  /* ⚠ and the scan is looking at something: a check over an empty set is a check that cannot fail */
  const onDisk = listMjs(ROOT);
  const tests = onDisk.filter((f) => IS_NODE_TEST.test(f));
  assert.ok(tests.length >= 140, `it found the node tests to compare (got ${tests.length})`);
  assert.ok(onDisk.length > tests.length, 'and it looked at the non-test .mjs files too, without demanding them');
});

/* ── ③ the guard actually catches both failures — exercised, not grepped ──────────────────────── */
test('#R301 ③ the guard reports a file left out of the list, and a listed file that is not there', () => {
  const script = 'node --test tests/a.test.mjs tests/helper-logic.mjs';
  /* the shape this round was written for: on disk, never named */
  const unlisted = checkTestList(script, ['tests/a.test.mjs', 'tests/b.test.mjs', 'tests/helper-logic.mjs']);
  assert.equal(unlisted.length, 1, 'exactly one problem');
  assert.equal(unlisted[0].kind, 'unlisted');
  assert.equal(unlisted[0].file, 'tests/b.test.mjs');
  /* the mirror: named, but deleted or renamed — `node --test` fails on the whole tier for that */
  const missing = checkTestList(script, ['tests/a.test.mjs']);
  assert.deepEqual(missing.map((p) => p.kind + ' ' + p.file).sort(),
    ['missing tests/helper-logic.mjs']);
  /* ⚠ AND IT DOES NOT DEMAND WHAT IT SHOULD NOT. The fixtures, the corpora and the shared helpers
     under tests/ are not node test files and must not be dragged into the list; the two hand-named
     `*-logic.mjs` files that predate the convention are listed and are allowed to be. */
  assert.deepEqual(checkTestList(script, ['tests/a.test.mjs', 'tests/helper-logic.mjs', 'tests/fixtures/x.mjs']), []);
  assert.ok(!IS_NODE_TEST.test('tests/app-source.mjs'), 'a plain .mjs helper is not a node test file');
  assert.ok(IS_NODE_TEST.test('tests/r197-space.test.mjs'), '…and a name that is not `*-checks` still is one');
});

/* ── ④ the guard is not an entry in the list it guards ────────────────────────────────────────── */
test('#R301 ④ the guard runs from check:static, so dropping it from test:checks cannot disarm it', () => {
  const scripts = pkg().scripts;
  assert.ok(!listedIn(scripts['test:checks']).has('scripts/check-test-list.mjs'),
    'the guard is not in the list it guards');
  assert.match(read('scripts/static-checks.mjs'), /checkTestListHere\(ROOT\)/,
    'static-checks runs it');
  /* ⚠ and static-checks is reached by BOTH doors into the suite, not only the parallel one */
  assert.match(scripts['test:seq'], /static-checks\.mjs/, '`npm run test:seq` runs the static gate');
  assert.match(scripts['check:static'], /static-checks\.mjs/, '…and it has a door of its own');
  assert.match(read('scripts/test-parallel.mjs'), /static-checks\.mjs/, '`npm test` runs it too');
});

/* ── ⑤ the revived r211 asserts RELATIONS, derived from the repository ──────────────────── */
/* ⚠ ASKED IN THE POSITIVE ONLY, ON PURPOSE. The obvious version of this test — 「tests/r211 no
   longer contains `collectPond(`, `label:'➤'`, `for(const mult of [`」 — cannot work: the rewritten
   r211 names every one of those spellings, in the comment explaining why it stopped pinning it and
   in the assertion that it has not come back. A check written that way hits its own prose, which
   this project has now done more than twenty times. What is checkable is the shape of what
   REPLACED them: a construct that reads the repository cannot be satisfied by a literal. */
test('#R301 ⑤ the revived r211 derives its assertions instead of pinning spellings', () => {
  const r211 = read('tests/r211-checks.test.mjs');
  assert.match(r211, /\[\.\.\.code\.matchAll\(\/\\bfetch\\\(\/g\)\]/,
    'the fetch guard is swept over every call site rather than four named throws');
  assert.match(r211, /readdirSync\(new URL\('\.\.\/js\/locales\//,
    'the science page is asked about every language the app ships, not about five');
  assert.match(r211, /const pushesFirst =/, 'undo is asserted as an ORDER, not as a signature');
  assert.match(r211, /matchAll\(\/kind:'\(\[a-z\]\+\)'\/g\)/, 'the vector kinds are read off the file');
  /* and it records what it cost, so the next reader does not have to re-derive it */
  assert.match(r211, /THIS FILE WAS NEVER RUN/, 'the header says why five of its tests were red');
});

/* ── ⑥ the defect the revived file found: no fetch in world-packs reads a body it did not check ── */
test('#R301 ⑥ the crop cell read checks its status, so an outage cannot read as «no cultivation»', () => {
  const src = read('js/world-packs.js');
  const i = src.indexOf("GAEZ+'/identify?");
  assert.ok(i > 0, 'the crop identify call is still there');
  const body = src.slice(i, i + 700);
  /* ⚠ THE ORDER IS THE POINT. ArcGIS answers an outage two ways: an HTTP status, and 200 with an
     error body. Both have to be asked BEFORE `j.value` is read, because the line that reads it
     prints 「no cultivation recorded in this cell」 for a null — a server error handed to the reader
     as a measured fact about the ground. */
  const ok = body.indexOf('if(!r.ok) throw'), errBody = body.indexOf('j.error) throw'), val = body.indexOf('const v=j&&j.value');
  assert.ok(ok >= 0, 'the HTTP status is checked');
  assert.ok(errBody >= 0, 'and the 200-with-an-error-body case is checked');
  assert.ok(val >= 0, 'and the value is still read');
  assert.ok(ok < val && errBody < val, 'both are checked BEFORE the value is read');
  assert.match(src.slice(i, i + 1400), /no cultivation recorded in this cell/,
    'the sentence that must never be printed for an outage is the one downstream of these guards');
});

/* ── ⑦ the round is written down where the next session will look ─────────────────────────────── */
test('#R301 ⑦ the round is in DEV-NOTES and the node-tier size is stated correctly', () => {
  const dn = read('DEV-NOTES.md');
  assert.match(dn, /R301/, 'DEV-NOTES has this round');
  /* the count docs/TESTING.md states is checked against package.json by check:docs; assert here
     that the two moved together, so a run of this file alone still catches a half-done edit */
  const n = String(pkg().scripts['test:checks']).split(/\s+/).filter((x) => x.endsWith('.mjs')).length;
  const m = /\*\*(\d+) Node test files\*\*/.exec(read('docs/TESTING.md'));
  assert.ok(m, 'docs/TESTING.md still states how large the node tier is');
  assert.equal(Number(m[1]), n, 'and states the size the list actually has');
  /* ⚠ (#R304) BOTH BUILD STAMPS NAME THE CURRENT ROUND — WHICHEVER ROUND THAT IS. This read
     `='R301'` literally, which is the shape tests/r175.spec.js already warns about in as many words:
     「pinning the round that happened to be current when it was written makes it fail on every
     subsequent round instead」. It did — the very next round. The rule (#R174) is that the two stamps
     agree with each other and with the newest round in DEV-NOTES, which is what they are for. */
  const idx = read('index.html');
  const newest = Math.max(...[...dn.matchAll(/^## R(\d{2,4}) /gm)].map((m) => +m[1]));
  assert.ok(newest > 0, 'DEV-NOTES has a newest round heading');
  assert.match(idx, new RegExp(`window\.__imBuild='R${newest}';`), 'the first build stamp names the newest round');
  assert.match(idx, new RegExp(`window\.INTMAP_BUILD='[0-9-]+-R${newest}';`), '…and so does the second');
  /* and the new script is a tracked, documented file rather than a stray */
  assert.ok(existsSync(join(ROOT, 'scripts/check-test-list.mjs')), 'the guard exists');
  assert.ok(readdirSync(join(ROOT, 'scripts')).includes('check-test-list.mjs'), '…in scripts/');
});
