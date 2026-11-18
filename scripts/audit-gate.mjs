#!/usr/bin/env node
/* ============================================================================
 *  The build-tooling advisory gate: «high or critical» in the lock, minus a LEDGER of dated exceptions.
 *
 *  WHY IT EXISTS. `npm audit --audit-level=high` has no «except this advisory», and an advisory with NO
 *  published fix cannot be cleared by any change here (measured 2026-11-18: picomatch 4.0.7 is the newest
 *  release and sits inside GHSA-fc5q-39xc-vjpf `<=4.0.7`; `npm audit fix --force` only moves vite). The job
 *  was therefore red on every PR and on main, which also stopped the bots that refuse to land on red checks
 *  (perf-ceiling, the weekly data refreshes). Red on everything is a gate nobody reads.
 *
 *  WHAT IT DOES NOT DO. It never touches the browser-shipped audit (`--omit=dev`, every severity) — that step
 *  stays exactly as it was. An exception here is about build tooling only.
 *
 *  AN EXCEPTION IS A LOAN, NOT A FACT: each row names the advisory, why nothing can be done, the day it was
 *  measured, and an `expires` day. After `expires` the advisory counts again (the gate goes red and says so),
 *  so a forgotten exception cannot outlive its reason. Delete the row the day a fixed release exists.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LEDGER_PATH = join(HERE, 'audit-exceptions.json');
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

/** Every advisory object an `npm audit --json` report names (strings in `via` only point at other packages). */
export function advisories(report) {
  const out = new Map();
  for (const [pkg, v] of Object.entries(report?.vulnerabilities || {})) {
    for (const via of v.via || []) {
      if (typeof via !== 'object' || !via) continue;
      const ghsa = String(via.url || '').split('/').pop() || String(via.source);
      if (!out.has(ghsa)) out.set(ghsa, { ghsa, package: via.name || pkg, severity: via.severity, title: via.title, range: via.range });
    }
  }
  return [...out.values()];
}

/** @returns {{open: object[], excused: object[], expired: object[]}} — `open` and `expired` make the gate red. */
export function evaluate(report, exceptions, today, level = 'high') {
  const open = [], excused = [], expired = [];
  const byId = new Map((exceptions || []).map((e) => [e.ghsa, e]));
  for (const a of advisories(report)) {
    if ((RANK[a.severity] ?? 4) < RANK[level]) continue;
    const e = byId.get(a.ghsa);
    if (!e) open.push(a);
    else if (!(String(e.expires) > today)) expired.push({ ...a, expires: e.expires });
    else excused.push({ ...a, expires: e.expires });
  }
  return { open, excused, expired };
}

function main() {
  const r = spawnSync('npm', ['audit', '--package-lock-only', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(r.stdout); } catch { console.error('audit-gate: npm audit did not return JSON —\n' + (r.stderr || r.stdout)); process.exit(2); }
  if (report.error) { console.error('audit-gate: npm audit failed — ' + (report.error.summary || JSON.stringify(report.error))); process.exit(2); }
  const today = new Date().toISOString().slice(0, 10);
  const { open, excused, expired } = evaluate(report, JSON.parse(readFileSync(LEDGER_PATH, 'utf8')), today);
  for (const a of excused) console.log(`excused until ${a.expires}: ${a.ghsa} ${a.package} (${a.severity}) — ${a.title}`);
  for (const a of expired) console.error(`EXCEPTION EXPIRED ${a.expires}: ${a.ghsa} ${a.package} (${a.severity}) — ${a.title}. Re-measure whether a fixed release exists.`);
  for (const a of open) console.error(`ADVISORY: ${a.ghsa} ${a.package} (${a.severity}) ${a.range} — ${a.title}`);
  process.exit(open.length || expired.length ? 1 : 0);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
