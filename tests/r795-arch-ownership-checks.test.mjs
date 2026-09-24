/* ============================================================================
 *  R795 — tests that pinned an implementation's SHAPE became tests of its PROPERTIES
 * ----------------------------------------------------------------------------
 *  Stage 1 of the ownership refactor (DEV-NOTES #R795). Three instruments changed hands:
 *    ① "every export is imported by name from js/"  →  scripts/export-readers.mjs: a reader is any
 *       file in js/, src/, scripts/ or tests/ that reaches the name (static, namespace or dynamic)
 *    ② "no unexported top-level declaration in js/" →  gone; scripts/check-split-scope.mjs measures
 *       the hazard it stood for (a free identifier that resolves to nothing)
 *    ③ "lines < N" over the shell and three files    →  scripts/global-surface.mjs: IM_HOST members
 *       and window.* publications, by NAME, ratcheted both ways
 *  Each is exercised here against a synthetic tree, so the instrument is proven to detect the
 *  defect it exists for — not merely to pass on today's repository (tests/r180's lesson: a check
 *  that has never fired is not a check that passes).
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { deadExports, reachedNames, namedExports } from '../scripts/export-readers.mjs';
import { hostMembers, windowPublications } from '../scripts/global-surface.mjs';
import { checkSplitScope } from '../scripts/check-split-scope.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'intmap-r786-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

/* ── ① export-readers ────────────────────────────────────────────────────────────────────── */
test('① an export nobody reaches is dead; a reader in tests/ or src/ or scripts/ keeps it alive', () => {
  const dir = tree({
    'js/a.js': 'export function alive(){}\nexport function onlyTestReads(){}\nexport function onlySrcReads(){}\nexport function dead(){}\nexport const viaNamespace = 1;\nexport function viaDynamic(){}\n',
    'js/b.js': "import { alive } from './a.js';\nimport * as A from './a.js';\nalive(); A.viaNamespace;\n",
    'src/w.js': "import { onlySrcReads } from '../js/a.js';\nonlySrcReads();\n",
    'tests/t.test.mjs': "import { onlyTestReads } from '../js/a.js';\nconst m = await import('../js/a.js'); m.viaDynamic();\n",
  });
  try {
    const { dead } = deadExports(dir);
    assert.deepEqual(dead, ['js/a.js: dead'], 'exactly the one export nothing reaches is reported');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① a module that reads its OWN export does not count as its reader', () => {
  const dir = tree({
    'js/a.js': "export function selfOnly(){}\nselfOnly();\nimport { selfOnly as x } from './a.js';\n",
    'js/b.js': '',
  });
  try {
    assert.deepEqual(deadExports(dir).dead, ['js/a.js: selfOnly']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('① the three forms of reaching a name are all seen', () => {
  const s = "import { p, q as r } from './x.js';\nimport * as NS from './y.js';\nNS.s; NS.t();\nconst m = await import('./z.js'); m.u;\n(await import('./w.js')).v;\nimport('./k.js').then((mod) => mod.w);\nconst { y, z: zz } = await import('./q.js');\n";
  const got = reachedNames(s);
  for (const n of ['p', 'q', 's', 't', 'u', 'v', 'w', 'y', 'z']) assert.ok(got.has(n), 'reached: ' + n);
  assert.ok(!got.has('r'), 'the local alias is not the exported name');
  assert.deepEqual(namedExports('export function f(){}\nexport const g = 1, h = 2;\nconst i = 3; export { i as j };\n'), ['f', 'g', 'h', 'j']);
});

test('① on this repository, no js/ export is dead (the gate r175 ③ runs, from the shared derivation)', () => {
  const { dead, exportsOf } = deadExports(ROOT);
  assert.deepEqual(dead, []);
  let n = 0; for (const v of exportsOf.values()) n += v.length;
  assert.ok(n > 100, 'the derivation actually saw the exports (' + n + ')');
});

/* ── ② the declaration ban is gone; the property it stood for is still measured ──────────── */
test('② a js/ module may have a private top-level function; a bare name that resolves to nothing still fails', () => {
  /* the real checker reads the repository's js/ — so the property is shown on the live tree: it is
     green today (r168 #7), and it has at least one file with a private top-level declaration now
     that the ban is lifted. If neither holds, this test is asserting about an empty set. */
  const problems = checkSplitScope();
  assert.deepEqual(problems, [], 'split-scope: ' + problems.map((p) => p.file + ': ' + p.msg).join('\n'));
  /* …and the r175 ③ source no longer carries the ban */
  const r175 = readFileSync(join(ROOT, 'tests', 'r175-checks.test.mjs'), 'utf8');
  assert.ok(!/offenders\.push\(`js\/\$\{f\}: \$\{n\.kind\} declaration`\)/.test(r175), 'r175 ③ still forbids a top-level declaration');
  assert.ok(r175.includes("deadExports(ROOT)"), 'r175 ③ reads the shared derivation');
});

/* ── ③ global-surface ────────────────────────────────────────────────────────────────────── */
test('③ the surface is measured by NAME — a member added to IM_HOST and a new window global are each named', () => {
  const dir = tree({
    'js/app-body.js': "const IM_HOST={ get lang(){ return 'en'; }, get user(){ return u; }, set user(v){ u=v; }, t:function(){} };\nIM_HOST.late=1;\n/* window.NotAGlobal = 1 */\nconst s='window.NotEither = 2';\nwindow.IntMapOne=1;\n",
    'js/x.js': "try{ window.IntMapTwo = {}; }catch(_){}\nwindow['Bracketed'] = 3;\nif (a == window.notAnAssignment) {}\n",
    'src/y.js': 'window.FromSrc = 0;\n',
  });
  try {
    const h = hostMembers(dir);
    assert.deepEqual(h.members, ['lang', 'late', 't', 'user']);
    assert.deepEqual(h.writable, ['late', 'user'], 'a setter and a later assignment are the writable ones');
    const w = windowPublications(dir);
    assert.deepEqual(Array.from(w.keys()).sort(), ['Bracketed', 'FromSrc', 'IntMapOne', 'IntMapTwo'], 'comments, strings and comparisons are not publications');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('③ the baseline is names, and the live tree matches it (the gate check:surface)', () => {
  const base = JSON.parse(readFileSync(join(ROOT, 'tests', 'global-surface-baseline.json'), 'utf8'));
  assert.ok(Array.isArray(base.host) && base.host.length > 200, 'the baseline lists IM_HOST members by name');
  assert.ok(Array.isArray(base.window) && base.window.length > 400, 'the baseline lists window globals by name');
  const h = hostMembers(ROOT), w = windowPublications(ROOT);
  assert.deepEqual(h.members, base.host);
  assert.deepEqual(h.writable, base.hostWritable);
  assert.deepEqual(Array.from(w.keys()).sort(), base.window);
});

/* ── the ceiling itself must not come back ────────────────────────────────────────────── */
test('no test holds a line ceiling over a source file any more', () => {
  /* the eleven sites retired this round, by the assertion form they all used */
  const hits = [];
  for (const f of readdirSync(join(ROOT, 'tests')).filter((x) => /\.test\.mjs$/.test(x) && x !== 'r795-arch-ownership-checks.test.mjs')) {
    const s = readFileSync(join(ROOT, 'tests', f), 'utf8');
    for (const m of s.matchAll(/assert\.ok\(\s*[\w.()'"/\\-]*(?:lines|shell|atlas|n\('js\/[\w-]+\.js'\)|\w+\.split\((?:'\\n'|String\.fromCharCode\(10\)|NL)\)\.length)\s*<\s*\d[\d_]*\s*,/g)) hits.push(f + ': ' + m[0].slice(0, 80));
  }
  assert.deepEqual(hits, [], 'line ceilings still standing:\n' + hits.join('\n'));
});
