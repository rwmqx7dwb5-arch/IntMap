/* ============================================================================
 *  IntMap · mutation tests break a private copy, never the checkout   (mutation-tests-off-tree)
 * ----------------------------------------------------------------------------
 *  THE DEFECT. Thirteen test files proved a gate goes red by writing a wrong fact into the WORKING
 *  TREE — js/, docs/, Architecture.md, privacy.html, data/, tests/ — running the gate and putting
 *  it back. `node --test` runs files in parallel, so every other file reading the same tree could
 *  see the mutant; the tree lock (tests/helpers/gate-lock.mjs) serialised the writers and nothing
 *  else. MEASURED 2026-09-30 in one `npm test`: 10 red, none of them a product defect —
 *    · 6 files died waiting 600/900 s for the lock;
 *    · 1 breach of the lock itself (#R623 measured 2.7 % of hand-overs);
 *    · 3 readers that took no lock (hazard-other-build-and-gate R236 «js/ holds 331»,
 *      hazard-other-i18n-shape-audit R241 ①, hazard-radiation-layer #R585 ④ ENOENT) tripped over
 *      js/__r717-probe.js, which tests/chronos-claims-checks.test.mjs created for one gate run.
 *
 *  THE SHAPE NOW. A mutation test builds a private copy of the checkout (tests/helpers/scratch-tree.mjs)
 *  — hard links to the working tree's files, its own .git over this repository's index and objects —
 *  breaks the copy, and runs the gate FROM the copy (every gate derives its ROOT from its own
 *  location, so that is the whole root injection). check:static's `tree-writer` rule
 *  (scripts/tree-writers.mjs) refuses a test that writes the checkout, so the shape cannot come back.
 *
 *    ① the copy is the working tree as git and a gate see it: same files, same bytes, same index,
 *      same HEAD; untracked-but-visible is visible; ignored is absent
 *    ② a change to the copy never reaches the checkout (the files are hard links — the one way
 *      that could go wrong), and mutate() puts back bytes, absence and directories
 *    ③ two processes breaking their own copies at the same moment do not see each other
 *    ④ removing a copy removes its links and never what they point at; an abandoned copy is swept
 *    ⑤ the rule refuses every shape the thirteen writers had, and accepts the temp-dir writes
 *      the rest of the suite makes
 *    ⑥ the rule is WIRED: check:static, run from a copy holding a test that writes the checkout,
 *      goes red naming it — and the tree lock is left to the tests of the lock itself
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scratchTree, _internals } from './helpers/scratch-tree.mjs';
import { scanSource } from '../scripts/tree-writers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28 });
const SCRATCH = scratchTree();

/* ── ① the copy is the working tree ────────────────────────────────────────────────────────── */
test('① the copy carries the working tree, its index and its HEAD — and nothing gitignored', () => {
  const listed = (cwd) => git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0').filter(Boolean).sort();
  const here = listed(ROOT).filter((f) => existsSync(join(ROOT, f)) && lstatSync(join(ROOT, f)).isFile());
  const there = listed(SCRATCH.root);
  assert.deepEqual(there, here, 'git in the copy does not list the files git in the checkout lists — a gate that sweeps `ls-files` reads a different tree');
  assert.ok(here.length > 1000, 'the checkout listed only ' + here.length + ' files — the comparison above compared nothing');
  /* the index is the checkout's, not a fresh one: the same blob per path */
  assert.equal(git(SCRATCH.root, ['ls-files', '-s']), git(ROOT, ['ls-files', '-s']), 'the copy\'s index is not this checkout\'s index');
  assert.equal(git(SCRATCH.root, ['rev-parse', 'HEAD']).trim(), git(ROOT, ['rev-parse', 'HEAD']).trim(), 'the copy names another HEAD');
  /* bytes, sampled across the tree (every file would be 389 MB of reading for no extra question) */
  for (const f of ['Architecture.md', 'package.json', 'js/legal-text.js', 'scripts/doc-facts.mjs', here[Math.floor(here.length / 2)]]) {
    assert.ok(SCRATCH.read(f, null).equals(readFileSync(join(ROOT, f))), f + ' differs between the copy and the checkout');
  }
  /* what git does not carry is absent — except the dependencies and the outside-git datasets, which a gate needs */
  assert.equal(SCRATCH.exists('dist'), false, 'dist/ is gitignored and must not be in the copy — a test asking «without the build» relies on it');
  assert.ok(SCRATCH.exists('node_modules/acorn/package.json'), 'the copy cannot resolve the dependencies the gates import');
  const sets = JSON.parse(readFileSync(join(ROOT, 'data-assets.json'), 'utf8')).sets;
  for (const s of Object.values(sets)) {
    if (existsSync(join(ROOT, s.path))) assert.ok(SCRATCH.exists(s.path), s.path + ' lives outside git and is placed in this checkout, but not in the copy — doc-facts reads it');
  }
  /* and no link surfaces as an untracked file to a gate that asks git */
  assert.doesNotMatch(git(SCRATCH.root, ['ls-files', '--others', '--exclude-standard']), /^node_modules$/m,
    'the dependency link is visible to `git ls-files --others` in the copy');
});

/* ── ② nothing reaches the checkout ─────────────────────────────────────────────────────────── */
test('② a change to the copy never reaches the checkout, and mutate() puts back bytes, absence and directories', async () => {
  const f = 'Architecture.md';
  const before = readFileSync(join(ROOT, f));
  /* the copy's file IS the checkout's file until it is changed — that is the case to prove safe */
  const r = SCRATCH.mutate([
    { file: f, text: 'broken\n' },
    { file: 'docs/__mutation-probe/deep/new.md', text: 'x\n' },
    { file: 'package.json', remove: true },
  ], () => ({
    copy: SCRATCH.read(f),
    probe: SCRATCH.exists('docs/__mutation-probe/deep/new.md'),
    pkg: SCRATCH.exists('package.json'),
  }));
  assert.deepEqual(r, { copy: 'broken\n', probe: true, pkg: false }, 'the changes were not visible inside the copy');
  assert.ok(readFileSync(join(ROOT, f)).equals(before), 'writing the copy wrote the checkout — a hard link was written through');
  assert.equal(existsSync(join(ROOT, 'docs/__mutation-probe')), false, 'a file created in the copy appeared in the checkout');
  assert.ok(existsSync(join(ROOT, 'package.json')), 'removing a file from the copy removed it from the checkout');
  /* restored: the exact bytes, the absence, and the directories the mutation had to create */
  assert.ok(SCRATCH.read(f, null).equals(before), f + ' was not restored to its bytes');
  assert.ok(SCRATCH.exists('package.json'), 'a removed file was not put back');
  assert.equal(SCRATCH.exists('docs/__mutation-probe'), false, 'a directory the mutation created was left behind');
  /* …even when the run throws, and for an async run */
  assert.throws(() => SCRATCH.mutate([{ file: f, text: 'x' }], () => { throw new Error('boom'); }), /boom/);
  assert.ok(SCRATCH.read(f, null).equals(before), 'a throwing run left the copy mutated');
  await SCRATCH.mutate([{ file: f, text: 'y' }], async () => { assert.equal(SCRATCH.read(f), 'y'); });
  assert.ok(SCRATCH.read(f, null).equals(before), 'an async run left the copy mutated');
  /* a path outside the copy is refused rather than resolved */
  assert.throws(() => SCRATCH.write('../escape.txt', 'x'), /outside the copy/);
  assert.throws(() => SCRATCH.write(join(ROOT, 'x'), 'x'), /relative to the copy/);
});

/* ── ③ two at once ──────────────────────────────────────────────────────────────────────────── */
test('③ two processes breaking their own copies at the same moment do not see each other', async () => {
  /* The thing the lock existed for, asked directly: two writers, the same path, the same instant.
     Each child builds its copy, writes its own mark into js/legal-text.js, waits until the other
     has written too (a rendezvous file in a temp dir), then reads its copy back. */
  const meet = join(tmpdir(), 'intmap-mutation-meet-' + process.pid + '-' + Date.now());
  mkdirSync(meet, { recursive: true });
  const helper = new URL('./helpers/scratch-tree.mjs', import.meta.url).href;
  const child = (mark) => `
    import { scratchTree } from ${JSON.stringify(helper)};
    import { writeFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    const T = scratchTree();
    const out = T.mutate([{ file: 'js/legal-text.js', text: ${JSON.stringify(mark)} }], () => {
      writeFileSync(join(${JSON.stringify(meet)}, ${JSON.stringify(mark)}), '');
      const other = ${JSON.stringify(mark === 'A' ? 'B' : 'A')};
      const until = Date.now() + 120000;
      while (!existsSync(join(${JSON.stringify(meet)}, other)) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
      return T.read('js/legal-text.js');
    });
    process.stdout.write(out);`;
  const before = readFileSync(join(ROOT, 'js/legal-text.js'));
  const run = (mark) => new Promise((res) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', child(mark)], { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('close', (code) => res({ code, out }));
  });
  const [a, b] = await Promise.all([run('A'), run('B')]).finally(() => rmSync(meet, { recursive: true, force: true }));
  assert.deepEqual([a, b], [{ code: 0, out: 'A' }, { code: 0, out: 'B' }],
    'each process must read back its own mark — a copy that sees the other process\'s write is not private');
  assert.ok(readFileSync(join(ROOT, 'js/legal-text.js')).equals(before), 'the checkout was written by one of the two');
});

/* ── ④ removal never follows a link ────────────────────────────────────────────────────────── */
test('④ removing a copy removes its links, never what they point at — and an abandoned copy is swept', () => {
  const T = scratchTree();
  const root = T.root;
  const nm = join(ROOT, 'node_modules');
  const count = readdirSync(nm).length;
  T.dispose();
  assert.equal(existsSync(root), false, 'dispose() left the copy behind');
  assert.equal(readdirSync(nm).length, count, 'removing the copy removed entries from the checkout\'s node_modules — it followed the link');
  /* a copy whose owner is gone: the pid in its name is a process that has exited */
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  const orphan = join(tmpdir(), _internals.PREFIX + dead + '-orphan' + Date.now());
  mkdirSync(join(orphan, 'js'), { recursive: true });
  _internals.sweepAbandoned();
  assert.equal(existsSync(orphan), false, 'a copy left by a process that no longer exists was not swept');
});

/* ── ⑤ the rule, shape by shape ─────────────────────────────────────────────────────────────── */
test('⑤ tree-writer refuses every shape the thirteen writers had, and accepts temp-dir writes', () => {
  const H = `import { writeFileSync, unlinkSync, renameSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
    import fs from 'node:fs';
    import { join, dirname } from 'node:path';
    import { tmpdir } from 'node:os';
    import { fileURLToPath } from 'node:url';
    import { scratchTree } from './helpers/scratch-tree.mjs';
    const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
    const U = new URL('../', import.meta.url);\n`;
  const refused = (body) => { const p = scanSource(H + body); assert.ok(p && p.length, 'accepted:\n' + body); return p; };
  const accepted = (body) => { const p = scanSource(H + body); assert.deepEqual(p, [], 'refused:\n' + body + '\n' + JSON.stringify(p)); };
  /* the shapes, as the thirteen files wrote them */
  refused(`writeFileSync(join(ROOT, 'Architecture.md'), 'x');`);                                 // doc-facts mutations
  refused(`const path = (p) => fileURLToPath(new URL(p, U)); writeFileSync(path('js/__probe.js'), 'x');`);  // chronos
  refused(`const probe = join(ROOT, 'docs', 'p.md'); writeFileSync(probe, 'x'); unlinkSync(probe);`);        // sweep ③
  refused(`const TESTS = join(ROOT, 'tests'); const victim = join(TESTS, 'r9-x.test.mjs'); writeFileSync(victim, '');`); // round-naming
  refused(`const REPORT = join(ROOT, '.perf', 'r.json'); renameSync(REPORT, REPORT + '.hidden');`);        // test-tiers
  refused(`fs.writeFileSync(join(ROOT, 'data/x.js'), 'x');`);                                    // histfidelity
  refused(`function breaking(file, t) { writeFileSync(join(ROOT, file), t); } breaking('a.md', 'x');`);    // a helper
  refused(`function put(p, t) { writeFileSync(p, t); } put(join(ROOT, 'a.md'), 'x');`);           // a helper that writes its parameter
  refused(`writeFileSync('Architecture.md', 'x');`);                                              // relative to the cwd
  refused(`writeFileSync(join(process.cwd(), 'a'), 'x');`);
  refused(`{ const nest = join(ROOT, '.agents/n'); mkdirSync(nest); writeFileSync(join(nest, '.git'), ''); rmSync(nest, { recursive: true }); }`);
  const s = refused(`const S = scratchTree(); writeFileSync(join(S.root, 'Architecture.md'), 'x');`);
  assert.equal(s[0].kind, 'scratch', 'a write into a copy with fs must be named as that — its files are hard links into the checkout');
  /* and what the rest of the suite does is fine */
  accepted(`const dir = mkdtempSync(join(tmpdir(), 'x-')); writeFileSync(join(dir, 'a'), 'x'); rmSync(dir, { recursive: true });`);
  accepted(`writeFileSync(join(tmpdir(), 'a'), 'x');`);
  accepted(`const out = join(process.env.TEMP || tmpdir(), 'a'); writeFileSync(out, 'x');`);
  accepted(`const dir = mkdtempSync(join(tmpdir(), 'x-')); const dst = join(dir, 'x'); fs.copyFileSync(join(ROOT, 'a'), dst);`);   // reading the checkout is fine
  accepted(`function put(p, t) { writeFileSync(p, t); } put(join(mkdtempSync(join(tmpdir(), 'x')), 'a'), 'x');`);
  accepted(`const S = scratchTree(); S.write('Architecture.md', 'x'); S.mutate([{ file: 'a', text: 'x' }], () => 0);`);
  /* scope, not spelling: the same name bound to a temp dir in one block and the checkout in none */
  accepted(`{ const dir = mkdtempSync(join(tmpdir(), 'a')); writeFileSync(join(dir, 'x'), ''); } { const dir = mkdtempSync(join(tmpdir(), 'b')); writeFileSync(join(dir, 'y'), ''); }`);
  refused(`{ const dir = mkdtempSync(join(tmpdir(), 'a')); writeFileSync(join(dir, 'x'), ''); } { const dir = join(ROOT, 'b'); writeFileSync(join(dir, 'y'), ''); }`);
});

/* ── ⑥ wired, and the lock is left to its own tests ─────────────────────────────────────────── */
test('⑥ check:static goes red on a test that writes the checkout, and no test takes the tree lock to write', () => {
  /* EVALUATED: the whole gate, run from a private copy that holds one offending test file. */
  const victim = 'tests/__tree-writer-probe-checks.test.mjs';
  const r = SCRATCH.mutate([{
    file: victim,
    text: "import { writeFileSync } from 'node:fs';\nimport { join, dirname } from 'node:path';\nimport { fileURLToPath } from 'node:url';\n"
      + "const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');\nwriteFileSync(join(ROOT, 'Architecture.md'), 'broken');\n",
  }], () => SCRATCH.node('scripts/static-checks.mjs'));
  assert.equal(r.code, 1, 'check:static stayed green with a test that writes Architecture.md into the checkout:\n' + r.out.slice(-3000));
  assert.match(r.out, /\[tree-writer\] tests\/__tree-writer-probe-checks\.test\.mjs:5 /, 'it failed, but not on the planted writer:\n' + r.out.slice(-3000));
  /* …and on the real tree the rule has nothing to say (the whole gate is run by `npm test` itself) */
  const here = spawnSync(process.execPath, [join(ROOT, 'scripts/tree-writers.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(here.status, 0, 'a test writes the checkout:\n' + here.stdout);

  /* THE LOCK. Its reason to exist was writers of the tree, and the rule above refuses them — so a
     test that still takes it is making the suite wait for nothing. The lock stays (removing it is
     not this change's to make); the files that take it are the ones whose SUBJECT is the lock,
     i.e. that also read its internals. Discovered, not listed. */
  const takers = [];
  (function walk(d) {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== 'fixtures') walk(p); continue; }
      if (!/\.m?js$/.test(f.name) || p === join(ROOT, 'tests', 'helpers', 'gate-lock.mjs')) continue;
      const src = readFileSync(p, 'utf8');
      if (/\bwithTreeLock\s*\(/.test(src)) takers.push({ p, ownSubject: /\b(lockPaths|lockIntact)\b/.test(src) });
    }
  })(join(ROOT, 'tests'));
  const stray = takers.filter((t) => !t.ownSubject).map((t) => t.p);
  assert.deepEqual(stray, [], 'these files take the tree lock without testing it — nothing writes the tree any more, so they wait for nothing');
});
