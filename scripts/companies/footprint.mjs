#!/usr/bin/env node
/**
 * IntMap · company FOOTPRINT — every published facility of every company, in one file, derived from the profiles
 * =============================================================================================
 *  data/companies/profiles/<id>.json holds ONE company's sites and is fetched only when that company is opened, so
 *  the company atlas could answer «where is Toyota?» and never «who is here?» — the question a reader asks of a
 *  country, a port or an industrial valley. Answering it from the profiles would fetch 533 files (3.8 MB).
 *
 *  data/companies/footprint.json is the ANSWER'S INDEX: one row per facility the profiles publish, nothing added,
 *  nothing guessed. It is a DERIVATION — `buildFootprint()` below is the only writer, scripts/companies/build.mjs
 *  calls it right after it writes the index (so the weekly refresh rewrites both together), and
 *  scripts/companies-audit.mjs ㉒ fails while the shipped file is not exactly what the profiles say today.
 *
 *  Shape (compact — the reader of this file is js/company-footprint.js):
 *    { schema: 1, generatedAt,             // the index's own date: the footprint is as old as the profiles
 *      companies: [id…],                   // index order
 *      types:     [facility type…],        // docs/COMPANIES.md §5.1, in first-seen order
 *      statuses:  [status…],
 *      f: [[company#, type#, lon, lat, cc, precision#, status#, name]…] }   // precision: 0 exact · 1 city · 2 region
 *  Coordinates are rounded to 5 decimals (about a metre) — the profiles' own values, no further.
 *
 *  Usage:  node scripts/companies/footprint.mjs --write | --check
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COMPANY_DIR = join(ROOT, 'data', 'companies');
export const FOOTPRINT_FILE = join(COMPANY_DIR, 'footprint.json');
export const PRECISIONS = Object.freeze(['exact', 'city', 'region']);

const r5 = (x) => Math.round(x * 1e5) / 1e5;

/** the footprint the profiles in `dir` describe today */
export function buildFootprint(dir = COMPANY_DIR) {
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const ids = (index.companies || []).map((c) => c.id);
  const types = [], statuses = [], f = [];
  const slot = (arr, v) => { let i = arr.indexOf(v); if (i < 0) { arr.push(v); i = arr.length - 1; } return i; };
  ids.forEach((id, ci) => {
    const file = join(dir, 'profiles', id + '.json');
    if (!existsSync(file)) return;   /* ⑲ of the audit reports a missing profile; the footprint does not invent one */
    const prof = JSON.parse(readFileSync(file, 'utf8'));
    for (const x of prof.facilities || []) {
      if (!Number.isFinite(x.lon) || !Number.isFinite(x.lat)) continue;
      const p = PRECISIONS.indexOf(x.precision);
      f.push([ci, slot(types, x.type || 'other'), r5(x.lon), r5(x.lat), x.cc || '', p < 0 ? 0 : p, slot(statuses, x.status || 'operating'), String(x.name || '')]);
    }
  });
  return { schema: 1, generatedAt: index.generatedAt || '', companies: ids, types, statuses, f };
}
export const serialise = (fp) => JSON.stringify(fp);
export function writeFootprint(dir = COMPANY_DIR) { const fp = buildFootprint(dir); writeFileSync(join(dir, 'footprint.json'), serialise(fp)); return fp; }
/** '' when the shipped file is what the profiles say, else the reason it is not */
export function footprintDrift(dir = COMPANY_DIR) {
  const file = join(dir, 'footprint.json');
  if (!existsSync(file)) return 'data/companies/footprint.json is missing — node scripts/companies/footprint.mjs --write';
  const want = serialise(buildFootprint(dir)), have = readFileSync(file, 'utf8');
  if (want === have) return '';
  let n = '?'; try { n = String(JSON.parse(have).f.length); } catch (_) { }
  return 'data/companies/footprint.json (' + n + ' rows) is not what the profiles say (' + JSON.parse(want).f.length + ' rows) — node scripts/companies/footprint.mjs --write';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--write')) { const fp = writeFootprint(); console.log('footprint: wrote ' + fp.f.length + ' facilities of ' + fp.companies.length + ' companies'); }
  else if (process.argv.includes('--check')) { const d = footprintDrift(); if (d) { console.error(d); process.exit(1); } console.log('footprint: matches the profiles'); }
  else console.log('usage: node scripts/companies/footprint.mjs --write | --check');
}
