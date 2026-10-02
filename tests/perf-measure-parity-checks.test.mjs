/* ============================================================================
 *  (perf-measure-parity) the start-up budget measures, here, the bytes CI measures
 *  (.gitattributes, scripts/perf-budget.mjs, scripts/merge-driver.mjs)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-01/02: five pull requests were green here and red in CI on check:perf, and each
 *  raised its ceiling by hand to CI's number. Two causes, measured apart (dev-notes/2026-10-02-perf-measure-parity.md):
 *    · CRLF. core.autocrlf=true wrote a carriage return into every text file .gitattributes did not
 *      name, and the build copies data/ and the static pages into dist/ verbatim — the same commit was
 *      121,742 bytes heavier in dist/ here than on CI. (The bundler's half was byte-identical.)
 *    · WHICH TREE. A pull_request run builds «Merge <head> into <main now>»; a local build is the
 *      branch. #872's head built to brotli 1134.3 kB here, its CI merge to 1135.5 kB = CI's number.
 *  And on main: #886 and #887 each raised eager.modules 299 → 300; merged, main measured 301.
 *
 *   ① a checkout on a core.autocrlf=true machine holds the repository's bytes, for every text kind
 *     the site ships — and the check fails when the declaration that makes it so is taken out
 *   ② the same commit, checked out CRLF-configured and LF, BUILDS to the same perf numbers
 *     (measureFrom over a real vite build with the real build-report plugin) and the same dist/
 *   ③ the measurement says which tree it is of: a stale dist/, a branch behind origin/main, no stamp
 *   ④ the perf ledger merges its counts as counts: two +1s to eager.modules make +2, while a byte row
 *     both sides moved still takes main's value — through a real `git rebase`
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtFrom, mergeClash, measureFrom, parityProblems, treeState } from '../scripts/perf-budget.mjs';
import { buildReportPlugin } from '../scripts/build-report.mjs';
import { declarations, install, mergeJson } from '../scripts/merge-driver.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const real = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} → ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout.trim();
}
function put(file, text) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); }
function scratch(t, tag) {
  const dir = mkdtempSync(join(tmpdir(), `intmap-perfparity-${tag}-`));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function newRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  for (const [k, v] of [['user.email', 't@example.invalid'], ['user.name', 'test'], ['core.autocrlf', 'false'], ['commit.gpgsign', 'false']]) git(dir, ['config', k, v]);
}
const commitAll = (dir, msg) => { git(dir, ['add', '-A']); git(dir, ['commit', '-q', '-m', msg]); };
function files(dir, skip = new Set(['.git', 'node_modules'])) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const f = join(d, e.name);
      if (e.isDirectory()) walk(f); else out[relative(dir, f).replace(/\\/g, '/')] = readFileSync(f);
    }
  };
  walk(dir);
  return out;
}

/* A small site of every text kind the real one ships, all with line breaks inside the places a
   carriage return would survive a build: a ?raw import, a template literal, CSS, JSON, and files the
   build copies verbatim (vite's publicDir does what vite.config.js's copyStatic does: no transform). */
const SITE = {
  'index.html': '<!doctype html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<script type="module" src="./main.js"></script>\n</body>\n</html>\n',
  'main.js': "import './style.css';\nimport note from './note.txt?raw';\nimport data from './data.json';\nconst page = `line one\nline two\n${note}`;\ndocument.title = page + data.name;\nimport('./lazy.js').then((m) => m.run());\n",
  'lazy.js': 'export function run() {\n  return `lazy\n  chunk`;\n}\n',
  'note.txt': 'a note\nover two lines\n',
  'data.json': '{\n  "name": "x",\n  "rows": [1, 2, 3]\n}\n',
  'style.css': 'body {\n  color: red;\n}\n\n.a {\n  margin: 0;\n}\n',
  'public/data/rows.json': '{\n  "rows": [\n    1,\n    2\n  ]\n}\n',
  'public/data/places.js': 'window.PLACES = [\n  "a",\n  "b"\n];\n',
  'public/about.html': '<!doctype html>\n<p>about</p>\n<p>us</p>\n',
  'public/site.webmanifest': '{\n  "name": "t"\n}\n',
  'public/icon.svg': '<svg xmlns="http://www.w3.org/2000/svg">\n<rect/>\n</svg>\n',
  'public/robots.txt': 'User-agent: *\nAllow: /\n',
  'public/sitemap.xml': '<?xml version="1.0"?>\n<urlset>\n</urlset>\n',
  'README.md': '# t\n\ntext\n',
};

/* the origin a session clones from, with THIS checkout's .gitattributes (or a variant of it) */
function origin(t, attrs) {
  const dir = scratch(t, 'origin');
  newRepo(dir);
  put(join(dir, '.gitattributes'), attrs);
  for (const [rel, text] of Object.entries(SITE)) put(join(dir, rel), text);
  commitAll(dir, 'site');
  return dir;
}
function cloneAs(t, src, autocrlf) {
  const dir = join(scratch(t, `clone-${autocrlf}`), 'c');
  git(dirname(dir), ['-c', `core.autocrlf=${autocrlf}`, 'clone', '-q', '-c', `core.autocrlf=${autocrlf}`, src, dir]);
  return dir;
}
/* the declaration that makes a checkout hold the blob: every `*` line of the real .gitattributes.
   Taking them out is the tree before this change — the check must fail on it. */
const ATTRS = real('.gitattributes');
const WITHOUT = ATTRS.split('\n').filter((l) => !/^\*\s/.test(l)).join('\n');

test('① a CRLF-configured checkout holds the repository\'s bytes for every text kind the site ships', (t) => {
  assert.notEqual(WITHOUT, ATTRS, '.gitattributes still has a `*` line — the declaration this file is about');
  const src = origin(t, ATTRS);
  const win = files(cloneAs(t, src, 'true')), lf = files(cloneAs(t, src, 'false'));
  for (const rel of Object.keys(SITE)) {
    assert.ok(win[rel], rel);
    assert.ok(!win[rel].includes(0x0d), `${rel}: a core.autocrlf=true checkout wrote a carriage return`);
    assert.ok(win[rel].equals(lf[rel]), `${rel}: the two checkouts differ`);
  }
  /* …and the check can fail: without the declaration, the same clone is the tree that was measured */
  const before = files(cloneAs(t, origin(t, WITHOUT), 'true'));
  const crlf = Object.keys(SITE).filter((rel) => before[rel].includes(0x0d));
  assert.ok(crlf.length >= Object.keys(SITE).length - 1, `without it, a CRLF checkout carries carriage returns (${crlf.length} files)`);
});

async function buildAndMeasure(dir) {
  const { build } = await import('vite');
  const out = join(dir, '.perf', 'build-report.json');
  await build({
    configFile: false, root: dir, logLevel: 'silent', publicDir: 'public',
    /* the entry is named `main`, as vite.config.js names it — the build report finds the boot by that name */
    build: { outDir: join(dir, 'dist'), emptyOutDir: true, rolldownOptions: { input: { main: join(dir, 'index.html') } } },
    plugins: [buildReportPlugin({ out })],
  });
  const r = JSON.parse(readFileSync(out, 'utf8'));
  return { m: measureFrom(r, join(dir, 'dist')), dist: files(join(dir, 'dist')) };
}

test('② the same commit, checked out CRLF-configured and LF, builds to the same perf numbers and the same dist/', async (t) => {
  const src = origin(t, ATTRS);
  const win = await buildAndMeasure(cloneAs(t, src, 'true'));
  const lf = await buildAndMeasure(cloneAs(t, src, 'false'));
  assert.ok(win.m.eager.raw > 0 && win.m.async.raw > 0 && win.m.dist.data > 0, 'the fixture has an eager half, an async half and verbatim data');
  assert.deepEqual(win.m, lf.m, 'every number check:perf judges is the same from both checkouts');
  assert.deepEqual(Object.keys(win.dist).sort(), Object.keys(lf.dist).sort());
  for (const [rel, buf] of Object.entries(lf.dist)) assert.ok(buf.equals(win.dist[rel]), `dist/${rel} differs`);
  /* the measurement this replaces: the verbatim copies and the ?raw text carried the carriage returns */
  const before = await buildAndMeasure(cloneAs(t, origin(t, WITHOUT), 'true'));
  assert.ok(before.m.dist.total > lf.m.dist.total, `without the declaration dist/ was heavier (${before.m.dist.total} > ${lf.m.dist.total})`);
  assert.ok(before.m.dist.data > lf.m.dist.data, 'and its data/ with it');
  assert.ok(before.m.eager.raw > lf.m.eager.raw, 'and a ?raw import carried them into the eager bundle');
});

test('③ the measurement says which tree it is of', (t) => {
  /* pure: each gap is named, and CI (the reference) has none */
  const head = 'a'.repeat(40), ok = { ci: false, head, built: head.slice(0, 8), main: 'b'.repeat(40), behind: 0 };
  assert.deepEqual(parityProblems(ok), []);
  assert.deepEqual(parityProblems({ ci: true }), []);
  assert.match(parityProblems({ ...ok, behind: 3 }).join(' '), /3 commit\(s\).*Merge HEAD into origin\/main/);
  assert.match(parityProblems({ ...ok, built: 'c'.repeat(8) }).join(' '), /built from c{8}.*rebuild/);
  assert.match(parityProblems({ ...ok, built: null }).join(' '), /no build stamp/);
  assert.match(parityProblems({ ...ok, main: null }).join(' '), /no origin\/main/);
  assert.match(parityProblems({ ...ok, head: null }).join(' '), /not a git checkout/);

  /* and the state is git's, read from a real repository: a branch, a main that moved, a stamped dist/ */
  const dir = scratch(t, 'tree');
  newRepo(dir);
  put(join(dir, 'a.txt'), 'a\n'); commitAll(dir, 'base');
  git(dir, ['checkout', '-q', '-b', 'feat']);
  put(join(dir, 'b.txt'), 'b\n'); commitAll(dir, 'feat');
  git(dir, ['checkout', '-q', 'main']);
  put(join(dir, 'c.txt'), 'c\n'); commitAll(dir, 'main moved');
  git(dir, ['update-ref', 'refs/remotes/origin/main', 'main']);
  git(dir, ['checkout', '-q', 'feat']);
  const sha = git(dir, ['rev-parse', '--short=8', 'HEAD']);
  put(join(dir, 'dist', 'index.html'), `<script>window.INTMAP_BUILD='2026-10-02T00:00:00Z-${sha}'</script>`);
  assert.equal(builtFrom(join(dir, 'dist')), sha);
  const s = treeState({ cwd: dir, distDir: join(dir, 'dist'), env: {} });
  assert.equal(s.behind, 1, 'the commit main has and the branch does not');
  assert.deepEqual(parityProblems(s).length, 1);
  assert.deepEqual(treeState({ cwd: dir, distDir: join(dir, 'dist'), env: { GITHUB_ACTIONS: 'true' } }), { ci: true });
  git(dir, ['rebase', '-q', 'main']);
  assert.match(parityProblems(treeState({ cwd: dir, distDir: join(dir, 'dist'), env: {} })).join(' '), /was built from .*rebuild/, 'after the rebase the dist/ is of the old head');
  put(join(dir, 'dist', 'index.html'), `<script>window.INTMAP_BUILD='2026-10-02T00:00:00Z-${git(dir, ['rev-parse', '--short=8', 'HEAD'])}'</script>`);
  assert.deepEqual(parityProblems(treeState({ cwd: dir, distDir: join(dir, 'dist'), env: {} })), [], 'rebased and rebuilt: the tree CI builds');
});

test('④ tests/perf-baseline.json merges its counts as counts and its sizes as measurements', (t) => {
  const decl = declarations(ROOT).find((d) => d.path === 'tests/perf-baseline.json');
  assert.ok(decl && decl.clashBy, 'the perf ledger names its writer for the per-row rule');
  const perf = JSON.parse(real('tests/perf-baseline.json'));
  const counts = Object.keys(perf.eager).filter((k) => mergeClash(['eager', k]) === 'sum');
  assert.ok(counts.length >= 2, `the writer calls some eager rows counts (${counts})`);
  assert.equal(mergeClash(['async', 'chunks', 'modules']), null, 'a chunk named like a count is still bytes');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const o = clone(perf), a = clone(perf), b = clone(perf);
  for (const k of counts) { a.eager[k] = o.eager[k] + 1; b.eager[k] = o.eager[k] + 1; }   /* #886 and #887 */
  a.eager.gzip = o.eager.gzip + 700; b.eager.gzip = o.eager.gzip + 300;                    /* both re-measured */
  const r = mergeJson(o, a, b, { up: 'b', clash: decl.clash, clashOf: mergeClash });
  for (const k of counts) assert.equal(r.value.eager[k], o.eager[k] + 2, `${k}: two +1s are +2`);
  assert.equal(r.value.eager.gzip, b.eager.gzip, 'a size both moved takes main\'s value');
  assert.equal(r.tookUpstream, 1, 'and asks for the rebuild that re-measures it');

  /* through git: a real rebase in a throwaway clone with this checkout's driver and the writer */
  const dir = scratch(t, 'rebase');
  newRepo(dir);
  put(join(dir, '.gitattributes'), ATTRS);
  const seen = new Set(), todo = ['scripts/merge-driver.mjs', decl.clashBy];
  while (todo.length) {
    const f = posix.normalize(todo.pop());
    if (seen.has(f)) continue;
    seen.add(f);
    put(join(dir, f), real(f));
    for (const m of real(f).matchAll(/^\s*import\s[^'"]*['"](\.{1,2}\/[^'"]+)['"]/gm)) todo.push(posix.join(posix.dirname(f), m[1]));
  }
  assert.equal(install(dir).ok, true);
  const j = (v) => JSON.stringify(v, null, 2) + '\n';
  put(join(dir, 'tests/perf-baseline.json'), j(o)); commitAll(dir, 'base');
  git(dir, ['checkout', '-q', '-b', 'feat']);
  put(join(dir, 'tests/perf-baseline.json'), j(a)); commitAll(dir, 'feat raises');
  git(dir, ['checkout', '-q', 'main']);
  put(join(dir, 'tests/perf-baseline.json'), j(b)); commitAll(dir, 'another PR landed');
  git(dir, ['checkout', '-q', 'feat']);
  git(dir, ['rebase', '-q', 'main']);
  const merged = JSON.parse(readFileSync(join(dir, 'tests/perf-baseline.json'), 'utf8'));
  for (const k of counts) assert.equal(merged.eager[k], o.eager[k] + 2, `${k} after the rebase`);
  assert.equal(merged.eager.gzip, b.eager.gzip);
});
