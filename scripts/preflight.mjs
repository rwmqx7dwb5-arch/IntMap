#!/usr/bin/env node
/* ============================================================================
 *  IntMap · PREFLIGHT — THE GATES THIS CHANGE CAN REACH, ONCE, BEFORE THE PUSH   (ci-critical-path)
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-11-25 (one PR, four CI runs of ~16 minutes each): three of the four reds were knowable on the
 *  author's machine — the build's own rule, a fixture photograph a test compares against, a ledger the perf gate
 *  reads. Each push-and-wait restarted the build and the whole regression suite from the top, so «fix one red»
 *  cost a full CI run (16 min) and finding all of them cost four. AGENTS.md §4 says the full suite is CI's job,
 *  and it stays CI's job: this runs only what the diff can reach, in parallel, and reports EVERY red in one pass
 *  (the same property `fail-fast: false` gives CI).
 *
 *  ⚠ NOTHING HERE IS A LIST OF «THIS FILE → THAT GATE». The reach is read from the files themselves:
 *    · a regression test is selected when it IS a changed file, or its source NAMES a changed path (a `new URL('../js/x.js')`
 *      and a fixture path both contain the repository path) — the text a test reads is the text that makes it fail;
 *    · a gate is selected when the script it runs (and the scripts it imports, transitively) is a changed file, names a
 *      changed path, or names the top-level directory a changed file lives in; every gate the CI ledger prices at
 *      CHEAP_S or less always runs, because the price of looking is smaller than the price of one wrong guess;
 *    · the build runs when a changed file is one the build can ship (everything outside NOT_SHIPPED) — and then the gates
 *      that read the build run behind it, exactly as `gates-build` does in CI;
 *    · `npm run regen` runs first (the generated files and the ratchet ledgers — scripts/regen.mjs).
 *  ⚠ WHAT IT CANNOT SEE: a test that reaches a changed file by globbing a directory names no path; a database test
 *  (`supabase test db`, pgTAP) needs Docker. Both are still CI's. The point is to move the reds that CAN be known, not to
 *  promise there are none: a green preflight is «nothing this diff reaches is red here», never «CI will be green».
 *
 *      node scripts/preflight.mjs            run it (npm run preflight)
 *      node scripts/preflight.mjs --plan     say what would run, run nothing
 *      node scripts/preflight.mjs --no-build skip the build and the gates behind it (a build is minutes)
 *      node scripts/preflight.mjs --no-regen skip `npm run regen`
 *      node scripts/preflight.mjs --all-gates  every declared gate, not only the reachable ones
 * ==========================================================================*/
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { availableParallelism } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, declaredGates, scriptFileOf, needsBuild, gateCommand, gateEnv } from './gate-universe.mjs';
import { offlineEnv } from './test-checks.mjs';

/** Gates the CI ledger prices at or under this many seconds always run. MEASURED 2026-11-25 (CI run 45572764375):
    31 of the 37 declared gates took 15 s or less, together ~110 s. EXPIRES with the ledger: it is read, not copied. */
export const CHEAP_S = 15;

/** What the build cannot ship (so a change confined to these cannot change `dist/`). MEASURED from vite.config.js +
    the build's input set 2026-11-25. EXPIRES the day the build starts reading one of these — the build then fails
    its own gates, in CI, loudly. */
export const NOT_SHIPPED = [/^tests\//, /^docs\//, /^dev-notes\//, /^\.github\//, /^\.agents\//, /^\.claude\//, /^\.codex\//, /^supabase\//, /^[^/]+\.md$/];

const posix = (p) => p.split('\\').join('/');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').map((s) => s.trim()).filter(Boolean);

/** The files this branch changes against origin/main, plus what is not committed yet. */
export function changedPaths() {
  const out = new Set();
  for (const args of [['diff', '--name-only', '--diff-filter=d', 'origin/main...HEAD'], ['diff', '--name-only', '--diff-filter=d', 'HEAD'], ['ls-files', '--others', '--exclude-standard']]) {
    try { for (const p of git(args)) out.add(posix(p)); } catch { /* no origin/main or not a checkout: that source contributes nothing */ }
  }
  return [...out].sort();
}

const textOf = (p) => { try { return readFileSync(join(ROOT, p), 'utf8'); } catch { return ''; } };

/** Regression tests this change reaches: changed themselves, or naming a changed path. */
export function selectTests(changed, { tests = testFiles(), read = textOf } = {}) {
  const set = new Set(changed);
  const named = changed.filter((p) => !p.startsWith('dev-notes/'));
  return tests.filter((t) => set.has(t) || (() => { const s = read(t); return named.some((p) => p !== t && s.includes(p)); })());
}

function testFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const p = d + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (/\.test\.mjs$/.test(e.name)) out.push(p);
    }
  };
  walk('tests');
  return out.sort();
}

/** The scripts a script reaches through relative imports (transitively), repository-relative. */
export function closureOf(file, read = textOf, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const m of read(file).matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\bnew URL\(\s*)['"](\.\/[^'"]+\.m?js)['"]/g)) {
    closureOf(posix(join(dirname(file), m[1])), read, seen);
  }
  return seen;
}

/** Does `text` name `dir` as a path segment in quotes — `'js'`, `'js/…'`, `"js"`? */
const namesDir = (text, dir) => new RegExp(`['"\`]${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:['"\`/])`).test(text);

/** Gates this change reaches, and why. `cost` is the ledger's seconds per gate. */
export function selectGates(changed, { gates = declaredGates(), cost = ledgerSeconds(), read = textOf, scriptOf = (g) => { const f = scriptFileOf(g); return f ? posix(relative(ROOT, f)) : null; }, all = false } = {}) {
  /* the directory rule is for DATA-and-source directories. `scripts/`, `tests/`, `docs/` and `dev-notes/` are named by almost
     every gate (where the tool itself lives), so naming them says nothing about what the gate reads; for those only the
     file-level evidence above counts. MEASURED 2026-11-25: with `scripts/` allowed, an edit to one script selected the
     377 s check:histfill, which reads none of it. */
  const tops = [...new Set(changed.map((p) => p.split('/')[0]).filter((d) => !['scripts', 'tests', 'docs', 'dev-notes'].includes(d) && changed.some((c) => c.startsWith(d + '/'))))];
  return gates.map((gate) => {
    const file = scriptOf(gate);
    if (all) return { gate, why: '--all-gates' };
    if (Number.isFinite(cost[gate]) && cost[gate] <= CHEAP_S) return { gate, why: `cheap (${cost[gate]}s)` };
    if (!file) return null;
    const closure = [...closureOf(file, read)];
    const hit = closure.find((f) => changed.includes(f));
    if (hit) return { gate, why: `its script ${hit} changed` };
    const text = closure.map((f) => read(f)).join('\n');
    const named = changed.find((p) => text.includes(p));
    if (named) return { gate, why: `names ${named}` };
    const dir = tops.find((d) => namesDir(text, d));
    if (dir) return { gate, why: `reads ${dir}/` };
    return null;
  }).filter(Boolean);
}

function ledgerSeconds() {
  try { return JSON.parse(readFileSync(join(ROOT, '.github', 'gate-cost.json'), 'utf8')).seconds || {}; } catch { return {}; }
}

export const buildReaches = (changed) => changed.some((p) => !NOT_SHIPPED.some((re) => re.test(p)));

/* ── running ─────────────────────────────────────────────────────────────── */
const sh = (cmd, args, env = process.env) => new Promise((ok) => {
  const t0 = Date.now();
  const c = spawn(cmd, args, { cwd: ROOT, env, shell: process.platform === 'win32' && /\.cmd$|^npm$/.test(cmd), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { out += d; });
  c.on('close', (code) => ok({ code, out, s: (Date.now() - t0) / 1000 }));
  c.on('error', (e) => ok({ code: 1, out: String(e), s: (Date.now() - t0) / 1000 }));
});

async function pool(items, width, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(width, items.length)) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const changed = changedPaths();
  if (!changed.length) { console.log('preflight: nothing differs from origin/main — nothing to reach.'); return 0; }

  const tests = selectTests(changed);
  const picked = selectGates(changed, { all: has('--all-gates') });
  const build = !has('--no-build') && buildReaches(changed);
  const free = picked.filter((g) => !needsBuild(g.gate)), readers = picked.filter((g) => needsBuild(g.gate));
  const cost = ledgerSeconds();

  console.log(`preflight · ${changed.length} file(s) changed · ${tests.length} test file(s) reached · ${free.length} gate(s)${build ? ` + build + ${declaredGates().filter(needsBuild).length} gate(s) that read it` : ' (no build)'}`);
  for (const g of free) console.log(`  ${g.gate.padEnd(22)} ${String(cost[g.gate] ?? '?').padStart(5)}s  ${g.why}`);
  for (const t of tests.slice(0, 40)) console.log(`  test ${t}`);
  if (tests.length > 40) console.log(`  … and ${tests.length - 40} more test files`);
  if (has('--plan')) return 0;

  const results = [];   // { name, code, out, s }
  const width = Math.max(2, availableParallelism() - 2);

  if (!has('--no-regen')) {
    const r = await sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'regen']);
    console.log(`regen ${r.code === 0 ? 'ok' : 'FAILED'} (${r.s.toFixed(0)}s)`);
    if (r.code !== 0) results.push({ name: 'npm run regen', ...r });
  }

  /* the build, the build-free gates and the tests all start together; the gates that read the build wait for it */
  const buildRun = build ? sh(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build']).then((r) => ({ name: 'npm run build', ...r })) : Promise.resolve(null);
  const testRun = tests.length
    ? sh(process.execPath, ['--test', ...tests], offlineEnv(ROOT)).then((r) => ({ name: `node --test (${tests.length} files)`, ...r }))
    : Promise.resolve(null);
  const gateRun = pool(free, width - 2, async (g) => {
    const [cmd, args] = gateCommand(g.gate);
    return { name: g.gate, ...(await sh(cmd, args, gateEnv())) };
  });
  const [b, t, gs] = await Promise.all([buildRun, testRun, gateRun]);
  for (const r of [b, t, ...gs]) if (r) results.push(r);

  if (b && b.code === 0 && readers.length) {
    const more = await pool(readers, width, async (g) => {
      const [cmd, args] = gateCommand(g.gate);
      return { name: g.gate, ...(await sh(cmd, args, { ...gateEnv(), IM_PREBUILT_DIST: '1' })) };
    });
    results.push(...more);
  }

  const red = results.filter((r) => r.code !== 0);
  for (const r of results) console.log(`${r.code === 0 ? 'ok  ' : 'RED '} ${r.name}  ${r.s.toFixed(0)}s`);
  for (const r of red) console.log(`\n── ${r.name} ──\n${r.out.split('\n').slice(-60).join('\n')}`);
  console.log(red.length ? `\npreflight: ${red.length} red — ${red.map((r) => r.name).join(', ')}` : '\npreflight: nothing this diff reaches is red here. (CI still runs the rest.)');
  return red.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exit(await main());
