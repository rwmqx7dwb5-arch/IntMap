/* ============================================================================
 *  data-outside-git · データを git の外へ — 目録が正本で、無いものは赤く名指される
 * ----------------------------------------------------------------------------
 *  The defects, stated as they were (not as the answer this round reached —
 *  [[intmap-restate-the-defect-not-the-fix]]):
 *
 *    ① HUNDREDS OF MEGABYTES SAT IN PLAIN GIT AND EVERY WORKTREE EXPANDED ALL OF IT.
 *       data/border-detail/ (5,621 files, 415 MB as LF blobs) and data/hist-eras.js (10.6 MB)
 *       were tracked, so each `worktree.mjs new` wrote them again and the OneDrive master
 *       uploaded every regeneration.
 *    ② THE MANIFEST AND THE CONTENT COULD DISAGREE AND NOTHING WOULD NOTICE. There was no
 *       statement of which bytes were meant — a half-copied directory, a stale regeneration or
 *       a CRLF rewrite (this Windows checkout held both sets with CRLF; the blobs are LF) all
 *       read as «the data».
 *    ③ A GATE COULD BE GREEN WITH THE DATA ABSENT. `check:assets` judges the files dist/ has;
 *       a build without data/border-detail/ has thousands fewer to judge, and passed.
 *
 *  Everything here EVALUATES the code (scripts/data-assets.mjs, the real gate scripts in a
 *  checkout that lacks the data, master-sync across the commit that untracks a set) on
 *  fixtures that need no network. The one network-shaped fact — that the real manifest's
 *  Release assets are what it says — is proved by `npm run data:pull` itself, which every CI
 *  job that reads the data runs first.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync, cpSync, createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import yaml from 'js-yaml';
import * as DA from '../scripts/data-assets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WIN = process.platform === 'win32';
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');

/* ── fixtures ─────────────────────────────────────────────────────────────────────────────────── */
const tmp = (tag) => mkdtempSync(join(tmpdir(), `im-${tag}-`));
const drop = (dir) => {
  if (!existsSync(dir)) return;
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isSymbolicLink()) { unlinkSync(p); continue; }       // a link is removed, never followed
    if (e.isDirectory()) walk(p); else try { chmodSync(p, 0o644); } catch { /* removal says */ }
  } };
  try { walk(dir); } catch { /* best effort */ }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
};
const withStore = (fn) => async () => {
  const store = tmp('store');
  const was = process.env.INTMAP_DATA_STORE;
  process.env.INTMAP_DATA_STORE = store;
  try { await fn(store); } finally {
    if (was === undefined) delete process.env.INTMAP_DATA_STORE; else process.env.INTMAP_DATA_STORE = was;
    drop(store);
  }
};

/** A checkout-shaped directory with a manifest of two fixture sets, their store entries filled from
 *  archives packed by the real packer — the path a Release download takes, minus the network. */
async function fixture(store) {
  const src = tmp('src');
  mkdirSync(join(src, 'dir', 'sub'), { recursive: true });
  writeFileSync(join(src, 'dir', 'a.json'), '{"a":1}\n');
  writeFileSync(join(src, 'dir', 'sub', 'b.json'), '{"b":2}\n');
  writeFileSync(join(src, 'one.js'), 'window.__X = 1;\n');
  const dirD = DA.digestOf(join(src, 'dir'), 'dir'), fileD = DA.digestOf(join(src, 'one.js'), 'file');
  const m = { v: 1, repo: 'example/none', sets: {
    fx: { path: 'data/fx', kind: 'dir', sha256: dirD.sha256 },
    fy: { path: 'data/fy.js', kind: 'file', sha256: fileD.sha256 },
  } };
  for (const [id, from] of [['fx', join(src, 'dir')], ['fy', join(src, 'one.js')]]) {
    const arc = join(src, id + '.tar.gz');
    await DA.packSet(from, m.sets[id], arc);
    await DA.storeFromArchive(id, m.sets[id], arc);
  }
  const root = tmp('root');
  writeFileSync(join(root, DA.MANIFEST), JSON.stringify(m, null, 2) + '\n');
  drop(src);
  return { root, m };
}
const quiet = () => {};

/* ══ ① NOT IN GIT, AND ONE COPY FOR ANY NUMBER OF CHECKOUTS ════════════════════════════════════ */
test('① every set the manifest names is untracked AND ignored in this repository', () => {
  const m = DA.readManifest(ROOT);
  assert.ok(m && Object.keys(m.sets).length > 0, 'data-assets.json names no set — this rule would pass measuring nothing');
  for (const [id, s] of Object.entries(m.sets)) {
    const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '--', s.path], { encoding: 'utf8' }).trim();
    assert.equal(tracked, '', `«${id}» (${s.path}) is still tracked — it would be written into every worktree again`);
    const ign = spawnSync('git', ['-C', ROOT, 'check-ignore', '-q', '--no-index', s.path]);
    assert.equal(ign.status, 0, `«${id}» (${s.path}) is not ignored — a placed link or copy would show up as untracked`);
  }
});

test('① two checkouts get LINKS to ONE store copy of a directory set, not two expansions', withStore(async (store) => {
  const a = await fixture(store);
  const b = { root: tmp('root2') };
  cpSync(join(a.root, DA.MANIFEST), join(b.root, DA.MANIFEST));
  try {
    for (const r of [a.root, b.root]) assert.deepEqual(await DA.pull(r, { say: quiet }), [], 'pull must place both sets');
    const la = join(a.root, 'data', 'fx'), lb = join(b.root, 'data', 'fx');
    assert.ok(lstatSync(la).isSymbolicLink() && lstatSync(lb).isSymbolicLink(), 'a directory set must be linked, not expanded');
    assert.equal(realpathSync(la), realpathSync(lb), 'both checkouts must resolve to the same store entry');
    assert.ok(realpathSync(la).startsWith(realpathSync(store)), 'the link must point into the store, outside the checkout');
    assert.ok(!lstatSync(join(a.root, 'data', 'fy.js')).isSymbolicLink(), 'a file set is a plain copy (Dirent readers skip links)');
    /* worktree.mjs done → unlink: the link goes, the store stays */
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'data-assets.mjs'), 'unlink', '--root', a.root], { encoding: 'utf8', env: process.env });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(la), 'unlink must remove the link');
    assert.ok(existsSync(DA.storeEntry('fx', a.m.sets.fx.sha256)), 'unlink must never reach through the link into the store');
  } finally { drop(a.root); drop(b.root); }
}));

test('① the store refuses to live inside OneDrive', () => {
  const was = { s: process.env.INTMAP_DATA_STORE, o: process.env.OneDrive };
  try {
    process.env.OneDrive = join(tmpdir(), 'im-onedrive');
    process.env.INTMAP_DATA_STORE = join(process.env.OneDrive, 'intmap-data');
    assert.throws(() => DA.storeRoot(), /OneDrive/);
  } finally {
    if (was.s === undefined) delete process.env.INTMAP_DATA_STORE; else process.env.INTMAP_DATA_STORE = was.s;
    if (was.o === undefined) delete process.env.OneDrive; else process.env.OneDrive = was.o;
  }
});

/* ══ ② THE MANIFEST AND THE CONTENT CANNOT DISAGREE QUIETLY ════════════════════════════════════ */
test('② an altered copy is named, a pull refuses to overwrite it, and --force restores it', withStore(async (store) => {
  const { root } = await fixture(store);
  try {
    assert.deepEqual(await DA.pull(root, { copy: true, say: quiet }), []);
    assert.deepEqual(DA.problems(root), [], 'freshly placed sets must verify');
    writeFileSync(join(root, 'data', 'fx', 'a.json'), '{"a":2}\n');
    const why = DA.problems(root);
    assert.equal(why.length, 1);
    assert.match(why[0], /data\/fx is not the content data-assets\.json names/);
    assert.match(why[0], /npm run data:pull/);
    const refused = await DA.pull(root, { say: quiet });
    assert.equal(refused.length, 1, 'a copy that differs may be an unpublished regeneration — it must not be overwritten silently');
    assert.match(refused[0], /data:publish fx/);
    assert.deepEqual(await DA.pull(root, { force: true, say: quiet }), []);
    assert.deepEqual(DA.problems(root), []);
  } finally { drop(root); }
}));

test('② a store entry altered behind a link is detected, not served', withStore(async (store) => {
  const { root, m } = await fixture(store);
  try {
    assert.deepEqual(await DA.pull(root, { say: quiet }), []);
    const f = join(DA.storeEntry('fx', m.sets.fx.sha256), 'a.json');
    assert.throws(() => writeFileSync(f, 'x'), /EPERM|EACCES/, 'the store is read-only: a generator writing through the link must fail loudly');
    chmodSync(f, 0o644); writeFileSync(f, '{"tampered":true}\n');
    assert.match(DA.problems(root)[0] || '', /not the content/);
    const said = [];
    const failed = await DA.pull(root, { say: (l) => said.push(l) });
    assert.ok(said.some((l) => /altered/.test(l)), 'the pull must say the store copy was altered');
    assert.equal(failed.length, 1, 'with no Release to refetch from, the pull fails — it does not keep serving the altered copy');
  } finally { drop(root); }
}));

test('② the asset is a function of the content: packing twice gives the same bytes, and it unpacks to the digest', withStore(async () => {
  const d = tmp('pack');
  try {
    mkdirSync(join(d, 's', 'deep', 'er'), { recursive: true });
    writeFileSync(join(d, 's', 'z.json'), 'z');
    writeFileSync(join(d, 's', 'deep', 'er', 'y.json'), Buffer.alloc(70000, 7));   // spans many 512-byte blocks
    writeFileSync(join(d, 's', 'e.json'), '');                                     // an empty file survives
    const set = { path: 'data/s', kind: 'dir', sha256: DA.digestOf(join(d, 's'), 'dir').sha256 };
    const one = await DA.packSet(join(d, 's'), set, join(d, '1.tgz'));
    const two = await DA.packSet(join(d, 's'), set, join(d, '2.tgz'));
    assert.equal(one.sha256, two.sha256, 'packing must be deterministic (no mtimes, sorted entries)');
    const got = new Map();
    await DA.readTar(createReadStream(join(d, '1.tgz')).pipe(createGunzip()), (n, b) => got.set(n, b));
    assert.deepEqual([...got.keys()].sort(), ['deep/er/y.json', 'e.json', 'z.json']);
    assert.equal(got.get('e.json').length, 0);
    await DA.storeFromArchive('s', set, join(d, '1.tgz'));
    assert.equal(DA.digestOf(DA.storeEntry('s', set.sha256), 'dir').sha256, set.sha256);
    const wrong = { ...set, sha256: 'f'.repeat(64) };
    await assert.rejects(DA.storeFromArchive('s', wrong, join(d, '1.tgz')), /unpacks to/, 'an asset that is not the named content must be refused');
  } finally { drop(d); }
}));

test('② the real manifest: every Release tag and asset name carries the content digest it serves', () => {
  const m = DA.readManifest(ROOT);
  for (const [id, s] of Object.entries(m.sets)) {
    const sha12 = s.sha256.slice(0, 12);
    assert.equal(s.release?.tag, `data-${id}-${sha12}`, `«${id}»: the tag must name the content it carries`);
    assert.equal(s.release?.asset, `${id}-${sha12}.tar.gz`, `«${id}»: the asset must name the content it carries`);
    assert.match(s.release?.sha256 || '', /^[a-f0-9]{64}$/, `«${id}»: the asset's own sha256 must be recorded (pull checks it)`);
    assert.ok(s.files > 0 && s.bytes > 0, `«${id}»: files and bytes are the manifest's to state — prose must not copy them`);
  }
});

/* ══ ③ NO GATE IS GREEN WITHOUT THE DATA ═══════════════════════════════════════════════════════ */
/** A checkout with this repository's scripts and manifest but NO datasets: the scripts are copied
 *  (their ROOT comes from their own location), js/ is linked because two builders read it at import. */
function checkoutWithoutData() {
  const r = tmp('bare');
  cpSync(join(ROOT, 'scripts'), join(r, 'scripts'), { recursive: true });
  for (const f of [DA.MANIFEST, 'package.json']) cpSync(join(ROOT, f), join(r, f));
  symlinkSync(join(ROOT, 'js'), join(r, 'js'), WIN ? 'junction' : 'dir');
  mkdirSync(join(r, 'tests', 'helpers'), { recursive: true });
  for (const f of ['hist-eras.mjs', 'hist-scale.mjs']) cpSync(join(ROOT, 'tests', 'helpers', f), join(r, 'tests', 'helpers', f));
  return r;
}
const node = (cwd, args, env = {}) => spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 });

test('③ the dataset gates are RED in a checkout without the data, and say `npm run data:pull`', () => {
  const r = checkoutWithoutData();
  try {
    for (const args of [['scripts/build-border-detail.mjs', '--check'], ['scripts/build-hist-eras.mjs', '--check'], ['scripts/data-assets.mjs', 'verify']]) {
      const got = node(r, args);
      assert.notEqual(got.status, 0, `${args.join(' ')} must fail without the data`);
      assert.match(got.stderr, /npm run data:pull/, `${args.join(' ')} must name the fix, got: ${got.stderr.slice(0, 400)}`);
    }
    /* the node suite: every file may pass and the run is still red, because it did not read the data */
    writeFileSync(join(r, 'ok.test.mjs'), "import test from 'node:test'; test('nothing', () => {});\n");
    const suite = node(r, ['scripts/test-checks.mjs'], { IM_CHECKS_GLOB: 'ok.test.mjs' });
    assert.notEqual(suite.status, 0, 'test:checks must be red when the datasets are absent, even if every file passed');
    assert.match(suite.stderr, /npm run data:pull/);
    /* the shared test helper refuses by name instead of an ENOENT */
    const helper = node(r, ['--input-type=module', '-e', "import('./tests/helpers/hist-eras.mjs').then(m => m.eraBundle())"]);
    assert.notEqual(helper.status, 0);
    assert.match(helper.stderr, /npm run data:pull/);
  } finally { drop(r); }
});

test('③ check:assets is RED when dist/ lacks a set, and when dist/ holds a link instead of the bytes', withStore(async (store) => {
  const r = checkoutWithoutData();
  try {
    mkdirSync(join(r, 'dist'), { recursive: true });
    writeFileSync(join(r, 'dist', 'index.html'), '<!doctype html>');
    let got = node(r, ['scripts/asset-report.mjs', '--check']);
    assert.notEqual(got.status, 0, 'a dist/ without the datasets must not pass');
    for (const s of Object.values(DA.readManifest(ROOT).sets)) assert.match(got.stderr, new RegExp(`dist/${s.path.replace(/[.]/g, '\\.')} is missing`));
    /* …and a dist/ that LINKS the set passes the digest but must still be refused */
    const { m } = await fixture(store);
    const fake = { ...DA.readManifest(r), sets: { fx: m.sets.fx } };
    writeFileSync(join(r, DA.MANIFEST), JSON.stringify(fake));
    mkdirSync(join(r, 'dist', 'data'), { recursive: true });
    symlinkSync(DA.storeEntry('fx', m.sets.fx.sha256), join(r, 'dist', 'data', 'fx'), WIN ? 'junction' : 'dir');
    got = node(r, ['scripts/asset-report.mjs', '--check'], { INTMAP_DATA_STORE: store });
    assert.notEqual(got.status, 0);
    assert.match(got.stderr, /is a link, not the bytes/);
  } finally { drop(r); }
}));

/* ══ THE PLACES THAT MUST FETCH BEFORE THEY READ ══════════════════════════════════════════════ */
/* The readers are found in the workflow text by WHAT THEY RUN — a build (vite copies data/), the gate
   planner, the node suite, the era generator — not by job name, so a job added tomorrow that builds
   the site is held to the same rule. The browser tier builds too, and fetches inside its own
   composite action — that one is checked below, on the action's text. */
const READERS = /npm run build|scripts\/ci-gates\.mjs|test:checks|scripts\/build-hist-eras\.mjs|scripts\/build-border-detail\.mjs/;
const FETCH = /actions\/data-assets|scripts\/data-assets\.mjs pull/;
/** Each step as the text it runs or uses, in order — from the YAML itself, not from indentation. */
const stepsOf = (steps) => (steps || []).map((st) => [st.uses || '', st.run || '', JSON.stringify(st.env || {})].join('\n'));
const firstIndex = (texts, re) => texts.findIndex((t) => re.test(t));

test('every workflow job that reads the datasets fetches them FIRST', () => {
  const wf = join(ROOT, '.github', 'workflows');
  let readers = 0;
  for (const f of readdirSync(wf).filter((n) => /\.ya?ml$/.test(n))) {
    const doc = yaml.load(readFileSync(join(wf, f), 'utf8'));
    for (const [name, job] of Object.entries(doc.jobs || {})) {
      const steps = stepsOf(job.steps);
      const r = firstIndex(steps, READERS);
      if (r < 0) continue;
      readers++;
      const fetchAt = firstIndex(steps, FETCH);
      assert.ok(fetchAt >= 0 && fetchAt <= r, `${f} › ${name} reads the datasets and does not fetch them before it`);
      if (fetchAt === r) assert.ok(steps[r].search(FETCH) < steps[r].search(READERS), `${f} › ${name}: the fetch must come before the read inside the step`);
    }
  }
  assert.ok(readers >= 5, `only ${readers} reading job(s) found — this rule would pass measuring nothing`);
  const bt = stepsOf(yaml.load(rd('.github/actions/browser-tier/action.yml')).runs.steps);
  const btFetch = firstIndex(bt, FETCH);
  assert.ok(btFetch >= 0 && btFetch < firstIndex(bt, /playwright test/), 'the browser tier builds dist/ — it must fetch the datasets before running');
  const da = yaml.load(rd('.github/actions/data-assets/action.yml')).runs.steps;
  const cache = da.find((st) => /^actions\/cache@/.test(st.uses || ''));
  const pull = da.find((st) => /data-assets\.mjs pull/.test(st.run || ''));
  assert.ok(cache && pull && da.indexOf(cache) < da.indexOf(pull), 'the action restores the store, then pulls');
  assert.match(cache.with.key, /hashFiles\('data-assets\.json'\)/, 'the cache must be keyed by the manifest');
  assert.equal(cache.with.path, pull.env.INTMAP_DATA_STORE, 'the cached path must be the store pull uses');
});

test("rollback fetches by the ROLLED-BACK commit's manifest, and only when that commit has one", () => {
  const steps = yaml.load(rd('.github/workflows/rollback.yml')).jobs.rollback.steps;
  const checkout = steps.findIndex((st) => /git checkout --quiet "\$\{SHA\}"/.test(st.run || ''));
  const build = steps.findIndex((st) => /npm run build/.test(st.run || ''));
  assert.ok(checkout >= 0 && build > checkout, 'the build runs on the checked-out rolled-back commit');
  const run = steps[build].run;
  const pullAt = run.indexOf('if [ -f data-assets.json ]; then node scripts/data-assets.mjs pull; fi');
  assert.ok(pullAt >= 0 && pullAt < run.indexOf('npm run build'), 'the build must pull first — when (and only when) that commit has a manifest');
  const cache = steps.findIndex((st) => /^actions\/cache@/.test(st.uses || '') && /data-assets\.json/.test(st.if || ''));
  assert.ok(cache > checkout && cache < build, "the store cache is keyed by the rolled-back commit's manifest, and only restored when it has one");
  assert.equal(steps[cache].with.path, steps[build].env.INTMAP_DATA_STORE);
});

test('master-sync places the datasets in the master across the commit that untracks them', withStore(async (store) => {
  const t = tmp('ms');
  const origin = join(t, 'origin.git'), work = join(t, 'work'), master = join(t, 'master');
  const g = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    execFileSync('git', ['init', '--quiet', '--bare', origin]);
    execFileSync('git', ['clone', '--quiet', origin, work]);
    g(work, 'config', 'user.email', 'r816@intmap.test'); g(work, 'config', 'user.name', 'data-outside-git');
    g(work, 'checkout', '--quiet', '-B', 'main');
    mkdirSync(join(work, 'data', 'fx', 'sub'), { recursive: true });
    writeFileSync(join(work, 'data', 'fx', 'a.json'), '{"a":1}\n');
    writeFileSync(join(work, 'data', 'fx', 'sub', 'b.json'), '{"b":2}\n');
    writeFileSync(join(work, 'data', 'fy.js'), 'window.__X = 1;\n');
    g(work, 'add', '-A'); g(work, 'commit', '--quiet', '-m', 'data in git');
    g(work, 'push', '--quiet', '-u', 'origin', 'main');
    g(origin, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    execFileSync('git', ['clone', '--quiet', origin, master]);
    /* the data-outside-git commit, in miniature: manifest + script in, data out of the index, ignored */
    const { root: spare, m } = await fixture(store);
    drop(spare);
    mkdirSync(join(work, 'scripts'), { recursive: true });
    cpSync(join(ROOT, 'scripts', 'data-assets.mjs'), join(work, 'scripts', 'data-assets.mjs'));
    writeFileSync(join(work, DA.MANIFEST), JSON.stringify(m, null, 2) + '\n');
    writeFileSync(join(work, '.gitignore'), '/data/fx\n/data/fy.js\n');
    g(work, 'rm', '-r', '--cached', '--quiet', 'data');
    g(work, 'add', '-A'); g(work, 'commit', '--quiet', '-m', 'data outside git');
    g(work, 'push', '--quiet', 'origin', 'main');

    const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'master-sync.mjs'), '--sync'], { cwd: master, encoding: 'utf8', env: process.env });
    assert.equal(r.status, 0, `--sync must succeed: ${r.stderr}`);
    assert.equal(g(master, 'rev-parse', 'HEAD').trim(), g(master, 'rev-parse', 'origin/main').trim());
    assert.ok(lstatSync(join(master, 'data', 'fx')).isSymbolicLink(), 'the master must end with the directory set linked from the store');
    assert.deepEqual(DA.problems(master), [], 'and every set verified');
    assert.equal(g(master, 'status', '--porcelain').trim(), '', 'placing the data must not dirty the master');
  } finally {
    try { unlinkSync(join(master, 'data', 'fx')); } catch { /* not placed */ }
    drop(t);
  }
}));

test('the USB mirror lists the datasets from the manifest, and FAILS rather than mirror without them', () => {
  const ps = rd('scripts/backup-usb.ps1');
  assert.match(ps, /data-assets\.mjs'\) \+ '" list -z --root/, 'the mirror must take the data files from data-assets.mjs list (which verifies)');
  assert.match(ps, /Result 'failed' 'data-assets-not-placed'/, 'absent data must fail the backup — mirroring would delete the USB copy as extras');
  /* and `list` itself: red without the data, every file with it */
  const bare = tmp('list');
  try {
    cpSync(join(ROOT, DA.MANIFEST), join(bare, DA.MANIFEST));
    const got = spawnSync(process.execPath, [join(ROOT, 'scripts', 'data-assets.mjs'), 'list', '--root', bare], { encoding: 'utf8' });
    assert.notEqual(got.status, 0);
    assert.equal(got.stdout, '', 'a failed list must print no file — a partial list would mirror a partial set');
  } finally { drop(bare); }
});
