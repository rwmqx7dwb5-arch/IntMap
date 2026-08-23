/* ============================================================================
 *  IntMap · WORLD RAILWAYS — the stations  (#R388)
 * ----------------------------------------------------------------------------
 *  `railway=station` and `railway=halt`, worldwide, as points with the operator,
 *  the network, the UIC reference and which modes call there. MEASURED planet-
 *  wide: 96,821 station nodes — small enough that this is ONE product file and
 *  not a shard pyramid, and it is the reason stations are fetched here instead
 *  of riding along with the 2.8 million ways in fetch.mjs.
 *
 *  ⚠ A STATION IS NOT ALWAYS A NODE. Roughly a fifth of them are mapped as the
 *    building's or the area's WAY, and asking only for nodes silently loses those
 *    — silently, because the ones you do get look like a complete answer. `out
 *    center` gives a way its centroid, so both shapes arrive as one point each.
 *
 *  ⚠ AND `railway=station` IS NOT ONLY HEAVY RAIL. A metro stop carries the same
 *    tag with `station=subway`; a tram stop is usually `railway=tram_stop`, which
 *    is a different tag and NOT collected here. The mode flags (`train`, `subway`,
 *    `light_rail`, `tram`) are what separate them, so they are kept verbatim and
 *    the layer decides — never a guess from the name.
 *
 *  Usage
 *    node scripts/rail/stations.mjs            fetch (cached) and build
 *    node scripts/rail/stations.mjs --report   build from cache, write nothing
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { post, ENDPOINTS, CACHE_DIR, classifyError, electEndpoints, worldCells } from './fetch.mjs';
import { RailSchema } from '../../js/rail-schema.js';

const { str, encodePoints } = RailSchema;
/* the property names the station file ships, in dictionary order */
const KEYS = ['n', 'h', 'o', 'w', 'k', 'tr', 'sb', 'lr', 'tm', 'u', 'q', 'y', 'r', 'ow'];
const SCALE = 100000;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'railways');
const RAW = join(CACHE_DIR, '_stations.json');
/* ⚠ ONE QUERY FOR THE PLANET IS ONE QUERY TOO BIG. The first version asked for every
   `railway=station|halt` node AND way on Earth in a single request — MEASURED, the instance refused
   it over and over while answering a 1° probe in the same minute. The count (96,821 station nodes)
   makes it sound small; the response with geometry does not. So it sweeps the same 30° grid the ways
   do, caches each cell, and is resumable for the same reason they are. */
const CELL_DEG = 30;

const KEEP = {
  a: 'railway', b: 'name', c: 'name:en', d: 'operator', e: 'network',
  f: 'station', g: 'train', h: 'subway', i: 'light_rail', j: 'tram',
  k: 'uic_ref', l: 'uic_name', m: 'wikidata', n: 'start_date', o: 'ref',
  p: 'usage', q: 'operator:wikidata',
};

function query([s0, w0, n0, e0]) {
  const bb = `(${s0.toFixed(4)},${w0.toFixed(4)},${n0.toFixed(4)},${e0.toFixed(4)})`;
  /* ⚠ FOUR EXACT MATCHES, NOT ONE REGEX. scripts/companies/osm.mjs measured what the difference is:
     a regex on a tag VALUE cannot use the tag-value index, so `["railway"~"^(station|halt)$"]`
     makes the instance scan the bbox. The same question asked as equalities uses the index.
     ⚠ AND `out tags center`, NOT a `convert` projection. The ways sweep projects its tags because
     it downloads 1.6 million of them; there are 150,000 stations, so the projection buys little —
     and `convert item ::geom=center()` is not valid Overpass at all (`center` is an aggregate over
     a set and wants an argument). `out center` gives a way its centroid and a node its own
     position, which is the one thing this file needs that `out` alone does not. */
  return '[out:json][timeout:300];('
    + ['node', 'way'].flatMap((t) => ['station', 'halt'].map((v) => `${t}["railway"="${v}"]${bb};`)).join('')
    + ');out tags center;';
}
const cellKey = (b) => 'st_' + b.map((x) => x.toFixed(0)).join('_').replace(/-/g, 'm');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchCell(box) {
  const path = join(CACHE_DIR, cellKey(box) + '.json');
  if (existsSync(path)) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (_) {} }
  const body = query(box);
  for (let attempt = 0; attempt < 14; attempt++) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    let text;
    try { text = await post(ep, body, 330000); }
    catch (e) { console.log('    ' + new URL(ep).hostname + ' ' + String(e).slice(0, 60)); await sleep(10000); continue; }
    if (classifyError(text) === 'ok') {
      let j; try { j = JSON.parse(text); } catch (_) { await sleep(10000); continue; }
      writeFileSync(path, JSON.stringify(j));
      return j;
    }
    console.log('    ' + cellKey(box) + ' ' + new URL(ep).hostname + ' busy — retry ' + (attempt + 1) + '/14');
    /* re-elect on the way, so a recovered instance rejoins and a failed one drops out */
    if (attempt % 3 === 2) { try { await electEndpoints(() => {}); } catch (_) {} }
    await sleep(Math.min(120000, 8000 * (attempt + 1)));
  }
  throw new Error('stations: cell ' + cellKey(box) + ' never answered — refusing to ship a partial world');
}

async function fetchAll() {
  if (existsSync(RAW)) { console.log('  cached ' + RAW); return JSON.parse(readFileSync(RAW, 'utf8')); }
  mkdirSync(CACHE_DIR, { recursive: true });
  /* ⚠ the same coverage gate the way sweep uses — a regional instance would answer
     this query with a tidy, complete-looking list of Swiss stations */
  await electEndpoints((m) => console.log(m));
  const cells = worldCells(CELL_DEG);
  console.log('  sweeping ' + cells.length + ' cells at ' + CELL_DEG + '°');
  const elements = [];
  let done = 0;
  for (const box of cells) {
    const j = await fetchCell(box);
    for (const el of j.elements || []) elements.push(el);
    if (++done % 6 === 0) console.log(`  ${done}/${cells.length} cells · ${elements.length} elements`);
  }
  const merged = { elements };
  writeFileSync(RAW, JSON.stringify(merged));
  return merged;
}

const s = str;
const yes = (v) => (v === 'yes' ? 1 : undefined);

function build(j) {
  const feats = [];
  const seen = new Set();
  for (const el of j.elements || []) {
    /* a node carries its own position; a way carries the centroid `out center` computed for it */
    const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    if (lon == null || lat == null) continue;
    const raw = el.tags || {};
    /* the one-letter names the rest of this file reads, mapped from the real tags */
    const t = {};
    for (const [k, tag] of Object.entries(KEEP)) t[k] = raw[tag];
    const key = el.type + el.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = s(t.b) || s(t.c);
    if (!name) continue;   /* an unnamed station is a dot you cannot ask about */
    const p = {
      n: name, h: t.a === 'halt' ? 1 : undefined,
      o: s(t.d) || undefined, w: s(t.e) || undefined, k: s(t.f) || undefined,
      tr: yes(t.g), sb: yes(t.h), lr: yes(t.i), tm: yes(t.j),
      u: s(t.k) || undefined, q: s(t.m) || undefined,
      y: (() => { const m = /(\d{4})/.exec(s(t.n) || ''); return m ? Number(m[1]) : undefined; })(),
      r: s(t.o) || undefined, ow: s(t.q) || undefined, i: el.id,
    };
    for (const kk of Object.keys(p)) if (p[kk] === undefined) delete p[kk];
    /* ⚠ the OSM id rides beside the dictionary index, never inside the tuple — a value that is
       unique per row would make every tuple distinct (js/rail-schema.js) */
    feats.push({ pt: [lon, lat], props: p });
  }
  return feats;
}

/* ⚠ THE SAME 5° GRID THE LINES USE. One world file for the stations MEASURED 4.08 MB gz, which a
   reader would pay in full the first time they crossed z8 — beside a line layer that had just been
   built to fetch 40 kB for the same view. Two schemes for the same map is one scheme too many. */
const CELL = 5;
const cellOf = (lon, lat) => `${Math.floor(lat / CELL) * CELL}_${Math.floor(lon / CELL) * CELL}`.replace(/-/g, 'm');

async function main() {
  const report = process.argv.includes('--report');
  const j = await fetchAll();
  console.log('  elements ' + (j.elements || []).length);
  const feats = build(j);

  const cells = new Map();
  for (const f of feats) {
    const k = cellOf(f.pt[0], f.pt[1]);
    let a = cells.get(k); if (!a) { a = []; cells.set(k, a); }
    a.push(f);
  }
  const index = { cell: CELL, cells: {} };
  const payloads = [];
  let raw = 0, gzTotal = 0;
  for (const [k, arr] of cells) {
    const json = JSON.stringify(encodePoints(arr, KEYS, SCALE, 'i'));
    const gz = gzipSync(Buffer.from(json), { level: 9 });
    raw += json.length; gzTotal += gz.length;
    index.cells[k] = gz.length;
    payloads.push([k, gz]);
  }
  const big = payloads.map(([k, g]) => g.length).sort((a, b) => b - a)[0] || 0;
  console.log(`  stations ${feats.length} in ${cells.size} cells · ${(raw / 1e6).toFixed(2)} MB raw · ${(gzTotal / 1e6).toFixed(2)} MB gz · largest cell ${(big / 1024).toFixed(0)} kB`);
  if (report) { console.log('  --report: nothing written'); return; }
  rmSync(join(OUT, 'st'), { recursive: true, force: true });
  mkdirSync(join(OUT, 'st'), { recursive: true });
  for (const [k, gz] of payloads) writeFileSync(join(OUT, 'st', k + '.json.gz'), gz);
  writeFileSync(join(OUT, 'st-index.json'), JSON.stringify(index));
  console.log('  wrote ' + join(OUT, 'st') + ' (' + payloads.length + ' cells) + st-index.json');
}

main();
