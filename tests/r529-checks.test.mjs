/* ============================================================================
 *  #R529 — the node tier is DISCOVERED, not listed
 * ----------------------------------------------------------------------------
 *  `test:checks` was one hand-written literal in package.json naming all 292 files, and three
 *  guards had been stacked on it because the literal kept finding new ways to be wrong:
 *
 *    #R301  a file left out of it never runs — so it is not a weaker test, it is not a test.
 *           tests/r210 and tests/r211 had never once been executed; five of r211's twelve
 *           assertions were red, the earliest broken ninety rounds before anybody looked.
 *    #R385  the list against ITSELF — it named tests/r356-checks.test.mjs twice for twenty-two
 *           green rounds, because the guard's first act was `new Set(listed)`.
 *    #R390  what counted as a test was read off the NAME, so tests/security-logic.mjs (31 tests,
 *           #R138) was outside anything the guard could demand, and sat unlisted for three rounds
 *           with every gate in the repository green.
 *
 *  Every one of those is a true finding about a list that did not have to exist. `node --test`
 *  finds test files itself, so this round deleted the literal, scripts/check-test-list.mjs (132
 *  lines), the `node-tests` rule in scripts/doc-facts.mjs, and the twelve assertions in other
 *  rounds' files that said «this file is in the list». MEASURED before and after: the set the glob
 *  discovers is the same 292 paths the literal named, with no difference in either direction.
 *
 *  ⚠ WHAT THESE CHECKS EXIST TO STOP:
 *   ① The literal coming back — a `tests/…` path re-appearing in the script, one round at a time.
 *   ② #R390's hazard outliving the list it was written against. The runner's idea of a test file
 *      is its NAME, so a `.mjs` under tests/ that imports `node:test` under any other name is
 *      invisible: it never runs, so it never fails and never passes. That is why
 *      tests/security-logic.mjs was RENAMED this round rather than special-cased a second time.
 *      ⚠ The question is asked of what each file CONTAINS, not of any spelling in the script —
 *      and the population that must NOT be demanded (helpers, fixtures, corpora) is shown to be
 *      non-empty, because a subset test over an empty universe passes by looking at nothing.
 *   ③ The declared floor drifting off the one the command needs. Node 20 SEARCHES DIRECTORIES and
 *      does not accept a glob; Node ≥21 globs and rejects a bare directory (measured here on
 *      24.18.0: `node --test tests` resolves the directory as a MODULE and fails). `engines` is
 *      the promise and `.nvmrc` is what CI installs, so they have to agree.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, globSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pkg = () => JSON.parse(read('package.json'));
const posix = (p) => p.split(String.fromCharCode(92)).join('/');
/* the four spellings of the import, as scripts/check-test-list.mjs read them from #R390 until
   this round removed it — the rule has to hold for a file nobody has written yet */
const DECLARES_NODE_TESTS =
  /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|^\s*import\s+)['"]node:test['"]/m;

/* the pattern is read OUT of the script, never restated here: a check that carries its own copy
   of the glob would pass against a pattern nobody runs (#R500) */
const patternInUse = () => {
  const s = pkg().scripts['test:checks'];
  assert.match(s, /^node --test /, 'test:checks no longer starts the node runner');
  const args = s.replace(/^node --test /, '').trim().split(/\s+/);
  assert.equal(args.length, 1,
    `test:checks takes ${args.length} arguments — one pattern, discovered, is the whole of #R529`);
  assert.match(args[0], /^".+"$/,
    'the pattern is not double-quoted — an unquoted glob is expanded by some shells and passed through by others');
  return args[0].slice(1, -1);
};

/* ── ① the script discovers, and names no file ──────────────────────────────────────────────── */
test('#R529 ① test:checks carries one pattern, and no individual test file is named anywhere', () => {
  patternInUse();
  /* the failure this round removed: paths creeping back in one at a time. Asked of every script,
     because the literal was moved between them twice before it settled here. */
  for (const [key, v] of Object.entries(pkg().scripts)) {
    if (key.startsWith('//')) continue;                       /* the prose keys describe the history */
    const named = String(v).match(/tests\/r\d+[a-z]*-checks\.test\.mjs/g);
    assert.equal(named, null,
      `package.json scripts["${key}"] names ${named && named[0]} — a hand-maintained list of test files is coming back`);
  }
});

/* ── ② everything that declares tests is reached by the pattern the script actually uses ────── */
test('#R529 ② every .mjs under tests/ that declares node tests is discovered, and nothing else is demanded', () => {
  const discovered = new Set(globSync(patternInUse(), { cwd: ROOT }).map(posix));
  const all = globSync('tests/**/*.mjs', { cwd: ROOT }).map(posix);
  const declaring = all.filter((f) => DECLARES_NODE_TESTS.test(read(f)));

  assert.ok(discovered.size > 250,
    `only ${discovered.size} files discovered — the tier has been cut apart by a pattern change`);
  assert.ok(declaring.length > 250, `only ${declaring.length} files declare node tests — the evidence is missing, not the tests`);

  const invisible = declaring.filter((f) => !discovered.has(f));
  assert.deepEqual(invisible, [],
    'these import node:test but the runner never opens them, so they can be red for ever: ' + invisible.join(', '));

  /* ⚠ the population this rule must NOT demand has to be shown to exist, or the subset test above
     is satisfiable by a tests/ directory containing nothing but test files (#R521) */
  const others = all.filter((f) => !declaring.includes(f));
  assert.ok(others.length >= 3,
    `only ${others.length} .mjs under tests/ are helpers/fixtures/corpora — «not demanded» is being asserted over an empty set`);
  for (const f of others) {
    assert.ok(!discovered.has(f), `${f} declares no tests but the runner executes it as one`);
  }

  /* the file whose NAME was the exception until this round (#R390; 31 tests, #R138) */
  assert.ok(discovered.has('tests/security-logic.test.mjs'),
    'tests/security-logic.test.mjs is not discovered — the one file that needed a source rule is invisible again');
  assert.equal(pkg().scripts['test:security'], 'node --test tests/security-logic.test.mjs',
    'test:security still points at the old path');
});

/* ── ③ the declared floor is a version the command actually runs on ─────────────────────────── */
test('#R529 ③ engines and .nvmrc agree, and the floor is a version that globs', () => {
  const declared = pkg().engines.node;
  const m = declared.match(/^>=(\d+)$/);
  assert.ok(m, `engines.node is "${declared}" — this check reads a ">=N" floor`);
  const floor = Number(m[1]);
  const pinned = Number(read('.nvmrc').trim());
  assert.ok(Number.isInteger(pinned), '.nvmrc does not hold a major version');
  assert.equal(floor, pinned,
    `engines.node promises >=${floor} but .nvmrc installs ${pinned} — CI tests a version the declaration does not describe`);
  assert.ok(floor >= 21,
    `engines.node allows Node ${floor}, where \`node --test\` searches DIRECTORIES instead of globbing — test:checks would run nothing`);
});
