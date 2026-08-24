// R385 source-level regression checks.
//
// The round: `test:checks` in package.json is one long hand-maintained literal, and from #R356
// (bff4c91) until #R379 (214d433) it named `tests/r356-checks.test.mjs` TWICE — once after
// `tests/r339-checks.test.mjs`, once again near the tail. Twenty-two rounds. The guard written in
// #R301, `scripts/check-test-list.mjs`, compares that literal against `tests/` in BOTH directions
// and was green through every one of them.
//
// ⚠⚠⚠ A REPEATED ENTRY IS THE THIRD DIRECTION, AND #R301 CANNOT SEE IT BY CONSTRUCTION. Its first
// act is `new Set(listed)`, which throws multiplicity away before either comparison runs. 「is every
// file on disk in the list?」 and 「is every path in the list on disk?」 are both perfectly satisfied
// by a list that says the same true thing twice — so the shape of the bug is not 「the check was
// wrong」, it is 「the check answered two questions and the failure was in a third」.
//
// What it cost, measured: `node --test` ran that file twice on every `npm run test:checks` and
// every CI run for 22 rounds; and `scripts/doc-facts.mjs` counts the entries of this same literal
// and requires `docs/TESTING.md` to state the same number, so the documented 「N Node test files」
// was one too high the whole time — a duplicate does not only waste time, it makes the list lie
// about itself, and a second document was repeating the lie because it was derived from it.
//
// Everything below is a RELATION, per the standing practice, and where a relation is about a piece
// of machinery the machinery is RUN rather than grepped for (#R298: 「検査が緑だったのは『呼び出しが
// 書かれているか』を訊いていたから」).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { checkTestList, checkTestListHere } from '../scripts/check-test-list.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = () => JSON.parse(read('package.json'));
const entries = (script) => String(script || '').split(/\s+/).filter((x) => /^tests\//.test(x));

/* ── ① the live list does not name anything twice ─────────────────────────────────────────────── */
test('#R385 ① no path appears more than once in `test:checks` — the thing that was false for 22 rounds', () => {
  const listed = entries(pkg().scripts['test:checks']);
  const times = new Map();
  for (const f of listed) times.set(f, (times.get(f) || 0) + 1);
  const repeated = [...times].filter(([, n]) => n > 1).map(([f, n]) => `${f} ×${n}`);
  assert.deepEqual(repeated, [], 'package.json "test:checks" names the same file more than once');
  /* ⚠ and the scan is looking at something: a check over an empty list cannot fail */
  assert.ok(listed.length >= 190, `it found the list to scan (got ${listed.length} entries)`);
});

/* ── ② the guard catches it — exercised on a list that is wrong on purpose ────────────────────── */
test('#R385 ② the guard reports a repeated entry, which before this round it could not see', () => {
  const script = 'node --test tests/a.test.mjs tests/b.test.mjs tests/a.test.mjs';
  const out = checkTestList(script, ['tests/a.test.mjs', 'tests/b.test.mjs']);
  assert.equal(out.length, 1, `exactly one problem, got ${JSON.stringify(out)}`);
  assert.equal(out[0].kind, 'duplicate');
  assert.equal(out[0].file, 'tests/a.test.mjs');
  /* the message has to carry the COUNT — 「it is in there twice」 is the whole finding, and a reader
     who is told only the filename has to go and count the occurrences by hand */
  assert.match(out[0].msg, /\b2\b/, `the message says how many times: ${out[0].msg}`);
  assert.match(out[0].msg, /tests\/a\.test\.mjs/);
});

/* ── ③ once per repeated path, not once per extra copy ────────────────────────────────────────── */
test('#R385 ③ three copies is one finding that says 「3」, not two findings', () => {
  const script = 'node --test tests/a.test.mjs tests/a.test.mjs tests/a.test.mjs';
  const out = checkTestList(script, ['tests/a.test.mjs']);
  assert.equal(out.length, 1, `one finding per repeated path, got ${out.length}`);
  assert.match(out[0].msg, /\b3\b/, `and it says three: ${out[0].msg}`);
  /* ⚠ AND IT COUNTS PATHS THAT ARE NOT `*.test.mjs` TOO. `tests/security-logic.mjs` is in the real
     list and is not a node test file by IS_NODE_TEST — but naming it twice still runs it twice. */
  const helper = checkTestList('node --test tests/security-logic.mjs tests/security-logic.mjs',
    ['tests/security-logic.mjs']);
  assert.equal(helper.length, 1, 'a repeated helper is a repeat as well');
  assert.equal(helper[0].kind, 'duplicate');
});

/* ── ④ it does not invent duplicates, and it composes with the two #R301 directions ───────────── */
test('#R385 ④ a clean list reports nothing, and a list wrong in all three ways reports all three', () => {
  /* the negative: distinct entries, everything on disk — silence */
  assert.deepEqual(
    checkTestList('node --test tests/a.test.mjs tests/b.test.mjs', ['tests/a.test.mjs', 'tests/b.test.mjs']),
    [], 'no problem where there is none');
  /* all three at once: `a` twice (duplicate), `gone` listed but absent (missing), `c` on disk but
     never named (unlisted) — the new direction must not swallow or shadow the old two */
  const out = checkTestList('node --test tests/a.test.mjs tests/a.test.mjs tests/gone.test.mjs',
    ['tests/a.test.mjs', 'tests/c.test.mjs']);
  assert.deepEqual(out.map((p) => `${p.kind} ${p.file}`).sort(),
    ['duplicate tests/a.test.mjs', 'missing tests/gone.test.mjs', 'unlisted tests/c.test.mjs']);
});

/* ── ⑤ through the entry point static-checks actually calls, on a repository wrong on purpose ─── */
test('#R385 ⑤ checkTestListHere() sees it too — the same door `npm run check:static` goes through', () => {
  const dir = mkdtempSync(join(tmpdir(), 'imtestlist-'));
  try {
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'tests', 'a.test.mjs'), '');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { 'test:checks': 'node --test tests/a.test.mjs tests/a.test.mjs' },
    }));
    const out = checkTestListHere(dir);
    assert.equal(out.length, 1, `the real entry point reports it, got ${JSON.stringify(out)}`);
    assert.equal(out[0].kind, 'duplicate');
    /* …and the same repository with the repeat removed is silent, so ⑤ is measuring the repeat and
       not some other complaint about a two-file repository */
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { 'test:checks': 'node --test tests/a.test.mjs' },
    }));
    assert.deepEqual(checkTestListHere(dir), [], 'and it is quiet once the copy is gone');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── ⑥ a duplicate FAILS the gate — it is an error, not a warning nobody reads ─────────────────── */
test('#R385 ⑥ every problem the guard returns becomes an error in check:static', () => {
  const src = read('scripts/static-checks.mjs');
  assert.match(src, /for \(const p of checkTestListHere\(ROOT\)\) err\(/,
    'static-checks maps EVERY returned problem to err(), so a new kind fails the gate automatically');
  assert.doesNotMatch(src, /checkTestListHere\(ROOT\)\)\s*warn\(/, 'not a warning');
});

/* ── ⑦ the count in docs/TESTING.md is the number of DISTINCT files ───────────────────────────── */
/* ⚠ scripts/doc-facts.mjs already compares that number against the raw token count. It agreed with
   the inflated list for 22 rounds because both sides counted the same duplicate. Ban the duplicate
   and the two counts coincide — this asserts the relation the duplicate broke, not the arithmetic
   doc-facts already does. */
test('#R385 ⑦ docs/TESTING.md states the number of distinct Node test files, not of list entries', () => {
  const listed = entries(pkg().scripts['test:checks']).filter((x) => x.endsWith('.mjs'));
  const distinct = new Set(listed).size;
  assert.equal(listed.length, distinct, 'the two counts are the same because there is no repeat');
  const m = /(\d+)\s+Node test files/.exec(read('docs/TESTING.md'));
  assert.ok(m, 'docs/TESTING.md states the count');
  assert.equal(Number(m[1]), distinct, `docs/TESTING.md says ${m && m[1]}, the list has ${distinct} distinct files`);
});

/* ── ⑧ this file is in the list it is testing ─────────────────────────────────────────────────── */
test('#R385 ⑧ tests/r385-checks.test.mjs is in `test:checks` — exactly once', () => {
  const listed = entries(pkg().scripts['test:checks']);
  assert.equal(listed.filter((f) => f === 'tests/r385-checks.test.mjs').length, 1);
});
