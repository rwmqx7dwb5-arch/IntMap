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
 *   import { staleDeps } from './deps-fresh.mjs'
 *
 * The lockfile is the source: each `node_modules/…` entry names the version npm ci would place.
 * An optional entry that is absent is a platform package this machine does not take (esbuild's
 * per-OS binaries and the like), not a stale one. */
import { readFileSync, existsSync } from 'node:fs';
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = staleDeps(dir);
  if (!r.stale.length) { console.log(`deps-fresh: OK — ${r.checked} installed package(s) match package-lock.json`); process.exit(0); }
  console.error(`deps-fresh: node_modules is NOT the locked tree — ${r.stale.length} package(s) differ: ${describeStale(r)}`);
  console.error('  run `npm ci` in the master (node scripts/master-sync.mjs --sync does it)');
  process.exit(1);
}
