#!/usr/bin/env node
/* deps-fresh — is the installed node_modules the tree package-lock.json describes?
 *
 * ⚠ WHY THIS EXISTS (multi-aspect-audit, 2026-09-26). Every worktree borrows the MASTER's
 * node_modules through a junction (scripts/worktree.mjs), and `master-sync --sync` moves the
 * master's package-lock.json forward with every merge. Nothing moved the installed tree with it.
 * MEASURED: after the dependency bump the master still held 9 top-level packages at the old
 * major/minor (pdfjs-dist 4.10.38 for 6.3.289, js-yaml 4.3.1 for 5.4.2, katex 0.16 for 0.18,
 * @playwright/test 1.61 for 1.63, …) — every local gate on this machine was running against a
 * dependency tree CI never sees, and green-here/red-there (or the reverse) was the result.
 * The datasets outside git already get this treatment (master-sync places them every run);
 * node_modules is the same class of thing and now gets the same answer.
 *
 *   node scripts/deps-fresh.mjs            # report; exit 1 when stale
 *   node scripts/deps-fresh.mjs --install [dir]   # npm ci when stale, then the test browsers; exit 1 if still stale
 *   import { staleDeps } from './deps-fresh.mjs'
 *
 * The lockfile is the source: each `node_modules/…` entry names the version npm ci would place.
 * An optional entry that is absent is a platform package this machine does not take (esbuild's
 * per-OS binaries and the like), not a stale one. */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const staleDeps = (dir) => {
  const lockPath = join(dir, 'package-lock.json');
  if (!existsSync(lockPath)) return { checked: 0, stale: [], reason: 'no package-lock.json' };
  if (!existsSync(join(dir, 'node_modules'))) return { checked: 0, stale: [{ path: 'node_modules', want: 'installed', got: 'absent' }] };
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const stale = [];
  let checked = 0;
  for (const [p, meta] of Object.entries(lock.packages ?? {})) {
    if (!p.startsWith('node_modules/') || meta.link || !meta.version) continue;
    const pj = join(dir, p, 'package.json');
    if (!existsSync(pj)) {
      if (!meta.optional && !meta.devOptional) stale.push({ path: p, want: meta.version, got: 'absent' });
      continue;
    }
    checked++;
    let got;
    try { got = JSON.parse(readFileSync(pj, 'utf8')).version; } catch { got = 'unreadable'; }
    if (got !== meta.version) stale.push({ path: p, want: meta.version, got });
  }
  return { checked, stale };
};

export const describeStale = ({ stale }, max = 6) => stale.slice(0, max)
  .map((s) => `${s.path.replace(/^node_modules\//, '')} ${s.got} (lock: ${s.want})`)
  .join(', ') + (stale.length > max ? `, … +${stale.length - max}` : '');

/* --install: make the tree the lock, and only when it is not (an up-to-date tree is left alone, so
   the step stays idempotent and cheap). ⚠ THE LOCK MOVING @playwright/test IS NOT THE WHOLE INSTALL.
   Playwright's browsers live outside node_modules and are pinned per release; MEASURED 2026-09-26,
   after npm ci moved 1.61 -> 1.63 every local spec failed at launch («Executable doesn't exist …
   chromium_headless_shell-1243»). So an install that changed the tree also asks Playwright for the
   browser the suite runs (chromium — playwright.config.js runs no other), which is a no-op when present. */
export function install(dir) {
  const r = staleDeps(dir);
  if (!r.stale.length) return { changed: false, after: r };
  console.log(`deps-fresh: node_modules differs from package-lock.json in ${r.stale.length} package(s) (${describeStale(r, 3)}) — npm ci`);
  try { execFileSync('npm ci --no-audit --no-fund', { cwd: dir, stdio: 'inherit', shell: true }); } catch { /* judged by the re-check */ }
  const after = staleDeps(dir);
  if (!after.stale.length && existsSync(join(dir, 'node_modules', '@playwright', 'test'))) {
    try { execFileSync('npx playwright install chromium', { cwd: dir, stdio: 'inherit', shell: true }); }
    catch { console.error('deps-fresh: the test browser could not be installed — run `npx playwright install chromium`'); }
  }
  return { changed: true, after };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const INSTALL = args.includes('--install');
  const pos = args.filter((a) => !a.startsWith('--'));
  const dir = pos[0] ? resolve(pos[0]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  if (INSTALL) {
    const { changed, after } = install(dir);
    if (after.stale.length) { console.error(`deps-fresh: node_modules is STILL not package-lock.json (${describeStale(after)})`); process.exit(1); }
    console.log(`deps-fresh: OK — ${after.checked} installed package(s) match package-lock.json${changed ? ' (installed now)' : ''}`);
    process.exit(0);
  }
  const r = staleDeps(dir);
  if (!r.stale.length) { console.log(`deps-fresh: OK — ${r.checked} installed package(s) match package-lock.json`); process.exit(0); }
  console.error(`deps-fresh: node_modules is NOT the locked tree — ${r.stale.length} package(s) differ: ${describeStale(r)}`);
  console.error('  run `node scripts/deps-fresh.mjs --install` in the master (node scripts/master-sync.mjs --sync does it)');
  process.exit(1);
}
