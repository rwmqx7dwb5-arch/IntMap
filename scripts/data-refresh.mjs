#!/usr/bin/env node
/* ============================================================================
 *  scripts/data-refresh.mjs — REBUILD THE BUNDLES THAT ARE DUE, AND ONLY THOSE THAT MAY BE
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-09-30, BEFORE THIS FILE: of the scripts that write into data/, exactly one ran on a
 *  schedule — build-tle-snapshot.mjs, twice a day, from .github/workflows/tle-refresh.yml. Every
 *  other bundle was as old as the last time a person happened to run its builder: spacecraft and
 *  small-bodies 2026-08-10, osm-diplo 08-19, subcables 08-23, npp 09-09. The TLE job already
 *  solves the hard part — a bot pull request that lands on a ruleset-protected `main` and then
 *  starts the deploy — so this does not build a second one. It is a STEP of that job: after the
 *  catalogue is rebuilt, the other bundles that are due are rebuilt too, and the one pull request
 *  carries them all.
 *
 *  ⚠ WHICH BUILDERS — DECLARED, NOT LISTED HERE. A builder is on the roster when its own GOVERNANCE
 *  record says `autoRefresh: '<why it is safe to run unattended>'`. check:datagov (rule
 *  refresh-safe) refuses that statement from a builder that can write an unchecked response, or
 *  whose bundle is `static`. What «safe» means, and which builders were left off and why, is written
 *  in docs/DATA-GOVERNANCE.md; the short version is: light (a few dozen requests), keyless, and
 *  every response checked before a byte is written (scripts/lib/upstream.mjs).
 *
 *  ⚠ WHEN — THE BUNDLE'S OWN DECLARED CADENCE. A builder runs when any bundle it declares is
 *  `aging` or `stale` by check:datagov's own judgement (the date its bytes were last written × the
 *  cadence declared for it), so a monthly upstream is asked about monthly and a daily one daily —
 *  the schedule of this job (twice a day) is only how often the question is asked.
 *  ⚠ A SHALLOW CLONE CANNOT DATE ITS BYTES (actions/checkout fetches one commit), so there the date
 *  is asked of the same history on GitHub: the newest commit on `main` that touched the path. The
 *  answer is the same fact, from the same repository, read remotely.
 *  ⚠ A DATE THAT COULD NOT BE READ EITHER WAY MAKES THE BUILDER DUE. «We cannot tell whether it is
 *  fresh» is not «fresh»; for this one decision the safe action is the rebuild, whose builder
 *  refuses to write anything it could not check.
 *
 *  ⚠ A BUILDER THAT FAILS LEAVES ITS BUNDLE AS IT WAS. The builders on the roster exit non-zero
 *  without writing when their upstream does not answer; this script records the failure, prints a
 *  `::warning::` for the job log, and moves on to the next one. It does not retry: the next
 *  scheduled run is the retry, twelve hours later, and it is a different attempt.
 *
 *  Run:
 *    node scripts/data-refresh.mjs                 which builders are due, and why (no network, no writes)
 *    node scripts/data-refresh.mjs --run           run the due builders
 *        [--summary out.md] [--paths-out list.txt] [--all]
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { builderDeclarations } from './data-governance.mjs';
import { freshness, read } from '../js/data-governance.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const has = (k) => process.argv.includes(k);
const arg = (k) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : null; };

/* How long one builder may run before it is stopped.
   OBSERVED: none of the roster builders has been timed in CI; by hand each finishes in minutes
   (small-bodies is the longest: about ninety paced SBDB requests). EXPIRES: if a roster builder is
   stopped by this — then it is either too heavy for the roster or this is too short.
   CANON: this constant. */
const BUILDER_TIMEOUT_MS = 20 * 60 * 1000;

/** The roster: every builder whose declaration says autoRefresh, with the bundles it declares. Pure. */
export function roster(builders) {
  const out = [];
  for (const b of builders) {
    const v = b.declaration;
    if (!v || typeof v !== 'object') continue;
    const keys = Object.keys(v).filter((k) => k.startsWith('data/'));
    const recs = keys.length ? keys.map((k) => [k, v[k]]) : [[null, v]];
    const why = recs.map(([, r]) => r && r.autoRefresh).find((x) => typeof x === 'string' && x.trim());
    if (!why) continue;
    out.push({ builder: b.subject, why, paths: keys.length ? keys : b.paths,
      cadences: [...new Set(recs.map(([, r]) => read(r || {}).cadence).filter((c) => c != null).map(String))] });
  }
  return out;
}

/* The newest commit that changed `p`: from the local history when there is one, from GitHub when
   this is a shallow clone. ⚠ THE SAME SOURCE check:datagov uses for these bundles — none of the
   roster's bundles states an in-band `generatedAt` today, so the gate dates them by git too; a
   roster builder that starts writing one must be dated by it here as well. */
function localDate(p) {
  try {
    if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT }).toString().trim() === 'true') return null;
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', p], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch { return null; }
}
function remoteDate(p) {
  let repo = process.env.GITHUB_REPOSITORY;
  if (!repo) { try { repo = JSON.parse(fs.readFileSync(path.join(ROOT, 'data-assets.json'), 'utf8')).repo; } catch { repo = null; } }
  if (!repo) return null;
  try {
    const d = execFileSync('gh', ['api', `repos/${repo}/commits?path=${encodeURIComponent(p)}&sha=main&per_page=1`, '--jq', '.[0].commit.committer.date'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return d || null;
  } catch { return null; }
}

const dateOfPath = (p) => {
  const l = localDate(p);
  if (l) return { at: l, from: 'git' };
  const r = remoteDate(p);
  return { at: r, from: r ? 'GitHub, newest commit on main' : null };
};

/**
 * Is this roster entry due? `dateOf(path)` → { at, from } is injected in tests.
 * ⚠ The cadence is judged by js/data-governance.js freshness() — the same function, and the same
 * AGING_AT, that check:datagov reports with — so «due» here and «aging» there are one statement.
 */
export function due(entry, { now = new Date(), dateOf = dateOfPath } = {}) {
  const reasons = [];
  const cadence = entry.cadences[0] || null;
  if (entry.cadences.length > 1) reasons.push({ path: '*', verdict: 'unknown', why: 'its bundles declare different cadences (' + entry.cadences.join(', ') + ') — check:datagov refuses that; rebuilt rather than guessed' });
  for (const p of entry.paths) {
    const d = dateOf(p) || {};
    const at = d.at || null, from = d.from || null;
    if (!at) { reasons.push({ path: p, verdict: 'unknown', why: 'its date could not be read here or on GitHub — rebuilt rather than assumed fresh' }); continue; }
    const f = freshness({ cadence, generatedAt: at }, now);
    if (f.verdict === 'aging' || f.verdict === 'stale') reasons.push({ path: p, verdict: f.verdict, why: `${cadence}, last written ${String(at).slice(0, 10)} [${from}], due ${String(f.dueAt).slice(0, 10)}` });
  }
  return reasons;
}

function run(entry) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [entry.builder], { cwd: ROOT, stdio: 'inherit', timeout: BUILDER_TIMEOUT_MS });
  return { ok: r.status === 0, status: r.status, signal: r.signal || null, seconds: Math.round((Date.now() - t0) / 1000) };
}

function changedPaths() {
  const out = execFileSync('git', ['status', '--porcelain', '--', 'data'], { cwd: ROOT }).toString();
  return out.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
}

function main() {
  const list = roster(builderDeclarations());
  if (!list.length) { console.error('no builder declares autoRefresh — nothing is on the roster, which is not «nothing is due»'); process.exit(2); }
  const plan = list.map((e) => ({ ...e, reasons: has('--all') ? [{ path: '*', verdict: '--all', why: 'asked for' }] : due(e) }));
  for (const e of plan) {
    console.log((e.reasons.length ? 'DUE   ' : 'fresh ') + e.builder + '  (' + e.cadences.join(', ') + ')');
    for (const r of e.reasons) console.log('        ' + r.verdict.padEnd(8) + r.path + ' — ' + r.why);
  }
  if (!has('--run')) return;
  const results = [];
  for (const e of plan.filter((x) => x.reasons.length)) {
    console.log('\n── ' + e.builder);
    const r = run(e);
    results.push({ builder: e.builder, ...r });
    if (!r.ok) console.log(`::warning::${e.builder} did not finish (exit ${r.status}${r.signal ? ', ' + r.signal : ''}); its bundle is left as it was and the next scheduled run asks again.`);
  }
  const changed = changedPaths();
  const sm = arg('--summary');
  if (sm) {
    const L = ['### Other bundles that were due', ''];
    if (!results.length) L.push('None was due.');
    else {
      L.push('| builder | result | seconds |', '|---|---|---|');
      for (const r of results) L.push(`| \`${r.builder}\` | ${r.ok ? 'rebuilt' : '**failed** (exit ' + r.status + ') — left as it was'} | ${r.seconds} |`);
    }
    L.push('', 'Chosen by `scripts/data-refresh.mjs` from each builder\'s declared `autoRefresh` and cadence (docs/DATA-GOVERNANCE.md).', '');
    fs.writeFileSync(sm, L.join('\n'));
  }
  const po = arg('--paths-out');
  if (po) fs.writeFileSync(po, changed.join('\n') + (changed.length ? '\n' : ''));
  console.log(`\n${results.filter((r) => r.ok).length} rebuilt, ${results.filter((r) => !r.ok).length} failed; ${changed.length} path(s) under data/ changed`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
