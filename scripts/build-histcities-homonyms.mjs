#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/histcities-homonyms.json.gz — every place on Earth that answers
 *  to one of the record's spellings                                     (#R521)
 * ----------------------------------------------------------------------------
 *  ══ WHY THIS FILE EXISTS AT ALL, WHEN THE APP ALREADY SHIPS A WORLD GAZETTEER ══════════════
 *  Because data/gazetteer-world.json.gz is built to ANSWER A DIFFERENT QUESTION, and using it
 *  here inverted its meaning. scripts/build-gazetteer.mjs feeds js/newsgeo.js, whose job is to
 *  turn one spelling in a headline into ONE point, so it deliberately throws ambiguity away:
 *
 *      rows.sort((a, b) => b.pop - a.pop);
 *      if (seenName.has(key)) return false;          // the more populous homonym already won
 *
 *  …plus every Latin surface form shorter than four characters, every form that is an ordinary
 *  word, and every form a curated table already owns. For a locator that is correct. But
 *  scripts/build-hist-cities.mjs was asking it «does any OTHER city on Earth carry this
 *  spelling?» — of a file that had already deleted the other city. ⚠⚠⚠ THE ORACLE THAT WAS
 *  SUPPOSED TO PROVE UNIQUENESS HAD UNIQUENESS IMPOSED ON IT. Measured on the shipped data:
 *  Kirov (RU, Kaluga oblast, 39 k) and Linden (US, New Jersey, 42 k) are both absent from it
 *  because a more populous namesake outranked them, and both are `place=town` in OSM — which
 *  is exactly the class the label rewrite acts on.
 *
 *  Two more holes came from the same «different question» root: `alternateNamesV2` is filtered
 *  to the eighteen languages js/newsgeo.js can tokenise, AND ENGLISH IS NOT ONE OF THEM, so an
 *  English exonym could not collide with anything; and the gazetteer keeps one Latin column, so
 *  a place whose GeoNames `name` carries diacritics («Kōchi») could never be matched by the
 *  undecorated spelling the vector tile actually carries («Kochi»). Kochi, Japan was invisible
 *  to the gate on both counts at once, and the reader saw 高知 relabelled コーチン.
 *
 *  ══ WHAT THIS BUILDS ═══════════════════════════════════════════════════════════════════════
 *  An AMBIGUITY-PRESERVING index, restricted to the spellings the record actually joins on:
 *  for every key in scripts/histcities/*.mjs, EVERY GeoNames `cities500` settlement that
 *  answers to that exact spelling in its `name`, its `asciiname`, or any of its untagged
 *  `alternatenames` — no population sort, no dedup, no stop-words, no length floor, no curated
 *  subtraction. Whatever is genuinely ambiguous stays ambiguous, which is the property the
 *  validator needs and the only property the news locator did not want.
 *
 *  ⚠ cities500, NOT cities1000. `ofm-city`'s filter is `class in [city, town]`, which comes from
 *  OSM's `place` tag and carries no population floor at all; a 700-person `place=town` is drawn
 *  and would be relabelled. 500 is the lowest floor GeoNames publishes as a ready archive.
 *
 *  ⚠ THE FILE IS COMMITTED, so `npm run check:histcities` needs no network. It is refreshed by
 *  hand when the record gains a spelling — and scripts/build-hist-cities.mjs FAILS if the
 *  record holds a key this index does not cover, so «refreshed by hand» cannot mean «forgotten».
 *
 *      node scripts/build-histcities-homonyms.mjs          # download (cached) and rewrite
 *      node scripts/build-histcities-homonyms.mjs --check  # keys covered? (no network)
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync, gzipSync, gunzipSync } from 'node:zlib';
import { loadRecord, allKeys } from './histcities-record.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'histcities-homonyms.json.gz');
const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-histcities');
const SRC = 'https://download.geonames.org/export/dump/cities500.zip';
const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) histcities-homonyms';

const CHECK = process.argv.includes('--check');

/* ── the record's key set is this index's key set ───────────────────────────────────────────── */
const { rows } = await loadRecord();
const KEYS = allKeys(rows);

if (CHECK) {
  let idx;
  try { idx = JSON.parse(gunzipSync(readFileSync(OUT)).toString('utf8')); }
  catch (_) { die('data/histcities-homonyms.json.gz is missing — run `node scripts/build-histcities-homonyms.mjs`'); }
  const have = new Set(Object.keys(idx.keys));
  const missing = KEYS.filter((k) => !have.has(k));
  const extra = [...have].filter((k) => !KEYS.includes(k));
  if (missing.length || extra.length) {
    console.error('✖ data/histcities-homonyms.json.gz does not cover scripts/histcities/');
    for (const k of missing.slice(0, 20)) console.error(`  · «${k}» is in the record but not in the index`);
    for (const k of extra.slice(0, 20)) console.error(`  · «${k}» is in the index but no longer in the record`);
    console.error('  → node scripts/build-histcities-homonyms.mjs');
    process.exit(1);
  }
  console.log(`✓ histcities-homonyms: ${KEYS.length} spellings covered`);
  process.exit(0);
}

/* ── a minimal ZIP reader (the same one scripts/build-gazetteer.mjs uses, same archive shape) ── */
function unzipFirst(buf) {
  let eocd = -1;
  for (let p = buf.length - 22; p >= 0 && p > buf.length - 66000; p--) {
    if (buf.readUInt32LE(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('not a zip (no end-of-central-directory)');
  const cdOff = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(cdOff) !== 0x02014b50) throw new Error('bad central directory');
  const method = buf.readUInt16LE(cdOff + 10);
  const compSize = buf.readUInt32LE(cdOff + 20);
  const nameLen = buf.readUInt16LE(cdOff + 28);
  const localOff = buf.readUInt32LE(cdOff + 42);
  const name = buf.toString('utf8', cdOff + 46, cdOff + 46 + nameLen);
  if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
  const dataAt = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
  const raw = buf.subarray(dataAt, dataAt + compSize);
  return { name, text: (method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: 4e8 })).toString('utf8') };
}

async function cached(url, file) {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  const p = join(CACHE, file);
  if (existsSync(p)) return readFileSync(p);
  process.stdout.write(`downloading ${url} … `);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('GeoNames HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(p, buf);
  console.log(`${(buf.length / 1e6).toFixed(2)} MB`);
  return buf;
}

/* ── the sweep ─────────────────────────────────────────────────────────────────────────────── */
/* cities500.txt columns: 0 geonameid, 1 name, 2 asciiname, 3 alternatenames, 4 lat, 5 lon,
   6 feature class, 7 feature code, 8 country, …, 14 population. */
const want = new Set(KEYS);
const hits = new Map(KEYS.map((k) => [k, []]));

const { name: member, text } = unzipFirst(await cached(SRC, 'cities500.zip'));
console.log(`  ${member}: ${(text.length / 1e6).toFixed(1)} MB`);

let scanned = 0;
for (const line of text.split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  if (c.length < 15) continue;
  scanned++;
  const name = c[1], ascii = c[2];
  const lat = +c[4], lon = +c[5], fcode = c[7], cc = c[8], pop = +c[14] || 0;
  if (!isFinite(lat) || !isFinite(lon)) continue;
  /* WHICH field matched is part of the finding, so a reader can tell «this town is called that»
     from «GeoNames lists that among its other names». `name`/`asciiname` are what OpenMapTiles
     carries as `name`/`name:en` far more often than an alternate is. */
  const seen = new Map();
  const mark = (v, field) => {
    if (!v || !want.has(v)) return;
    const cur = seen.get(v);
    if (cur === undefined || rank(field) < rank(cur)) seen.set(v, field);
  };
  mark(name, 'name');
  mark(ascii, 'ascii');
  if (c[3]) for (const alt of c[3].split(',')) mark(alt, 'alt');
  for (const [v, field] of seen) {
    hits.get(v).push([name, cc, +lon.toFixed(4), +lat.toFixed(4), pop, fcode, field]);
  }
}
function rank(f) { return f === 'name' ? 0 : f === 'ascii' ? 1 : 2; }

/* deterministic order: the file must be byte-stable for a given GeoNames dump */
for (const arr of hits.values()) {
  arr.sort((a, b) => b[4] - a[4] || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
}

const out = {
  v: 1,
  src: 'GeoNames cities500 (CC BY 4.0, https://download.geonames.org/export/dump/) — every settlement '
    + 'answering to one of scripts/histcities/*.mjs\'s spellings, WITHOUT the population dedup, stop-word, '
    + 'length and curated filters scripts/build-gazetteer.mjs applies for the news locator',
  floor: 500,
  fields: ['name', 'cc', 'lon', 'lat', 'pop', 'fcode', 'matched'],
  keys: Object.fromEntries(KEYS.map((k) => [k, hits.get(k)])),
};
const buf = gzipSync(Buffer.from(JSON.stringify(out) + '\n', 'utf8'), { level: 9 });
writeFileSync(OUT, buf);

const withHits = KEYS.filter((k) => hits.get(k).length).length;
const total = KEYS.reduce((n, k) => n + hits.get(k).length, 0);
console.log(`  ${scanned.toLocaleString()} settlements scanned`);
console.log(`✓ wrote data/histcities-homonyms.json.gz — ${KEYS.length} spellings, `
  + `${withHits} carried by GeoNames, ${total.toLocaleString()} settlement rows, ${(buf.length / 1024).toFixed(1)} kB`);

function die(m) { console.error('✖ ' + m); process.exit(1); }
