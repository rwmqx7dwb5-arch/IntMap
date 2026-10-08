/*
 *  IntMap · build-isolation — A BUILD WRITES ITS OWN OUTPUT, AND ONLY ONE BUILD WRITES IT AT A TIME
 *
 *  Reported 2026-10-08 with nine agents at work: «`npm run build` in wt-sales-schools wrote the
 *  generated pages into wt-hist-product\dist, then into wt-mobile-product\dist». MEASURED, the builds
 *  had not crossed: the agents were subagents of ONE session and so shared ONE scratchpad directory,
 *  and two of them sent their build output to the same `scratchpad/build2.log` with `>` — the file
 *  began with NUL bytes, the mark of a second writer truncating it under a first one still writing
 *  at its offset. What the agent read was another worktree's build log (dev-notes/2026-10-08-build-isolation.md).
 *  The first test below keeps the half of the suspicion that could have been true answered: Vite's
 *  default config loader, with node_modules shared through a junction as scripts/worktree.mjs makes
 *  it, gives every tree its own root, also under concurrency.
 *
 *  What WAS wrong, and is evaluated here:
 *    · six build plugins wrote `join(ROOT, 'dist')` rather than the outDir Vite resolved, so a build
 *      with `--outDir` wrote half the site into dist/ (every closeBundle is run against an outDir of
 *      its own, with every fs write function — scripts/tree-writers.mjs's table — recording where);
 *    · two builds of the same tree interleaved in one dist/ («EPIPE … being used by another process»
 *      from intmap-copy-static) — the output directory is now held by one build at a time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import childProcess, { spawn } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WRITES } from '../scripts/tree-writers.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inside = (p, dir) => { const r = relative(dir, p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
const scratch = (tag) => mkdtempSync(join(tmpdir(), `intmap-build-isolation-${tag}-`));

test("Vite's default config loader gives every tree its own root, with node_modules shared and builds side by side", async () => {
  const vite = await import('vite');
  const store = realpathSync(join(ROOT, 'node_modules'));
  /* two trees shaped like worktrees: their own config (whose root is its own directory, as vite.config.js's
     is), a module it imports, and node_modules as a junction to the ONE shared store */
  const trees = ['a', 'b'].map((t) => {
    const dir = scratch(t);
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    mkdirSync(join(dir, 'lib'));
    writeFileSync(join(dir, 'lib', 'where.mjs'), 'export const LIB = import.meta.dirname;\n');
    writeFileSync(join(dir, 'vite.config.js'), "import { LIB } from './lib/where.mjs';\nexport default { root: import.meta.dirname, define: { LIB: JSON.stringify(LIB) } };\n");
    symlinkSync(store, join(dir, 'node_modules'), 'junction');
    return dir;
  });
  try {
    const loads = [];
    for (let i = 0; i < 6; i++) for (const dir of trees) {
      loads.push(vite.loadConfigFromFile({ command: 'build', mode: 'production' }, undefined, dir, 'silent', undefined, 'bundle')
        .then((r) => ({ dir, root: r.config.root, lib: JSON.parse(r.config.define.LIB) })));
    }
    for (const { dir, root, lib } of await Promise.all(loads)) {
      assert.equal(resolve(root), resolve(dir), `a config loaded from ${dir} said its root is ${root}`);
      assert.equal(resolve(lib), join(resolve(dir), 'lib'), `a module imported by ${dir}'s config placed itself in ${lib}`);
    }
  } finally {
    for (const dir of trees) { fs.unlinkSync(join(dir, 'node_modules')); rmSync(dir, { recursive: true, force: true }); }
  }
});

test('every build plugin writes into the outDir Vite resolved — never into the checkout\'s dist/', async () => {
  const cfg = (await import('../vite.config.js')).default;
  await import('../scripts/build-hist-tiles.mjs');   // histTiles imports it in its hook; loaded before fs is spied on
  const out = scratch('out');
  const dist = join(ROOT, 'dist');
  const STOP = new Error('build-isolation: write recorded');
  let seen = [];
  /* every fs function that changes the filesystem records where, and stops the hook there: the first
     destination of each hook is where it writes (each hook derives one base and joins under it) */
  const saved = [];
  const spy = (obj, name, idx, async) => {
    if (typeof obj[name] !== 'function') return;
    saved.push([obj, name, obj[name]]);
    obj[name] = (...args) => {
      for (const i of idx) if (typeof args[i] === 'string' || args[i] instanceof URL) seen.push(resolve(String(args[i] instanceof URL ? fileURLToPath(args[i]) : args[i])));
      if (async) return Promise.reject(STOP);
      throw STOP;
    };
  };
  for (const [name, idx] of Object.entries(WRITES)) { spy(fs, name, idx, false); spy(fs.promises, name, idx, true); }
  /* the page writers run their CLI with `--out <dir>`: that argument is where they write */
  saved.push([childProcess, 'execFile', childProcess.execFile]);
  childProcess.execFile = (file, args, opts, cb) => {
    const a = args || [];
    for (const flag of ['--out', '--cards']) { const i = a.indexOf(flag); if (i >= 0) seen.push(resolve(a[i + 1])); }
    (typeof opts === 'function' ? opts : cb)(STOP, '', '');
  };
  syncBuiltinESMExports();
  const report = [];
  try {
    for (const p of cfg.plugins.flat().filter((p) => p && p.closeBundle && p.apply !== 'serve')) {
      seen = [];
      p.configResolved?.({ root: ROOT, command: 'build', build: { outDir: out } });
      const hook = typeof p.closeBundle === 'function' ? p.closeBundle : p.closeBundle.handler;
      let err = null;
      try { await hook.call({ warn() {}, info() {}, error(m) { throw new Error(m); } }); } catch (e) { err = e; }
      /* a hook that failed on a file it READ is not a write; it only matters if it was reading the checkout's dist/ */
      report.push({ name: p.name, seen: [...seen], looked: err && err !== STOP && err.path ? resolve(err.path) : null });
    }
  } finally {
    for (const [obj, name, fn] of saved.reverse()) obj[name] = fn;
    syncBuiltinESMExports();
    rmSync(out, { recursive: true, force: true });
  }
  const wrong = report.flatMap((r) => r.seen.filter((p) => !inside(p, out)).map((p) => `${r.name} → ${p}`));
  assert.deepEqual(wrong, [], `build plugins reached outside the outDir they were given:\n  ${wrong.join('\n  ')}`);
  const misread = report.filter((r) => r.looked && inside(r.looked, dist)).map((r) => `${r.name} → ${r.looked}`);
  assert.deepEqual(misread, [], "build plugins read the checkout's dist/ instead of their own output");
  /* the measurement saw something: the plugins that copy into the output and the page writers wrote */
  const wrote = report.filter((r) => r.seen.length).map((r) => r.name);
  assert.ok(wrote.length >= 10, `only ${wrote.length} build plugins were seen writing (${wrote.join(', ')}) — the spies did not reach them`);
});

/* A child process that takes the lock on `dir`, says so, then does `then` (JavaScript source). */
function holder(dir, locks, then) {
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `const { acquireOutDirLock } = await import(${JSON.stringify(pathToFileURL(join(ROOT, 'vite.config.js')).href)});
     await acquireOutDirLock(${JSON.stringify(dir)}, { locks: ${JSON.stringify(locks)}, log: () => {} });
     process.stdout.write('held\\n');
     ${then}`], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
  const held = new Promise((res, rej) => {
    let said = '';
    child.stdout.on('data', (b) => { said += b; if (/held/.test(said)) res(); });
    child.on('exit', () => rej(new Error('the child ended without holding the lock')));
  });
  const exited = new Promise((r) => child.on('exit', r));
  return { held, exited };
}
const settled = (p) => { const s = { done: false, value: null }; p.then((v) => { s.done = true; s.value = v; }); return s; };

test('a build holds its outDir: a second build of the same directory waits, another directory does not', async () => {
  const { acquireOutDirLock } = await import('../vite.config.js');
  const locks = scratch('locks'), base = scratch('dirs');
  const log = () => {};
  try {
    /* the directories only name locks; nothing is written there. (A named pipe is machine-wide, so they
       are this run's own — a build of this checkout's dist/ running beside the test is not touched.) */
    const dirA = join(base, 'dist'), dirB = join(base, 'dist-other');
    const r1 = await acquireOutDirLock(dirA, { locks, poll: 20, log });
    const second = settled(acquireOutDirLock(dirA, { locks, poll: 20, log }));
    const rB = await acquireOutDirLock(dirB, { locks, poll: 20, log });   // resolves although dirA is held
    rB();
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(second.done, false, 'a second build of the same outDir went ahead while the first held it');
    r1();
    const t0 = Date.now();
    while (!second.done && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    assert.equal(second.done, true, 'the second build did not go ahead when the first let go');
    second.value();
    /* the same directory spelled differently is the same lock */
    if (process.platform === 'win32') {
      const r3 = await acquireOutDirLock(join(base, 'DIST'), { locks, poll: 20, log });
      const other = settled(acquireOutDirLock(dirA, { locks, poll: 20, log }));
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(other.done, false, 'DIST and dist were two locks');
      r3();
      while (!other.done) await new Promise((r) => setTimeout(r, 20));
      other.value();
    }
  } finally { rmSync(locks, { recursive: true, force: true }); rmSync(base, { recursive: true, force: true }); }
});

test('a holder that is busy in synchronous work is waited for, not taken over', async () => {
  const { acquireOutDirLock } = await import('../vite.config.js');
  const locks = scratch('locks'), dir = join(scratch('dirs'), 'dist');
  try {
    /* MEASURED: the site-URL fill and the CSP pass block the event loop for minutes under load. The child
       blocks its thread outright (no timer, no callback runs) for 3 s, then exits normally. */
    const h = holder(dir, locks, 'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);');
    await h.held;
    const second = settled(acquireOutDirLock(dir, { locks, poll: 20, log: () => {} }));
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(second.done, false, 'a busy holder was taken for a dead one');
    await h.exited;
    const t0 = Date.now();
    while (!second.done && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    assert.equal(second.done, true, 'the lock did not pass on when the holder ended');
    second.value();
  } finally { rmSync(locks, { recursive: true, force: true }); rmSync(dirname(dir), { recursive: true, force: true }); }
});

test('a lock whose build was killed is taken over at once', async () => {
  const { acquireOutDirLock } = await import('../vite.config.js');
  const locks = scratch('locks'), dir = join(scratch('dirs'), 'dist');
  try {
    /* a real process takes the lock and is killed (no exit handler runs), as a crashed or killed build is */
    const h = holder(dir, locks, "process.kill(process.pid, 'SIGKILL');");
    await h.held;
    await h.exited;
    const t0 = Date.now();
    const release = await acquireOutDirLock(dir, { locks, poll: 20, log: () => {} });
    assert.ok(Date.now() - t0 < 5000, 'waited on a holder that no longer exists');
    release();
  } finally { rmSync(locks, { recursive: true, force: true }); rmSync(dirname(dir), { recursive: true, force: true }); }
});

test('the lock is let go only after every other closeBundle has run', async () => {
  const cfg = (await import('../vite.config.js')).default;
  const hooks = cfg.plugins.flat().filter((p) => p && p.closeBundle && p.apply !== 'serve');
  const lock = hooks.findIndex((p) => p.buildStart && p.configResolved && /lock/.test(p.name));
  assert.ok(lock >= 0, 'no build plugin holds the outDir');
  /* hooks run grouped by order (pre, normal, post) and in list order within a group */
  const rank = (p) => ({ pre: 0, post: 2 }[typeof p.closeBundle === 'object' ? p.closeBundle.order : undefined] ?? 1);
  const later = hooks.filter((p, i) => i !== lock && (rank(p) > rank(hooks[lock]) || (rank(p) === rank(hooks[lock]) && i > lock)));
  assert.deepEqual(later.map((p) => p.name), [], 'these closeBundle hooks run after the lock is released');
});
