/* ============================================================================
 *  IntMap · the company MANIFEST — which companies the atlas covers, and why
 * ----------------------------------------------------------------------------
 *  The manifest is a list of IDENTITIES, not of facts. It says "this row is that
 *  company on Wikidata"; every attribute a user sees is fetched later, from the
 *  sources named in docs/COMPANIES.md. A row whose identity cannot be confirmed
 *  does not ship — see resolve.mjs.
 *
 *  Two populations, kept apart on purpose:
 *
 *    curated   the 190-row table inside js/companies.js. That table is the ONE
 *              source of the live-market-cap universe and this file PARSES it
 *              rather than copying it, so the two can never disagree.
 *    discovered
 *              companies Wikidata itself reports as large (revenue / market cap),
 *              selected with a per-country and per-sector quota so the result is
 *              not 400 American technology firms. Identity is known by
 *              construction here: the QID is where the row came from.
 * ==========================================================================*/
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './wd.mjs';

/** Parse the curated RAW table out of js/companies.js. Derived, never copied. */
export function curatedRows() {
  const src = readFileSync(join(ROOT, 'js', 'companies.js'), 'utf8');
  const m = /const RAW=\[([\s\S]*?)\n\s*\];/.exec(src);
  if (!m) throw new Error('js/companies.js: RAW table not found — the parser and the file have drifted');
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  let rows;
  try { rows = JSON.parse('[' + body.replace(/,\s*$/, '') + ']'.replace(/^/, '')); } catch (_) { rows = null; }
  if (!rows) {
    /* The table is JS, not JSON: single quotes and escapes. Evaluate it in a
       function with no scope rather than reimplementing a JS string parser. */
    rows = Function('"use strict";return ([' + body + '])')();
  }
  const out = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length !== 12) throw new Error('js/companies.js: RAW row is not 12 fields: ' + JSON.stringify(r).slice(0, 120));
    out.push({
      ticker: r[0], name: r[1], nameJa: r[2] || '', country: r[3], sector: r[4], domain: r[5],
      founded: r[6], employees: r[7], revenueB: r[8], netIncomeB: r[9], sharesOutB: r[10], mcapSnapB: r[11],
    });
  }
  return out;
}

/* Slug rules: stable, readable, filename-safe, and unique across the manifest.
   Stability matters more than beauty — the slug is the URL of a profile shard
   and the id a saved view refers to. */
export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'company';
}

export function uniqueSlug(name, taken, hint) {
  const base = slugify(name);
  if (!taken.has(base)) { taken.add(base); return base; }
  const withHint = hint ? base + '-' + slugify(hint) : null;
  if (withHint && !taken.has(withHint)) { taken.add(withHint); return withHint; }
  let i = 2;
  while (taken.has(base + '-' + i)) i++;
  taken.add(base + '-' + i);
  return base + '-' + i;
}

/** The curated table as manifest rows (ids assigned, order preserved). */
export function curatedManifest() {
  const taken = new Set();
  return curatedRows().map((r) => ({
    id: uniqueSlug(r.name, taken, r.ticker),
    name: r.name,
    country: r.country,
    sector: r.sector,
    ticker: r.ticker,
    domain: r.domain,
    origin: 'curated',
  }));
}

export function loadManifest() {
  return JSON.parse(readFileSync(join(ROOT, 'data', 'companies', 'manifest.json'), 'utf8'));
}
