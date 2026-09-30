/* ============================================================================
 *  tests/helpers/scratch-tree.mjs — a private copy of this checkout to break things in
 *                                                                (mutation-tests-off-tree)
 * ----------------------------------------------------------------------------
 *  A mutation test proves a gate FAILS when a fact is wrong: make the fact wrong, run the gate,
 *  put it back. Until this file, «make the fact wrong» meant writing into the working tree —
 *  js/, docs/, Architecture.md, privacy.html, data/ — and every other test file that reads the
 *  same tree while `node --test` runs files in parallel could see the mutant. The tree lock
 *  (tests/helpers/gate-lock.mjs, removed once this made it redundant) serialised the WRITERS, and that is all it could do:
 *
 *    · a reader that did not take the lock read the mutant — MEASURED 2026-09-30, three files
 *      (hazard-other-build-and-gate R236 «js/ holds 331», hazard-other-i18n-shape-audit R241 ①,
 *      hazard-radiation-layer #R585 ④ ENOENT) tripped over js/__r717-probe.js, which
 *      tests/chronos-claims-checks.test.mjs created for the length of one doc-facts run;
 *    · the writers queued behind each other, and six files the same day died waiting 600/900 s
 *      for the lock under `npm test`;
 *    · the lock itself broke under load (#R623: 2.7 % of hand-overs, measured) and one breach
 *      presents as a real regression in whichever test was unlucky.
 *
 *  None of that is a defect of the lock. It is what follows from sharing one tree between tests
 *  that write it and tests that read it. So the writes move off the tree: a test that needs a
 *  broken fact gets a PRIVATE COPY of the checkout, breaks it there, and runs the gate FROM there.
 *  Nobody else can see the copy, so there is nothing to lock and nothing to wait for.
 *
 *      const SCRATCH = scratchTree();           // one per test file, built on first use
 *      const r = SCRATCH.mutate([{ file: 'Architecture.md', text: broken }],
 *                               () => SCRATCH.node('scripts/doc-facts.mjs', ['--check', '--rule=x']));
 *
 *  (Named SCRATCH in every file that has one: a one-letter name was shadowed by a test's own `T`.)
 *
 *  ── what the copy is, and why each part is there ───────────────────────────────────────────
 *
 *  ⚠ THE GATE IS RUN FROM THE COPY, AND THAT IS THE WHOLE ROOT INJECTION. Every gate under
 *    scripts/ derives its ROOT from its own location (`dirname(import.meta.url)/..`), and the
 *    modules it imports do the same — so `node <copy>/scripts/doc-facts.mjs` reads the copy,
 *    top to bottom, with no flag, no environment variable and no change to the gate. A flag
 *    would have to be threaded through every module a gate imports; the location already is.
 *
 *  ⚠ THE COPY IS THE WORKING TREE, NOT HEAD. Tracked files AND untracked-but-not-ignored ones
 *    (`git ls-files --cached --others --exclude-standard`), byte for byte as they are on disk —
 *    a test run on an uncommitted edit must see the edit, exactly as it did in the real tree.
 *
 *  ⚠ IT IS A GIT CHECKOUT, because the gates ask git. doc-facts sweeps `git ls-files` (both
 *    halves, #R628) and `git grep`; the chronos probe is found precisely BECAUSE it is untracked-
 *    but-visible. The copy gets its own `.git` whose INDEX is this checkout's index
 *    (`ls-files -s` → `update-index --index-info`), whose objects are this repository's (read-only,
 *    through `objects/info/alternates` — git never writes into an alternate), and whose HEAD and
 *    origin/main name the same commits. A shallow CI clone's `shallow` file is carried too, or
 *    `git log` would walk into parents that are not there.
 *
 *  ⚠⚠⚠ FILES ARE HARD LINKS — AND A HARD LINK WRITTEN IN PLACE WRITES THE REAL TREE. Linking
 *    3,953 files costs ~2.4 s here against ~8 s to copy 389 MB (measured on this machine), and a
 *    gate only reads. But `writeFileSync` on a hard link truncates the ONE file both names point
 *    at. So every change goes through write()/remove()/rename() below, which UNLINK the name
 *    first and then write a fresh file: the copy stops sharing that file, the real tree never
 *    sees it. A test must not write into `T.root` with fs calls of its own — the static rule
 *    `tree-writer` (scripts/tree-writers.mjs, in check:static) refuses a test-side write whose
 *    target derives from the checkout, and this file is where the one sanctioned writer lives.
 *    Where linking fails (another volume, a cloud placeholder) the file is copied instead.
 *
 *  ⚠ node_modules IS A LINK TO THIS CHECKOUT'S, and removing the copy removes the LINK FIRST.
 *    `rmSync(recursive)` is not trusted to stop at a junction — a cleanup that followed one
 *    emptied the master copy's node_modules on 2026-09-25 ([[intmap-cleanup-through-junctions]]).
 *    It is also excluded in the copy's private `.git/info/exclude`: `node_modules/` in .gitignore
 *    matches a DIRECTORY, and to git a junction is a symlink, so it would otherwise surface as an
 *    untracked file in every `ls-files --others` a gate asks.
 *
 *  ⚠ WHAT IS NOT IN THE COPY: anything gitignored (dist/, .perf/, test-results/, *.local.*).
 *    A gate that needs a build output must be given it explicitly (T.write), and a test that
 *    asks «does this gate fail WITHOUT the build» gets that for free.
 * ==========================================================================*/
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* The copy's name carries the pid of the process that owns it, so a copy left behind by a killed
   run can be recognised as abandoned and removed by the next one (sweepAbandoned below). */
const PREFIX = 'intmap-scratch-';

const git = (cwd, args, opts = {}) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'], ...opts });

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

/* Remove a link (junction or symlink) without ever descending into what it points at. */
function unlinkLink(p) {
  let st;
  try { st = lstatSync(p); } catch { return; }
  if (!st.isSymbolicLink()) return;
  try { unlinkSync(p); } catch { rmdirSync(p); }
}

/* Every link the copy holds is written to this ledger BEFORE it is made, so a copy abandoned
   half-built still names every link a removal must take out first. */
const LINKS = (root) => join(root, '.git', 'scratch-links');
const linksOf = (root) => {
  try { return readFileSync(LINKS(root), 'utf8').split('\n').filter(Boolean); } catch { return []; }
};

/* Remove a copy: its links first, then the rest — and refuse if any of them is not a link. */
function removeCopy(root) {
  const links = linksOf(root);
  for (const rel of links) unlinkLink(join(root, rel));
  for (const rel of links) {
    if (existsSync(join(root, rel))) {
      throw new Error('scratch-tree: ' + join(root, rel) + ' is not a link — refusing to remove a copy that holds real contents there');
    }
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/* A copy whose owner is gone is garbage; a copy whose owner lives is somebody's test. */
function sweepAbandoned() {
  let names = [];
  try { names = readdirSync(tmpdir()); } catch { return; }
  for (const n of names) {
    if (!n.startsWith(PREFIX)) continue;
    const pid = Number(n.slice(PREFIX.length).split('-')[0]);
    if (!Number.isInteger(pid) || alive(pid)) continue;
    try { removeCopy(join(tmpdir(), n)); } catch { /* another sweeper got there, or it is in use — leave it */ }
  }
}

function build(from) {
  sweepAbandoned();
  const root = mkdtempSync(join(tmpdir(), PREFIX + process.pid + '-'));
  try {
    /* 1. the working tree, as this checkout sees it */
    const files = git(from, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
      .split('\0').filter(Boolean);
    const made = new Set();
    for (const f of new Set(files)) {
      const src = join(from, f);
      let st;
      try { st = lstatSync(src); } catch { continue; }          // deleted in the working tree: absent here too
      if (!st.isFile()) continue;                               // a submodule or a symlink: not a file a gate reads
      const dst = join(root, f);
      const dir = dirname(dst);
      if (!made.has(dir)) { mkdirSync(dir, { recursive: true }); made.add(dir); }
      try { linkSync(src, dst); } catch { copyFileSync(src, dst); }
    }
    /* 2. its own git, over this repository's index and objects */
    git(root, ['init', '-q']);
    const objects = resolve(from, git(from, ['rev-parse', '--git-path', 'objects']).trim());
    mkdirSync(join(root, '.git', 'objects', 'info'), { recursive: true });
    writeFileSync(join(root, '.git', 'objects', 'info', 'alternates'), objects.split('\\').join('/') + '\n');
    const shallow = resolve(from, git(from, ['rev-parse', '--git-path', 'shallow']).trim());
    if (existsSync(shallow)) copyFileSync(shallow, join(root, '.git', 'shallow'));
    mkdirSync(join(root, '.git', 'info'), { recursive: true });
    git(root, ['update-index', '-z', '--index-info'], { input: git(from, ['ls-files', '-s', '-z']) });
    for (const ref of ['HEAD', 'refs/remotes/origin/main']) {
      let sha = '';
      try { sha = git(from, ['rev-parse', '--verify', '-q', ref]).trim(); } catch { /* no such ref here */ }
      if (sha) git(root, ['update-ref', ref, sha]);
    }
    /* 3. what git does not carry and a gate reads: the dependencies, and the datasets that live
          outside git (data-assets.json — data/hist-eras.js is one, and doc-facts reads it). A
          directory set is placed in a checkout as a link into the store, so it is linked here to
          the same place; a file set is a plain file there, so it is linked like any other file. */
    const link = (rel, target) => {
      writeFileSync(LINKS(root), linksOf(root).concat(rel).join('\n') + '\n');
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      symlinkSync(target, join(root, rel), 'junction');
    };
    const nm = join(from, 'node_modules');
    if (existsSync(nm)) link('node_modules', realpathSync(nm));
    let sets = {};
    try { sets = JSON.parse(readFileSync(join(from, 'data-assets.json'), 'utf8')).sets || {}; } catch { /* no manifest here */ }
    const exclude = ['/node_modules'];
    for (const set of Object.values(sets)) {
      const rel = String(set && set.path || '');
      const src = join(from, rel);
      if (!rel || !existsSync(src)) continue;               // not pulled in this checkout: absent here too
      exclude.push('/' + rel);
      if (set.kind === 'dir') link(rel, realpathSync(src));
      else {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        try { linkSync(src, join(root, rel)); } catch { copyFileSync(src, join(root, rel)); }
      }
    }
    writeFileSync(join(root, '.git', 'info', 'exclude'), exclude.join('\n') + '\n');
  } catch (e) {
    try { removeCopy(root); } catch { /* best effort — the sweep will find it */ }
    throw e;
  }
  return root;
}

/**
 * A private copy of the checkout at `from` (default: this one). Built lazily on first use and
 * removed when the process exits.
 */
export function scratchTree({ from = ROOT } = {}) {
  let root = null;
  let mutating = false;
  const ensure = () => {
    if (root) return root;
    root = build(from);
    process.once('exit', () => { try { removeCopy(root); } catch { /* the next sweep removes it */ } });
    return root;
  };
  const abs = (rel) => {
    if (isAbsolute(rel)) throw new Error('scratch-tree: paths are relative to the copy, got ' + rel);
    const p = resolve(ensure(), rel);
    if (!p.startsWith(resolve(root) + (process.platform === 'win32' ? '\\' : '/'))) {
      throw new Error('scratch-tree: ' + rel + ' is outside the copy');
    }
    return p;
  };

  const T = {
    /** the copy's root — pass it as `cwd`; never write under it with fs calls of your own */
    get root() { return ensure(); },
    path: abs,
    exists: (rel) => existsSync(abs(rel)),
    read: (rel, enc = 'utf8') => readFileSync(abs(rel), enc),
    /** Replace (or create) a file. ⚠ Unlinks first, so a hard link to the real tree is never written through. */
    write(rel, text) {
      const p = abs(rel);
      mkdirSync(dirname(p), { recursive: true });
      try { unlinkSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      writeFileSync(p, text);
    },
    /** Remove a file from the copy (only the copy's name for it). */
    remove(rel) { unlinkSync(abs(rel)); },
    /** Move a file within the copy. */
    rename(fromRel, toRel) {
      const a = abs(fromRel), b = abs(toRel);
      mkdirSync(dirname(b), { recursive: true });
      try { unlinkSync(b); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      renameSync(a, b);
    },
    /**
     * Run `node <copy>/<script> ...args` with the copy as cwd. Returns { code, out, stdout, stderr }
     * and never throws on a non-zero exit — a gate going red is the thing being asked for.
     */
    node(script, args = [], opts = {}) {
      try {
        const stdout = execFileSync(process.execPath, [abs(script), ...args],
          { cwd: ensure(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts });
        return { code: 0, out: String(stdout), stdout: String(stdout), stderr: '' };
      } catch (e) {
        const stdout = String(e.stdout || ''), stderr = String(e.stderr || '');
        return { code: e.status == null ? -1 : e.status, out: stdout + stderr, stdout, stderr, error: e };
      }
    },
    /**
     * Apply `changes`, run `fn`, and put every touched path back — ALWAYS, and to its exact bytes
     * (or its absence). A change is { file, text } (write), { file, remove: true }, or
     * { file, edit: (text) => text }. Returns what `fn` returns.
     */
    mutate(changes, fn) {
      if (mutating) throw new Error('scratch-tree: mutate() is not reentrant — apply all changes in one call');
      mutating = true;
      const saved = [];
      const madeDirs = [];            // the topmost directory each change had to create, if any
      const restore = () => {
        for (const [rel, bytes] of saved.reverse()) {
          if (bytes == null) { try { unlinkSync(abs(rel)); } catch { /* never created */ } }
          else T.write(rel, bytes);
        }
        /* a directory the mutation created goes too — «put back» includes «was not there» */
        for (const d of madeDirs.reverse()) rmSync(d, { recursive: true, force: true });
      };
      try {
        for (const c of changes) {
          const p = abs(c.file);
          let top = null;
          for (let d = dirname(p); d !== resolve(root) && !existsSync(d); d = dirname(d)) top = d;
          if (top) madeDirs.push(top);
          saved.push([c.file, existsSync(p) ? readFileSync(p) : null]);
          if (c.remove) T.remove(c.file);
          else if (c.edit) T.write(c.file, c.edit(readFileSync(p, 'utf8')));
          else T.write(c.file, c.text);
        }
      } catch (e) { restore(); mutating = false; throw e; }
      let out;
      try { out = fn(); }
      catch (e) { restore(); mutating = false; throw e; }
      if (out && typeof out.then === 'function') {
        return out.finally(() => { restore(); mutating = false; });
      }
      restore(); mutating = false;
      return out;
    },
    /** Remove the copy now (it is also removed at exit). */
    dispose() { if (root) { removeCopy(root); root = null; } },
  };
  return T;
}

/* for the checks on this file only */
export const _internals = { PREFIX, removeCopy, sweepAbandoned };
