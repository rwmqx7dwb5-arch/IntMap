#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/transit-discover.mjs — DISCOVER the open GTFS timetables of the world and say, for
 *  each, whether IntMap (a commercial service) may compile and show it
 * ----------------------------------------------------------------------------
 *  js/transit-feeds.js ships the feeds whose PUBLISHER's licence was read by a person; that list was
 *  Luxembourg alone. A hand-written list cannot grow to the world, and it cannot tell Atlas about the
 *  thousands of feeds that exist and are NOT usable. This script does both by DISCOVERY:
 *
 *    1 · reads the Mobility Database catalogue (MobilityData, CC0 — https://files.mobilitydatabase.org/
 *        feeds_v2.csv, no key, no account) and keeps the GTFS-schedule feeds that are active and need
 *        no authentication;
 *    2 · classifies each feed's licence link with js/transit-licence.js (the GRAMMAR of the licence
 *        families: CC terms, the national licences with one canonical URL each);
 *    3 · writes data/transit-feed-catalogue.json: one row per feed with a verdict —
 *            usable-lead   the stated licence permits commercial use  (NOT yet read at the publisher)
 *            unusable      the stated licence forbids it (NonCommercial / NoDerivatives)
 *            unknown       a licence page nobody has read
 *            none          no licence stated — NOT public domain, never used
 *
 *    node scripts/transit-discover.mjs              fetch the catalogue, write data/transit-feed-catalogue.json
 *    node scripts/transit-discover.mjs --csv f.csv  the same from a local copy (a test, or offline)
 *    node scripts/transit-discover.mjs --report     the counts by verdict and country, nothing written
 *    node scripts/transit-discover.mjs --check      the committed catalogue is what its own classifier derives
 *
 *  ⚠ A usable-lead is a LEAD. js/transit-feeds.js still requires the publisher's own page to be read
 *  before a feed is BUILT (the aggregator copies a link a contributor gave; the publisher may say
 *  otherwise). The catalogue lets Atlas say «a feed exists, the licence reported is X, it is not
 *  shipped» — and, for the others, «it exists and may not be used, because …».
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyLicence } from '../js/transit-licence.js';
import { fetchChecked, USER_AGENT } from './lib/upstream.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/transit-feed-catalogue.json';
export const CATALOGUE_URL = 'https://files.mobilitydatabase.org/feeds_v2.csv';

/* ⚠ 出自は値である（check:datagov が実行せずに読む）。 */
export const GOVERNANCE = {
  [OUT]: {
    upstreams: [
      { publisher: 'MobilityData — Mobility Database', url: 'https://mobilitydatabase.org/', licence: 'CC0-1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false, creditRequired: false,
        fields: 'per feed: provider, location, licence link, direct-download link, stop bounding box, status. The catalogue (metadata) is CC0 per github.com/MobilityData/mobility-database-catalogs; the feeds it points to keep their own publishers\' terms.',
        paidBy: 'Mobility Database — MobilityData (catalogue of open GTFS feeds, CC0 1.0)' },
    ],
    publisher: 'MobilityData — Mobility Database (classified by IntMap)',
    url: 'https://mobilitydatabase.org/',
    licence: 'CC0 1.0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', attribution: false,
    paidBy: 'Mobility Database — MobilityData (catalogue of open GTFS feeds, CC0 1.0)',
    cadence: 'P7D',
    cadenceBasis: {
      observed: 'measured 2026-11-21: the CSV is rewritten by MobilityData daily (object generation changes between fetches); feeds are added and retired weekly at most',
      expires: 'if the catalogue moves from files.mobilitydatabase.org or stops being published as CSV',
      canon: 'scripts/transit-discover.mjs CATALOGUE_URL',
    },
    autoRefresh: 'one key-free request for the catalogue CSV; the licence of every feed is re-classified from its link, so a feed whose licence link changed changes its verdict at the next run',
    schema: 'scripts/transit-discover.mjs --check (rows [id, country, provider, place, licenceUrl, spdx, verdict, downloadUrl, bbox]) — read by js/transit-catalogue.js',
    builtBy: 'scripts/transit-discover.mjs',
  },
};

/* RFC 4180 (quoted fields, doubled quotes, newlines inside quotes) */
export function parseCsv(s) {
  const rows = []; let r = [], f = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { r.push(f); f = ''; }
    else if (c === '\n') { r.push(f); rows.push(r); r = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || r.length) { r.push(f); rows.push(r); }
  return rows;
}

/* a download link may carry the catalogue's own access token (transport.data.gouv.fr): a credential is never stored */
const bare = (u) => { try { const x = new URL(u); for (const k of [...x.searchParams.keys()]) if (/token|key|secret|auth/i.test(k)) x.searchParams.delete(k); return x.toString(); } catch (_) { return u; } };
const num = (x) => { const v = parseFloat(x); return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : null; };

/** the catalogue rows → feeds IntMap could consider. Pure: the same CSV gives the same catalogue. */
export function deriveCatalogue(csv) {
  const [head, ...body] = parseCsv(csv);
  const ix = Object.fromEntries(head.map((k, i) => [k, i]));
  for (const need of ['id', 'data_type', 'status', 'location.country_code', 'provider', 'urls.direct_download', 'urls.authentication_type', 'urls.license']) {
    if (!(need in ix)) throw new Error('the catalogue no longer has the column «' + need + '» — read the new layout before trusting a classification');
  }
  const g = (r, k) => (r[ix[k]] || '').trim();
  const rows = []; const seen = new Set();
  for (const r of body) {
    if (r.length < head.length - 2) continue;
    if (g(r, 'data_type') !== 'gtfs' || g(r, 'status') !== 'active') continue;
    if (g(r, 'urls.authentication_type') !== '0') continue;           /* a key or login is not a public timetable */
    const id = g(r, 'id'); if (!id || seen.has(id)) continue; seen.add(id);
    const lic = g(r, 'urls.license'); const c = classifyLicence(lic);
    const w = num(g(r, 'location.bounding_box.minimum_longitude')), s = num(g(r, 'location.bounding_box.minimum_latitude')), e = num(g(r, 'location.bounding_box.maximum_longitude')), n = num(g(r, 'location.bounding_box.maximum_latitude'));
    rows.push([id, g(r, 'location.country_code'), g(r, 'provider'), g(r, 'location.municipality') || g(r, 'location.subdivision_name'), lic, c.spdx || '', c.verdict, bare(g(r, 'urls.direct_download')),
      [w, s, e, n].every((v) => v != null) ? [w, s, e, n] : null]);
  }
  rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return rows;
}

export function summarise(rows) {
  const by = {}; const country = {};
  for (const r of rows) { by[r[6]] = (by[r[6]] || 0) + 1; const c = (country[r[1]] = country[r[1]] || { total: 0, usable: 0 }); c.total++; if (r[6] === 'usable-lead') c.usable++; }
  return { feeds: rows.length, byVerdict: by, countries: Object.keys(country).length, countriesWithUsable: Object.values(country).filter((c) => c.usable).length };
}

function bundleOf(rows, today) {
  return {
    v: 1, ...GOVERNANCE[OUT], retrievedAt: today, generatedAt: today, asOf: today,
    src: 'Mobility Database catalogue (feeds_v2.csv), filtered to active, key-free GTFS schedule feeds and classified by js/transit-licence.js — a verdict is the classification of the licence LINK the catalogue holds, not a reading of the publisher\'s terms',
    columns: ['id', 'country', 'provider', 'place', 'licenceUrl', 'spdx', 'verdict', 'downloadUrl', 'bbox'],
    verdicts: { 'usable-lead': 'the stated licence permits commercial use; the publisher\'s page has not been read', unusable: 'the stated licence forbids commercial use or derivatives', unknown: 'a licence page nobody has read', none: 'no licence stated — never used' },
    summary: summarise(rows), feeds: rows,
  };
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const out = path.join(ROOT, OUT);
  if (process.argv.includes('--check')) {
    const b = JSON.parse(fs.readFileSync(out, 'utf8')); const bad = [];
    for (const r of b.feeds) { const c = classifyLicence(r[4]); if (c.verdict !== r[6] || (c.spdx || '') !== r[5]) bad.push(r[0] + ': stored ' + r[6] + ' but the classifier says ' + c.verdict); }
    if (JSON.stringify(b.summary) !== JSON.stringify(summarise(b.feeds))) bad.push('summary does not match the rows');
    if (bad.length) { console.error('transit-feed-catalogue: ' + bad.length + ' problem(s)\n  ' + bad.slice(0, 10).join('\n  ')); process.exit(1); }
    console.log('transit-feed-catalogue ok — ' + b.feeds.length + ' feeds, every verdict re-derived from its licence link');
    return;
  }
  const csv = arg('--csv') ? fs.readFileSync(arg('--csv'), 'utf8') : await fetchChecked(CATALOGUE_URL, { headers: { 'user-agent': USER_AGENT } }, { as: 'text', attempts: 3, timeoutMs: 120000 });
  const rows = deriveCatalogue(csv);
  console.log(JSON.stringify(summarise(rows)));
  if (process.argv.includes('--report')) return;
  fs.writeFileSync(out, JSON.stringify(bundleOf(rows, new Date().toISOString().slice(0, 10))) + '\n');
  console.log('wrote', OUT, fs.statSync(out).size, 'bytes');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
