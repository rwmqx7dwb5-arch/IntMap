#!/usr/bin/env node
/* Historical place assertions which cannot rename a modern tile label.
 * The existing Pleiades harvest requires a name still current today. That is an
 * identity safeguard for RENAMING, not evidence that all other places vanished.
 * Keep those source records as independent places, with their own IDs and links.
 *
 * Offline build/check: node scripts/build-hist-places.mjs [--check]
 * Harvest the reduced upstream cache produced by scripts/histcities/harvest.mjs:
 *   node scripts/build-hist-places.mjs --harvest <pleiades-min2.json> --as-of YYYY-MM-DD
 * --as-of is the date the source snapshot was read, not today's build date.
 * No second downloader/parser: the existing city harvest owns the JSON-LD scan.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, 'scripts/histplaces/pleiades-record.json');
const OUTPUT = path.join(ROOT, 'data/hist-places.json');
export const SOURCE = Object.freeze({
  publisher: 'Pleiades and its contributors',
  url: 'https://pleiades.stoa.org/',
  download: 'https://atlantides.org/downloads/pleiades/json/pleiades-places-latest.json.gz',
  licence: 'CC BY 3.0', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  coordinates: 'https://pleiades.stoa.org/help/representative-points',
  periods: 'https://pleiades.stoa.org/vocabularies/time-periods',
});

export function eligible(place, year) {
  return /^\d+$/.test(String(place.id))
    && Array.isArray(place.rp) && place.rp.length === 2
    && place.rp.every(Number.isFinite) && Math.abs(place.rp[0]) <= 180 && Math.abs(place.rp[1]) <= 90
    && /creative commons attribution 3\.0/i.test(place.rights || '')
    && !/share.?alike/i.test(place.rights || '')
    && (place.types || []).some(t => /(^|-)settlement(-|$)/.test(t))
    && (place.names || []).some(n => datedName(n) && n.e < year)
    && !(place.names || []).some(n => datedName(n) && n.e >= year);
}
function datedName(n) {
  return !!String(n.r || n.a || '').trim() && Number.isInteger(n.s) && Number.isInteger(n.e)
    && n.s !== 0 && n.e !== 0 && n.s <= n.e;
}

export function selectRecords(places, year) {
  const found = new Map();
  for (const p of places) {
    if (!eligible(p, year)) continue;
    const row = { id: String(p.id), title: p.title, rights: p.rights, types: p.types,
      rp: p.rp, names: p.names };
    if (found.has(row.id) && JSON.stringify(found.get(row.id)) !== JSON.stringify(row))
      throw new Error('Conflicting upstream records for Pleiades ' + row.id);
    found.set(row.id, row);
  }
  return [...found.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

export function compile(record, renamedPlaceIds = new Set()) {
  const year = Number(record.asOf.slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.asOf) || !Number.isFinite(year)) throw new Error('Source read date missing');
  const rows = selectRecords(record.places, year);
  if (rows.length !== record.places.length) throw new Error('Snapshot contains ineligible or duplicate source records');
  if (JSON.stringify(record.source) !== JSON.stringify(SOURCE)) throw new Error('Source declaration drift');
  return { v: 1, source: record.source, asOf: record.asOf,
    datePrecision: 'approximate-source-period', coordinatePrecision: 'source-representative-point',
    places: rows.filter(p => !renamedPlaceIds.has('pl-' + p.id)).map(p => ({ id: 'pl-' + p.id, title: p.title, lon: p.rp[0], lat: p.rp[1],
      names: p.names.filter(datedName).map(n => ({ r: n.r, a: n.a, l: n.l, s: n.s, e: n.e })) })) };
}

export function main(args = process.argv.slice(2)) {
  const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  if (args.includes('--harvest')) {
    const file = arg('--harvest'), asOf = arg('--as-of');
    if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) throw new Error('--harvest requires the upstream cache and --as-of YYYY-MM-DD');
    const bytes = readFileSync(path.resolve(file));
    const all = JSON.parse(bytes), places = selectRecords(all, Number(asOf.slice(0, 4)));
    const record = { v: 1, source: SOURCE, asOf, harvest: { inputRecords: all.length,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      selection: 'CC BY 3.0 settlement with a representative point and dated names, none covering the snapshot year' }, places };
    mkdirSync(path.dirname(RECORD), { recursive: true });
    writeFileSync(RECORD, JSON.stringify(record) + '\n');
  }
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  /* Identity deduplication only. Coordinates or similar names cannot prove two
     source places are the same settlement. Existing tile renamings keep priority. */
  const cities = JSON.parse(readFileSync(path.join(ROOT, 'data/hist-cities.json'), 'utf8'));
  const data = compile(record, new Set(cities.cities.map(p => p.id))), text = JSON.stringify(data) + '\n';
  if (args.includes('--check')) {
    if (readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error('hist-places bundle differs from licensed source record');
  } else writeFileSync(OUTPUT, text);
  console.log(`hist-places: ${data.places.length} source places, ${data.places.reduce((n, p) => n + p.names.length, 0)} dated name assertions; ${Buffer.byteLength(text)} bytes`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
