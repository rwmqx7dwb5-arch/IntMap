#!/usr/bin/env node
/* ============================================================================
 *  IntMap · company REFRESH PLAN — which profiles this week's run rebuilds
 * ----------------------------------------------------------------------------
 *  MEASURED 2026-10-03, BEFORE THIS FILE: every one of the 533 profiles in
 *  data/companies/profiles/ said `generatedAt: "2026-08-23"`, 501 of them were
 *  `osmPending` (OpenStreetMap was never successfully asked for that company),
 *  and no workflow ran scripts/companies/build.mjs at all. The atlas was one
 *  photograph, taken once — the shape memory `intmap-discovered-list-is-a-
 *  photograph` names: the design was right, nothing ran it again.
 *
 *  .github/workflows/companies-refresh.yml now runs the build every week, but
 *  NOT over all 533 companies: Overpass publishes a rate limit of two queries in
 *  flight (scripts/companies/osm.mjs), and a run that asks for everything is the
 *  run the circuit breaker in osm.mjs cuts short — which is how 501 companies
 *  became pending in the first place. So each run rebuilds a BATCH, chosen here:
 *
 *    1. every company whose profile is `osmPending`, oldest profile first —
 *       a claim the build has not finished establishing comes before a claim
 *       that is merely old;
 *    2. then the oldest profiles, so that every company is re-read in rotation.
 *
 *  ⚠ ONLY COMPANIES ALREADY IN data/companies/index.json ARE PLANNED. build.mjs
 *  collapses two manifest rows that resolve to one identity (toyota-motor and
 *  toyota → Q53268) by looking at ALL the rows it is given; a batch that held
 *  only the dropped twin would ship it as a second Toyota. The index is the set
 *  of identities that survived that collapse, so planning from it keeps the
 *  collapse decided by the run that saw every row.
 *
 *  Pure `plan()` (evaluated by tests/companies-elections-live-checks.test.mjs);
 *  the CLI reads the committed bytes and prints / writes the id list.
 *
 *    node scripts/companies/refresh-plan.mjs                 the plan, as a table
 *    node scripts/companies/refresh-plan.mjs --out ids.txt   … and the ids, comma-separated
 *        [--batch N] [--summary s.md]
 * ==========================================================================*/
import { readFileSync, readdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* How many companies one weekly run rebuilds.
   OBSERVED: osm.mjs measured one exact-QID Overpass query at 2.1 s with two in flight, and the
   Wikidata half of build.mjs batches entities 50 at a time; 120 companies is therefore about two
   minutes of Overpass and a few dozen Wikidata requests — far inside one job, and far below the
   twelve consecutive failures at which osm.mjs gives up on a run. At 120 a week the 501 pending
   companies of 2026-10-03 clear in five runs, and afterwards every profile is re-read about every
   four and a half weeks.
   EXPIRES: if a run is cut short by osm.mjs's circuit breaker (then this is too many for the
   upstream that day — the companies stay pending and lead the next plan), or the atlas grows past
   about 1,500 companies (then the rotation is slower than Wikidata's own weekly cadence warrants).
   CANON: this constant; the workflow passes nothing else. */
export const BATCH = 120;

/**
 * @param {Array<{id:string}>} rows      data/companies/index.json `companies`
 * @param {Map<string,{generatedAt?:string, osmPending?:boolean}>} profiles  by id
 * @returns {{ ids:string[], picked:Array<{id,why,generatedAt}>, pending:number, total:number }}
 */
export function plan(rows, profiles, { batch = BATCH } = {}) {
  const known = (rows || []).filter((r) => r && typeof r.id === 'string' && r.id);
  const at = (id) => {
    const p = profiles.get(id);
    /* a profile with no readable date is the oldest possible — «we cannot tell how old it is» is
       not «fresh» (the same choice scripts/data-refresh.mjs makes for a bundle it cannot date) */
    return p && /^\d{4}-\d{2}-\d{2}$/.test(String(p.generatedAt || '')) ? p.generatedAt : '0000-00-00';
  };
  const pending = (id) => !!(profiles.get(id) && profiles.get(id).osmPending);
  const order = known.map((r) => ({ id: r.id, generatedAt: at(r.id), pending: pending(r.id) }))
    .sort((a, b) => (b.pending - a.pending) || a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id));
  const n = Math.max(0, Math.floor(Number(batch) || 0));
  const picked = order.slice(0, n).map((o) => ({ id: o.id, generatedAt: o.generatedAt, why: o.pending ? 'osmPending' : 'oldest' }));
  return { ids: picked.map((p) => p.id), picked, pending: order.filter((o) => o.pending).length, total: order.length };
}

/** The committed index + profiles, read the same way check:companies reads them. */
export function readCommitted(root = ROOT) {
  const dir = join(root, 'data', 'companies');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const profiles = new Map();
  const pdir = join(dir, 'profiles');
  for (const f of (existsSync(pdir) ? readdirSync(pdir) : [])) {
    if (!f.endsWith('.json')) continue;
    try {
      const p = JSON.parse(readFileSync(join(pdir, f), 'utf8'));
      profiles.set(f.replace(/\.json$/, ''), { generatedAt: p.generatedAt, osmPending: !!p.osmPending });
    } catch (_) { /* an unreadable profile has no date: plan() puts it first */ }
  }
  return { rows: index.companies || [], profiles };
}

/** How old the atlas is, profile by profile — the receipt the weekly summary prints. */
export function ages(profiles, today) {
  const t = Date.parse(today);
  const days = [...profiles.values()].map((p) => (/^\d{4}-\d{2}-\d{2}$/.test(String(p.generatedAt || '')) ? Math.floor((t - Date.parse(p.generatedAt)) / 86400000) : null));
  const known = days.filter((d) => d != null).sort((a, b) => a - b);
  const q = (f) => (known.length ? known[Math.min(known.length - 1, Math.floor(f * known.length))] : null);
  return { profiles: profiles.size, undated: days.length - known.length, medianDays: q(0.5), oldestDays: known.length ? known[known.length - 1] : null,
    pending: [...profiles.values()].filter((p) => p.osmPending).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const { rows, profiles } = readCommitted();
  const p = plan(rows, profiles, { batch: arg('--batch') != null ? Number(arg('--batch')) : BATCH });
  const a = ages(profiles, new Date().toISOString().slice(0, 10));
  console.log(`companies: ${p.total} in the index · osmPending ${p.pending} · median profile age ${a.medianDays} d · oldest ${a.oldestDays} d`);
  console.log(`this run rebuilds ${p.ids.length}: ${p.picked.filter((x) => x.why === 'osmPending').length} pending, ${p.picked.filter((x) => x.why === 'oldest').length} oldest`);
  if (arg('--out')) writeFileSync(arg('--out'), p.ids.join(','));
  if (arg('--summary')) {
    appendFileSync(arg('--summary'), [
      '## Company atlas — weekly refresh plan', '',
      `| | |`, `|---|---|`,
      `| companies in the index | ${p.total} |`,
      `| osmPending before this run | ${p.pending} |`,
      `| median / oldest profile age | ${a.medianDays} d / ${a.oldestDays} d |`,
      `| rebuilt by this run | ${p.ids.length} (${p.picked.filter((x) => x.why === 'osmPending').length} pending, ${p.picked.filter((x) => x.why === 'oldest').length} oldest) |`,
      '', '<sub>scripts/companies/refresh-plan.mjs · docs/COMPANIES.md §11</sub>', '',
    ].join('\n'));
  }
}
