// ⚠⚠⚠ (#R301) THE LIST THAT DECIDES WHICH NODE TESTS EXIST, CHECKED AGAINST THE DISK.
//
// `npm run test:checks` is one long literal in package.json naming every node test file by hand.
// A file that is on disk but NOT in that literal is never executed — so it never fails, and it
// never passes either. It is not a weaker test; it is not a test.
//
// tests/r260-checks.test.mjs ⑥ already asks that question, but only about ITSELF, which means the
// only rounds it protects are the ones whose author was already thinking about the hazard. Measured
// (#R301): `tests/r210-checks.test.mjs` and `tests/r211-checks.test.mjs` were both left out when
// they were written and had never once run. When #R301 ran them, five of r211's twelve tests
// failed — the earliest broken by #R212, ninety rounds before anybody saw it.
//
// ⚠ THIS CHECK DELIBERATELY DOES NOT LIVE IN `test:checks`. A guard for a list cannot be an entry
// in the list it guards: dropping it would take the guard with it, which is the failure it exists
// to catch. It runs from scripts/static-checks.mjs, a separate top-level gate.
//
// ⚠⚠⚠ (#R385) THE THIRD DIRECTION: THE LIST AGAINST ITSELF. The two comparisons above are both
// perfectly satisfied by a list that names the same file twice, because the first thing this
// function used to do was `new Set(listed)` — multiplicity was discarded before either question was
// asked. Measured: from #R356 (bff4c91) to #R379 (214d433), `test:checks` named
// `tests/r356-checks.test.mjs` twice, and this guard was green for all twenty-two rounds. A repeat
// is not a correctness bug — the file runs, and passes, twice — but it charges every CI run for the
// second copy, and it makes the list lie about its own size: scripts/doc-facts.mjs counts these
// entries and requires docs/TESTING.md to state the number, so the documented count was one too
// high the whole time. Two documents agreeing is not corroboration when one is derived from the
// other. Regression: tests/r385-checks.test.mjs.
//
// Pure over its inputs, so tests/r301-checks.test.mjs can hand it a repository that is wrong on
// purpose and see it say so — rather than grepping static-checks.mjs for the call and calling that
// proof (#R298: 「検査が緑だったのは『呼び出しが書かれているか』を訊いていたから」).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/* A file matching this must be in the list. Anything else in tests/ (fixtures, corpora, the shared
   helpers, the two hand-named `*-logic.mjs` files that predate the convention) may be listed or
   not — but if it IS listed it still has to exist. */
export const IS_NODE_TEST = /\.test\.mjs$/;

/**
 * @param {string} script    the value of package.json scripts["test:checks"]
 * @param {string[]} onDisk  every .mjs under tests/, as repo-relative POSIX paths
 * @returns {{kind:'unlisted'|'missing'|'duplicate', file:string, msg:string}[]}
 */
export function checkTestList(script, onDisk) {
  const listed = String(script || '').split(/\s+/).filter((x) => /^tests\//.test(x));
  const listedSet = new Set(listed);
  const diskSet = new Set(onDisk);
  const out = [];
  /* (#R385) the list against itself, BEFORE it is compared with the disk — `listedSet` is where the
     evidence stops existing. Counted over every `tests/` token, not only the `*.test.mjs` ones: a
     repeated helper such as tests/security-logic.mjs is executed twice just the same. One finding
     per repeated path, carrying the count, rather than one per extra copy. */
  const times = new Map();
  for (const f of listed) times.set(f, (times.get(f) || 0) + 1);
  for (const [f, n] of times) {
    if (n > 1) {
      out.push({ kind: 'duplicate', file: f,
        msg: `package.json "test:checks" names ${f} ${n} times — it is executed ${n} times on every run, and the entry count that docs/TESTING.md is checked against is ${n - 1} too high` });
    }
  }
  for (const f of onDisk) {
    if (IS_NODE_TEST.test(f) && !listedSet.has(f)) {
      out.push({ kind: 'unlisted', file: f,
        msg: `${f} is not in package.json "test:checks" — it never runs, so it can be red for ever and nobody sees it` });
    }
  }
  for (const f of listedSet) {
    if (!diskSet.has(f)) {
      out.push({ kind: 'missing', file: f,
        msg: `package.json "test:checks" names ${f}, which is not on disk — the whole node tier fails before it reaches the rest` });
    }
  }
  return out;
}

/** every .mjs under `dir`, as paths relative to `root`, POSIX-separated */
export function listMjs(root, dir = join(root, 'tests'), out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) listMjs(root, abs, out);
    else if (e.name.endsWith('.mjs')) out.push(abs.slice(root.length + 1).split('\\').join('/'));
  }
  return out;
}

/** run it against this repository */
export function checkTestListHere(root) {
  const ROOT = root || resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return checkTestList(pkg.scripts && pkg.scripts['test:checks'], listMjs(ROOT));
}
