#!/usr/bin/env node
/* Historical urban populations — Reba, Reitsma & Seto (2016), «Spatializing 6,000 years of global
 * urbanization from 3700 BC to AD 2000», Scientific Data 3:160034, doi:10.1038/sdata.2016.34.
 * Three CSVs (CC BY 4.0) geocode the tables of two books: Tertius Chandler, «Four Thousand Years of
 * Urban Growth» (2250 BC – AD 1975) and George Modelski, «World Cities: −3000 to 2000».
 *
 * WHAT THIS BUNDLE STATES, AND WHAT IT REFUSES TO STATE
 *   · every population figure exactly as the source table states it, with WHICH table and WHICH year;
 *   · never a value between two dated figures (no interpolation, no smoothing, no rounding);
 *   · the geocoders' own location-certainty rank (1 = confirmed by three geocoders … 3 = least sure);
 *   · how long a figure may be shown after the year it was stated: a window derived from the record's
 *     own sampling cadence (`windowFor` below), so a city the books stop listing stops being drawn.
 *
 * Offline build/check: node scripts/build-hist-urban.mjs [--check]
 * Re-read the upstream (network; verifies figshare's md5 and the pinned sha256):
 *   node scripts/build-hist-urban.mjs --harvest --as-of YYYY-MM-DD
 * --as-of is the day the upstream was read, not today's build date.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { REBA_URBAN } from './lib/upstream-cadence.mjs';
import { norm } from '../js/hist-urban.js';   /* one comparison form for the builder and every reader */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = path.join(ROOT, 'scripts/histurban/reba-record.json');
const OUTPUT = path.join(ROOT, 'data/hist-urban.json');

/* ⚠ (upstream-liveness) A PLAIN LITERAL so check:datagov can read it without running this file. */
const SOURCE_FIELDS = {
  publisher: 'Reba, Reitsma & Seto (2016), Scientific Data',
  title: 'Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000',
  citation: 'Reba, M., Reitsma, F. & Seto, K. C. Spatializing 6,000 years of global urbanization from 3700 BC to AD 2000. Sci. Data 3, 160034 (2016). doi:10.1038/sdata.2016.34',
  url: 'https://doi.org/10.1038/sdata.2016.34',
  licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
};
export const SOURCE = Object.freeze(SOURCE_FIELDS);

/* The three tables. `file` is figshare's file id; figshare's own download host answers scripts with a
   bot challenge (HTTP 202, measured 2026-10-04), so the bytes are read from the storage URL the
   article's file record names, and BOTH figshare's md5 and our sha256 must match.
   Version 2 of each file is the publisher's correction (trailing spaces in names; Magdeburg; Kiev →
   Ukraine; one spelling of Istanbul), published in the same article version as the first file. */
export const TABLES = Object.freeze([
  { key: 'chandler', label: 'Chandler', book: 'T. Chandler, Four Thousand Years of Urban Growth: An Historical Census (1987)',
    doi: '10.6084/m9.figshare.2059494.v3', file: 5407640, name: 'chandlerV2.csv',
    md5: 'aeff29534fb11c4f320cd79fbcba9c8b', sha256: '5b8df64e46988b216988eef18b46ebc2cba57ecc1adc8a5c2e1e6d5b78068031',
    /* the inclusion rule, as the paper reports it (so absence is read as «not listed», never «did not exist») */
    threshold: ['Listed only above a size threshold: over 20,000 inhabitants from AD 800 to 1850 (over 40,000 for Asian cities), over 40,000 after 1850.',
      '一定規模以上の都市だけを収録: 800〜1850年は人口2万人超（アジアの都市は4万人超）、1850年以降は4万人超。'] },
  { key: 'modelskiAncient', label: 'Modelski', book: 'G. Modelski, World Cities: −3000 to 2000 (2003)',
    doi: '10.6084/m9.figshare.2059497.v2', file: 5356132, name: 'modelskiAncientV2.csv',
    md5: 'f5757dbeeeacb6dc33c26522866eff57', sha256: '71beafaacbdeb8d8fc156951521e9a14e20d6704b0d77be5528511c52fad3e1d',
    threshold: ['Listed only above a size threshold: 10,000 inhabitants (3500–1000 BC), 100,000 (1000 BC – AD 1000).',
      '一定規模以上の都市だけを収録: 紀元前3500〜1000年は1万人以上、紀元前1000年〜紀元1000年は10万人以上。'] },
  { key: 'modelskiModern', label: 'Modelski', book: 'G. Modelski, World Cities: −3000 to 2000 (2003)',
    doi: '10.6084/m9.figshare.2059500.v3', file: 5407637, name: 'modelskiModernV2.csv',
    md5: '9d996673d8c46d4d66abb00dc103478a', sha256: '927ee6a9122be6aded1a2f71ff5bb6f36312aae6a778574af47f4e8c65265726',
    threshold: ['Listed only above a size threshold: 1,000,000 inhabitants (AD 2000).',
      '一定規模以上の都市だけを収録: 2000年は人口100万人以上。'] },
]);
const storageUrl = t => 'https://s3-eu-west-1.amazonaws.com/pfigshare-u-files/' + t.file + '/' + t.name;

/* ⚠ (#729) provenance as values, read by js/data-governance.js; every field is SOURCE read, not re-typed. */
export const GOVERNANCE = {
  'data/hist-urban.json': {
    publisher: SOURCE_FIELDS.publisher,
    url: SOURCE_FIELDS.url,
    licence: SOURCE_FIELDS.licence,
    licenceUrl: SOURCE_FIELDS.licenceUrl,
    /* CC BY 4.0: credit is a condition */
    attribution: true,
    paidBy: 'Reba, Reitsma & Seto (2016) — historical urban populations, 3700 BC – AD 2000 (CC BY 4.0)',
    ...REBA_URBAN,
    builtBy: 'scripts/build-hist-urban.mjs',
    /* ⚠ LITERALS THE GATE CAN READ WITHOUT RUNNING THIS FILE, and compile() REFUSES to write a bundle that disagrees
       with them: the day the upstream was read (the committed record's asOf), the last year any table states, the
       shape, and the counts measured on the bundle (rows = cities, missing = table rows stating no figure — Modelski's
       Sippar —, outOfRange = figures that are not a whole non-negative count, duplicates = a city stating one year
       twice in one table). A re-harvest that changes them fails until they are restated here. */
    retrievedAt: '2026-10-04',
    /* the bytes are deterministic from the committed record, so they were written the day it was read — one date for both,
       a property of the pin (the convention of scripts/build-ne-countries.mjs PINNED_AT); a re-harvest moves both */
    generatedAt: '2026-10-04',
    asOf: '2000',
    schema: 'cities[{ id, n, lon, lat, r: [{ t (table index), n, o, c, q (location certainty 1–3), lat, lon }], f: [[year (astronomical), population, row index]], same?, pl?, hc? }]; window{year → years}; span{from, to}',
    quality: { rows: 1738, missing: 1, outOfRange: 0, duplicates: 0 },
  },
};

/* ── reading a table ─────────────────────────────────────────────────────────────────────────── */
/* RFC 4180 with the quoting these files use. The bytes are Windows-1252 (three bytes 0x80–0x9F in
   chandlerV2.csv, measured 2026-10-04; the rest is Latin-1 compatible), decoded by the platform. */
export function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1);
}
const META = ['City', 'OtherName', 'Country', 'Latitude', 'Longitude', 'Certainty'];
/* a column header is the year the figure is stated for: BC_n / AD_n → the astronomical year
   (1 BC = 0, n BC = 1 − n), the axis js/hist-scale.js `fromEra` and the clock use */
export function columnYear(h) {
  const m = /^(BC|AD)_(\d+)$/.exec(h);
  if (!m) throw new Error('Unreadable year column: ' + h);
  const n = Number(m[2]);
  return m[1] === 'BC' ? 1 - n : n;
}

/* One table → the record's verbatim form: every non-empty cell, as the string the file holds. */
export function tableRecord(table, bytes) {
  const text = new TextDecoder('windows-1252').decode(bytes);
  const rows = parseCsv(text);
  const head = rows[0];
  if (JSON.stringify(head.slice(0, 6)) !== JSON.stringify(META)) throw new Error(table.name + ': unexpected header ' + head.slice(0, 6));
  head.slice(6).forEach(columnYear);
  return { key: table.key, header: head.slice(6), rows: rows.slice(1).map(r => {
    if (r.length !== head.length) throw new Error(table.name + ': row width ' + r.length + ' ≠ ' + head.length);
    return [r.slice(0, 6), r.slice(6).map((v, i) => [i, v]).filter(([, v]) => v.trim() !== '')];
  }) };
}

/* ── identity ────────────────────────────────────────────────────────────────────────────────── */
const otherNames = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const decimals = s => { const m = /\.(\d+)$/.exec(String(s).trim()); return m ? m[1].length : 0; };
/* Two coordinates are the same point when they agree at the precision the LESS precise of the two
   states — neither file claims a digit the other lacks. */
function samePoint(a, b) {
  for (const k of ['lat', 'lon']) {
    const d = Math.min(decimals(a[k + 'Raw']), decimals(b[k + 'Raw']));
    if (Number(a[k]).toFixed(d) !== Number(b[k]).toFixed(d)) return false;
  }
  return true;
}
/* Two rows of DIFFERENT tables describe one city when they name it alike (a name of one is the name,
   or one of the other names, of the other) AND stand on the same point. Rows of one table are never
   merged: the table listed them separately (Chandler's two Gwaliors — Gwalior and Lashkar). */
/* ⚠ The City cell itself can hold more than one name (Modelski's «Kanauji, Kanauj»), so a row's own
   names are its City cell split like OtherName. */
const ownNames = r => otherNames(r.name);
function sameCity(a, b) {
  if (a.table === b.table || !samePoint(a, b)) return false;
  const an = new Set([...ownNames(a), ...a.others].map(norm)), bn = new Set([...ownNames(b), ...b.others].map(norm));
  return ownNames(b).some(n => an.has(norm(n))) || ownNames(a).some(n => bn.has(norm(n)));
}

/* ── the window ──────────────────────────────────────────────────────────────────────────────── */
/* The books state a city at dated columns; between two statements of the same city the record says
   nothing new, and after its last one the city is no longer listed. How long a figure stated for year
   y may stand is read off the record itself, in two steps, both medians of gaps the record contains:
     1. S(y) — the record's silence at y: over every city the record follows across y, the length of its
        gap between consecutive statements that contains y;
     2. window(y) — the record's time to restatement around y: over EVERY statement made in [y − S(y), y],
        the gap to that city's next statement.
   So a figure stands about as long as the record, at that time, takes to state a city again — 100 years
   where the books survey every century, 25 where every quarter-century — and a city the next survey
   omits stops being drawn. The lower median is taken, so a window is always a gap the record contains.
   ⚠ Neither single step alone, measured 2026-10-04: the time to restatement of the cities stated in y
   ALONE is a sample of a handful where few are stated (AD 630: ten cities from one traveller's account,
   median 896 years — Aksu's 630 figure was still drawn in 1250); the silence S(y) alone is length-biased
   where the record is sparse (AD 361: 439 years; pooled as below, 100).
   ⚠ observation: the gaps measured 2026-10-04 (dev-notes/2026-10-04-hist-urban-population.md);
   ⚠ expiry: recomputed on every build from the record — it changes only if the record does;
   ⚠ canonical: this function; js/hist-urban.js reads the result from data/hist-urban.json. */
export function windows(cities) {
  const gaps = [];
  for (const c of cities) {
    const ys = [...new Set(c.f.map(f => f[0]))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) gaps.push([ys[i - 1], ys[i]]);
  }
  gaps.sort((p, q) => p[0] - q[0]);
  const median = xs => { xs.sort((a, b) => a - b); return xs[Math.floor((xs.length - 1) / 2)]; };
  const stated = [...new Set(cities.flatMap(c => c.f.map(f => f[0])))].sort((a, b) => a - b);
  const out = {};
  for (const y of stated) {
    const silence = [];
    for (const [a, b] of gaps) { if (a > y) break; if (b >= y) silence.push(b - a); }
    if (!silence.length) continue;
    const S = median(silence), pooled = [];
    for (const [a, b] of gaps) { if (a > y) break; if (a >= y - S) pooled.push(b - a); }
    out[y] = pooled.length ? median(pooled) : S;
  }
  return out;
}

/* ── linking to the other two settlement records ─────────────────────────────────────────────── */
/* A city of this record IS a place of another record when each is the other's nearest neighbour
   AND they answer to a common name. No distance is typed: mutual nearness says no other place of
   either record stands between them, and the name says they are the same kind of claim. */
const km = (a, b) => {
  const r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};
/* nearest neighbour through 1° latitude bands: on the sphere the great-circle distance is never less
   than the latitude difference (× 6371 km × π/180), so bands are searched outward from the point's own
   and the search stops once a band's latitude gap alone exceeds the best distance found. The answer is
   exactly the brute-force one (tests/hist-urban-population-checks.test.mjs holds the two equal) — the
   band width is only speed. */
const KM_PER_DEG = 12742 / 2 * Math.PI / 180;
function index(points) {
  const bands = new Map();
  for (const q of points) {
    const b = Math.floor(q.lat);
    if (!bands.has(b)) bands.set(b, []);
    bands.get(b).push(q);
  }
  return bands;
}
export function nearest(points, p, bands = index(points)) {
  let best = null, d = Infinity;
  const b0 = Math.floor(p.lat);
  for (let s = 0; s <= 181; s++) {
    for (const b of s ? [b0 - s, b0 + s] : [b0]) {
      /* the nearest latitude any point of band b can have, from p */
      const gap = b > b0 ? b - p.lat : b < b0 ? p.lat - (b + 1) : 0;
      if (gap * KM_PER_DEG > d) continue;
      for (const q of bands.get(b) || []) { const k = km(p, q); if (k < d) { d = k; best = q; } }
    }
    if ((s - 1) * KM_PER_DEG > d) break;
  }
  return best;
}
export function links(cities, places) {
  const out = new Map(), pc = index(places), cc = index(cities);
  for (const c of cities) {
    const q = nearest(places, c, pc);
    if (!q || nearest(cities, q, cc) !== c) continue;
    const mine = new Set(c.names.map(norm));
    if (q.names.some(n => mine.has(norm(n)))) out.set(c.id, q.id);
  }
  return out;
}

/* ── compile ─────────────────────────────────────────────────────────────────────────────────── */
export function compile(record, others = { places: [], cities: [] }) {
  if (JSON.stringify(record.source) !== JSON.stringify(SOURCE)) throw new Error('Source declaration drift');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.asOf || '')) throw new Error('Source read date missing');
  const rows = [];
  let silent = 0;   /* table rows that state no figure at all — counted, not drawn */
  for (const t of record.tables) {
    const ti = TABLES.findIndex(x => x.key === t.key);
    if (ti < 0) throw new Error('Unknown table ' + t.key);
    const years = t.header.map(columnYear);
    for (const [meta, cells] of t.rows) {
      const [name, other, country, lat, lon, certainty] = meta;
      if (!/^[123]$/.test(certainty.trim())) throw new Error('Certainty outside 1–3: ' + name);
      const figs = cells.map(([i, v]) => {
        if (!/^\d+$/.test(v.trim())) throw new Error('Not a stated count: ' + name + ' ' + t.header[i] + '=' + v);
        return [years[i], Number(v.trim())];
      });
      if (!figs.length) { silent++; continue; }   /* a row that states no figure (Modelski's Sippar) draws nothing */
      if (!(Math.abs(+lat) <= 90 && Math.abs(+lon) <= 180) || lat.trim() === '' || lon.trim() === '') throw new Error('Bad point: ' + name);
      rows.push({ table: ti, name: name.trim(), others: otherNames(other), country: country.trim(),
        lat: Number(lat), lon: Number(lon), latRaw: lat.trim(), lonRaw: lon.trim(), q: Number(certainty), figs });
    }
  }
  /* union of rows that describe one city */
  const parent = rows.map((_, i) => i), find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
  /* two points equal at any stated precision differ by less than 1° — only neighbouring whole degrees
     of latitude can hold a pair (speed only; the pairs compared are a superset of the equal ones) */
  const byDeg = new Map();
  rows.forEach((r, i) => { const b = Math.floor(r.lat); if (!byDeg.has(b)) byDeg.set(b, []); byDeg.get(b).push(i); });
  for (const [b, here] of byDeg) {
    const near = [...here, ...(byDeg.get(b + 1) || [])];
    for (const i of here) for (const j of near) if (j > i || (j < i && !here.includes(j)))
      if (sameCity(rows[i], rows[j])) parent[find(Math.max(i, j))] = find(Math.min(i, j));
  }
  const groups = new Map();
  rows.forEach((r, i) => { const g = find(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); });

  const cities = [...groups.values()].map(g => {
    g.sort((a, b) => a.table - b.table);
    const first = g[0];
    const id = 'hu-' + createHash('sha256').update([first.name, first.country, first.latRaw, first.lonRaw].join('|')).digest('hex').slice(0, 10);
    const f = g.flatMap((r, ri) => r.figs.map(([y, p]) => [y, p, ri])).sort((a, b) => a[0] - b[0] || a[2] - b[2]);
    return { id, n: first.name, lon: first.lon, lat: first.lat,
      r: g.map(r => ({ t: r.table, n: r.name, o: r.others, c: r.country, q: r.q, lat: r.lat, lon: r.lon })), f };
  }).sort((a, b) => a.n.localeCompare(b.n, 'en') || a.lat - b.lat || a.lon - b.lon);
  const ids = new Set(cities.map(c => c.id));
  if (ids.size !== cities.length) throw new Error('City identity collision');

  /* two DIFFERENT cities on exactly the same point: the geocode of one may be the other's (modern) place */
  const byPoint = new Map();
  for (const c of cities) for (const r of c.r) {
    const k = r.lat + ',' + r.lon;
    if (!byPoint.has(k)) byPoint.set(k, new Set());
    byPoint.get(k).add(c.id);
  }
  for (const c of cities) {
    const shared = new Set();
    for (const r of c.r) for (const id of byPoint.get(r.lat + ',' + r.lon)) if (id !== c.id) shared.add(id);
    if (shared.size) c.same = [...shared].sort();
  }

  const named = cities.map(c => ({ id: c.id, lat: c.lat, lon: c.lon, names: c.r.flatMap(r => [...otherNames(r.n), ...r.o]) }));
  const pl = links(named, others.places), hc = links(named, others.cities);
  for (const c of cities) {
    if (pl.has(c.id)) c.pl = pl.get(c.id);
    if (hc.has(c.id)) c.hc = hc.get(c.id);
  }
  const window = windows(cities);
  /* the years the record can answer for: its first statement, and the last year a figure is still inside
     its window (T < y + window[y]) — what js/layer-time-decl.js cites for the layer's range */
  const years = Object.keys(window).map(Number);
  const span = { from: Math.min(...years), to: Math.max(...years.map(y => y + window[y] - 1)) };
  /* (#729) provenance as VALUES in the bytes, read by js/data-governance.js: the same declaration as GOVERNANCE, so a
     reader holding only this file knows whose it is and on what terms. retrievedAt is the day the upstream was READ
     (the record's date, not the build's — the bundle stays byte-for-byte reproducible); asOf is what the data is ABOUT,
     the last year any table states. quality is measured here: rows = cities, missing = table rows stating no figure,
     outOfRange = figures that are not a whole non-negative count (refused above, so 0 by construction — still
     measured), duplicates = a city stating the same year twice in one table. */
  const G = GOVERNANCE['data/hist-urban.json'];
  const lastStated = Math.max(...years);
  const dup = cities.reduce((n, c) => n + c.f.length - new Set(c.f.map(f => f[0] + '|' + c.r[f[2]].t)).size, 0);
  const bad = cities.reduce((n, c) => n + c.f.filter(f => !(Number.isInteger(f[1]) && f[1] >= 0)).length, 0);
  const quality = { rows: cities.length, missing: silent, outOfRange: bad, duplicates: dup };
  if (record.asOf !== G.retrievedAt || G.generatedAt !== G.retrievedAt || String(lastStated) !== G.asOf || JSON.stringify(quality) !== JSON.stringify(G.quality))
    throw new Error('GOVERNANCE no longer describes the bundle: read ' + record.asOf + ', last year ' + lastStated + ', quality ' + JSON.stringify(quality) + ' — restate them in GOVERNANCE');
  return { v: 1, source: record.source, asOf: G.asOf, retrievedAt: G.retrievedAt, generatedAt: G.generatedAt,
    publisher: G.publisher, url: G.url, licence: G.licence, licenceUrl: G.licenceUrl, attribution: G.attribution,
    paidBy: G.paidBy, builtBy: G.builtBy, cadence: G.cadence,
    schema: G.schema, quality,
    yearAxis: 'astronomical', span,
    tables: TABLES.map(t => ({ key: t.key, label: t.label, book: t.book, doi: t.doi, threshold: t.threshold })),
    window, cities };
}

/* the other two records, reduced to what identity needs */
function otherRecords() {
  const hp = JSON.parse(readFileSync(path.join(ROOT, 'data/hist-places.json'), 'utf8'));
  const hc = JSON.parse(readFileSync(path.join(ROOT, 'data/hist-cities.json'), 'utf8'));
  return {
    places: hp.places.map(p => ({ id: p.id, lat: p.lat, lon: p.lon,
      names: [p.title, ...p.names.flatMap(n => [n.r, n.a])].filter(Boolean).flatMap(s => s.split(',')).map(s => s.trim()).filter(Boolean) })),
    cities: hc.cities.map(c => ({ id: c.id, lat: c.lat, lon: c.lon,
      names: [...(c.k || []), ...c.e.flatMap(e => Object.values(e.n || {}))].filter(Boolean) })),
  };
}

async function harvest(asOf) {
  const tables = [];
  for (const t of TABLES) {
    const res = await fetch(storageUrl(t));
    if (!res.ok) throw new Error(t.name + ': HTTP ' + res.status);
    const bytes = Buffer.from(await res.arrayBuffer());
    const md5 = createHash('md5').update(bytes).digest('hex'), sha256 = createHash('sha256').update(bytes).digest('hex');
    if (md5 !== t.md5) throw new Error(t.name + ': md5 ' + md5 + ' is not figshare\'s ' + t.md5);
    if (sha256 !== t.sha256) throw new Error(t.name + ': sha256 ' + sha256 + ' is not the pinned ' + t.sha256);
    tables.push(tableRecord(t, bytes));
  }
  return { v: 1, source: SOURCE, asOf,
    harvest: TABLES.map(t => ({ key: t.key, doi: t.doi, url: storageUrl(t), md5: t.md5, sha256: t.sha256 })), tables };
}

export async function main(args = process.argv.slice(2)) {
  const arg = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
  if (args.includes('--harvest')) {
    const asOf = arg('--as-of');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf || '')) throw new Error('--harvest requires --as-of YYYY-MM-DD');
    mkdirSync(path.dirname(RECORD), { recursive: true });
    writeFileSync(RECORD, JSON.stringify(await harvest(asOf)) + '\n');
  }
  const record = JSON.parse(readFileSync(RECORD, 'utf8'));
  const data = compile(record, otherRecords()), text = JSON.stringify(data) + '\n';
  if (args.includes('--check')) {
    if (readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error('hist-urban bundle differs from the licensed source record');
  } else writeFileSync(OUTPUT, text);
  const figs = data.cities.reduce((n, c) => n + c.f.length, 0);
  console.log(`hist-urban: ${data.cities.length} cities, ${figs} dated figures; ${Buffer.byteLength(text)} bytes`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exit(1); });
