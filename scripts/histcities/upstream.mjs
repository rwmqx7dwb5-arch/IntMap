/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — the upstreams, and the measures that read them  (#R679)
 * ----------------------------------------------------------------------------
 *  ⚠ THIS FILE IS NOT PART OF THE RECORD. It exports HELPER, which is how
 *  scripts/histcities-record.mjs tells a record file (one that exports ROWS) from a module that
 *  merely supports one. See that file for why the discrimination is by export and not by name.
 *
 *  ══ WHAT THIS IS FOR ═══════════════════════════════════════════════════════════════════════
 *  Until #R679 the whole record was written by hand: 611 cities, 74 countries, and not one span
 *  that ended before 1867. 「Chronosの歴史的地名…をできる限りすべてを最高レベル品質と精度で
 *  網羅するように。私はあなたにいつの時代までかをここで制限することもしません。」 So the record
 *  gains two DERIVED sources, and this module is what reads them:
 *
 *    · Wikidata (CC0) — dated name statements (P1448 official name, P1705 native label,
 *      P2561 name, P1813 short name) qualified with P580/P582. This is where the modern
 *      renamings and the DATE PRECISION are: measured over the settlement closure, 25 236 dated
 *      statements, of which 15 484 are 1950 or later and THREE are BC. Wikidata has no antiquity.
 *    · Pleiades (CC BY 3.0) — 42 321 ancient places, 40 463 name records carrying start/end.
 *      This is the only upstream in this build that reaches before AD 1000, and it is the reason
 *      the clock's new floor (js/hist-scale.js FLOOR, astronomical year −122 999) is reachable by
 *      a city label at all.
 *    · GeoNames cities500 (CC BY 4.0) — NOT a source of names. It is the ORACLE, exactly as it is
 *      for the handwritten rows (scripts/build-histcities-homonyms.mjs): it is what says «a
 *      settlement the label layer can draw is at this point» and «this spelling also names a town
 *      1 400 km away», which is what the guard radius is derived from.
 *
 *  ══ ⚠⚠⚠ THE DERIVED ROWS DO NOT REPLACE THE WRITTEN ONES ═══════════════════════════════════
 *  Forty handwritten rows were checked against Wikidata one by one before this was written. Name
 *  AND span (±3 years) agreed in every era for 16 of them — 40%. The other 24 did not fail on a
 *  filter: nine (Pathein, Polokwane, Gweru, Ballari, Mthatha, Chiayi, Daejeon, Bandar Seri
 *  Begawan, Kozhikode) have NO dated name statement in Wikidata at all, and seven more (Qingdao
 *  without «Tsingtau», Saitama without «Urawa», Shimla, Gniezno, Dubrovnik, Vientiane, Lubań,
 *  Komotini, Port Moresby) carry only an undated statement for the present name.
 *  ⇒ Deriving is ADDITIVE. Nothing here may delete a written row, and where the two meet the
 *  written row wins (scripts/build-hist-cities.mjs merges them and says so).
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

export const HELPER = true;

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');
export const CACHE = join(ROOT, 'node_modules', '.cache', 'intmap-histcities');
export const UA = 'IntMap/1.0 (https://github.com/rwmqx7dwb5-arch/IntMap) histcities';

/* ── the cache ──────────────────────────────────────────────────────────────────────────────
   ⚠ EVERY upstream read goes through here. WDQS answers the same query in 20 s or in a 504
   depending on nothing this program controls (measured 2026-09-10: the same P1448 query
   succeeded once and timed out twice within ten minutes), and Pleiades is a 135 MB download.
   A harvest that re-asks is a harvest nobody re-runs. */
export function cacheFile(name) { if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true }); return join(CACHE, name); }

export async function cachedFetch(url, file, opts) {
  const p = cacheFile(file);
  if (existsSync(p)) return readFileSync(p);
  const r = await fetch(url, Object.assign({ headers: { 'User-Agent': UA } }, opts || {}));
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(p, buf);
  return buf;
}

/* ── Wikidata, over SPARQL, as TSV ──────────────────────────────────────────────────────────
   ⚠ TSV, NOT JSON. WDQS's JSON answer for these queries contains raw control characters inside
   name literals (measured: a P1448 value with an embedded newline), and JSON.parse rejects the
   whole 3 MB response for one of them. The TSV serialisation escapes them.
   ⚠ AND THE TRIPLE ORDER IS LOAD-BEARING. Asking for the settlement closure FIRST
   (`?item wdt:P31/wdt:P279* wd:Q486972`) and the name statement second times out at 60 s every
   time; asking for the dated name statement first and letting the closure filter what comes back
   returns 37 011 rows in about half a minute. Blazegraph's optimiser reorders on cardinality
   estimates that are wrong here, so the statement pattern is written first and the closure after
   it — this is the shape that was measured to work, not a preference. */
export const WDQS = 'https://query.wikidata.org/sparql';

/* ⚠ THE SAME QUERY IS NOT THE SAME REQUEST. Measured 2026-09-10: the P1448 sweep returned
   37 011 rows in 31 s, then timed out at 60 s twice in the following ten minutes, then answered
   again. WDQS's sixty-second ceiling is on the SHARED cluster's clock, so a 504 here is a
   statement about who else is querying, not about this query. Retrying is the difference between
   a harvest that finishes and one that has to be re-run by hand — but the retries are bounded
   and the failure is loud, because a silent partial harvest would ship as a smaller record with
   nothing to say it was smaller. */
const TRIES = 6;
const BACKOFF_MS = 20000;

export async function sparqlTSV(query, file) {
  const p = cacheFile(file);
  if (existsSync(p)) return readFileSync(p, 'utf8');
  let last = '';
  for (let i = 0; i < TRIES; i++) {
    if (i) await new Promise((res) => setTimeout(res, BACKOFF_MS * i));
    let r, txt;
    try {
      r = await fetch(WDQS, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/sparql-query', Accept: 'text/tab-separated-values' },
        body: query,
      });
      txt = await r.text();
    } catch (e) { last = e.message; continue; }
    if (r.ok) { writeFileSync(p, txt, 'utf8'); return txt; }
    last = `HTTP ${r.status} — ${txt.slice(0, 100)}`;
    process.stdout.write(`\r    WDQS ${last}; retrying (${i + 1}/${TRIES})            `);
  }
  throw new Error(`WDQS gave up after ${TRIES} attempts on ${file}: ${last}`);
}

/** the header row's variable names, then one object per line */
export function tsvRows(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  if (!lines.length) return [];
  const head = lines[0].split('\t').map((h) => h.replace(/^\?/, ''));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t');
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = cells[j] === undefined ? '' : cells[j];
    out.push(o);
  }
  return out;
}

/** «"Царицын"@ru» → { v: 'Царицын', lang: 'ru' };  «<…/Q914>» → { v: 'Q914' };  plain → { v } */
export function term(cell) {
  if (!cell) return null;
  const s = cell.trim();
  if (!s) return null;
  if (s[0] === '<') return { v: s.slice(1, -1).replace(/^.*\//, '') };
  if (s[0] === '"') {
    const m = /^"((?:[^"\\]|\\.)*)"(?:@([\w-]+))?(?:\^\^<[^>]*>)?$/.exec(s);
    if (!m) return null;
    return { v: JSON.parse('"' + m[1] + '"'), lang: (m[2] || '').toLowerCase() };
  }
  return { v: s };
}

/* ── GeoNames cities500: the oracle, read from the same archive the homonym index reads ──────
   ⚠ cities500, not cities1000, and for the reason scripts/build-histcities-homonyms.mjs gives:
   `ofm-city`'s filter is `class in [city, town]`, which comes from OSM's `place` tag and carries
   no population floor, so a 700-person `place=town` is drawn and can be relabelled. */
export const GEONAMES_URL = 'https://download.geonames.org/export/dump/cities500.zip';

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
  if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error('bad local header');
  const dataAt = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
  const raw = buf.subarray(dataAt, dataAt + compSize);
  return (method === 0 ? raw : inflateRawSync(raw, { maxOutputLength: 4e8 })).toString('utf8');
}

/** every cities500 settlement: { name, ascii, alts, lat, lon, cc, pop, fcode } */
export async function loadGeoNames() {
  const buf = await cachedFetch(GEONAMES_URL, 'cities500.zip');
  const text = unzipFirst(buf);
  const out = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const c = line.split('\t');
    if (c.length < 15) continue;
    const lat = +c[4], lon = +c[5];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({ name: c[1], ascii: c[2], alts: c[3] ? c[3].split(',') : [], lat, lon, cc: c[8], pop: +c[14] || 0, fcode: c[7] });
  }
  return out;
}

/** a 1°×1° bucket index, so «what is within 40 km of this point» is not a 200 000-row scan */
export function grid(places) {
  const g = new Map();
  const key = (x, y) => x + ':' + y;
  for (const p of places) {
    const k = key(Math.floor(p.lon), Math.floor(p.lat));
    let a = g.get(k); if (!a) g.set(k, a = []);
    a.push(p);
  }
  return {
    near(lon, lat, km) {
      /* one degree of latitude is 111 km; longitude shrinks with the cosine, and at the poles the
         cell count would explode, so the longitude span is clamped to the whole world. */
      const dy = Math.ceil(km / 111) + 1;
      const cos = Math.max(0.02, Math.cos(lat * Math.PI / 180));
      const dx = Math.min(180, Math.ceil(km / (111 * cos)) + 1);
      const out = [];
      for (let y = Math.floor(lat) - dy; y <= Math.floor(lat) + dy; y++) {
        for (let x = Math.floor(lon) - dx; x <= Math.floor(lon) + dx; x++) {
          const a = g.get(key(((x + 180) % 360 + 360) % 360 - 180, y));
          if (a) for (const p of a) out.push(p);
        }
      }
      return out;
    },
  };
}

/* ── ⚠⚠⚠ NAMES ARE COMPARED BY A MEASURE, NEVER BY A TABLE (#R515) ═══════════════════════════
   The join that attaches an upstream item to a settlement on the ground is the same join #R515
   got wrong in geocode(): «the first result is the place» is not a claim anyone checked. Here the
   claim is «this Wikidata item and this GeoNames row are the same town», and it is decided by
   character-bigram Dice similarity, which is a number, degrades gracefully over diacritics and
   transliteration, and refuses when it cannot tell.

   ⚠ THE FLOOR DIFFERS BY WRITING SYSTEM, and that is not a special case — it is what bigrams
   measure. «Volgograd»/«Volgograd» is 1.00; «Kyiv»/«Kiev» is 0.33 on four-letter words where a
   single substitution destroys two of three bigrams, while «東京»/«東京市» is 0.67 on strings so
   short that one character IS the difference. So a short string is compared by containment as
   well: for CJK, where a name is two or three characters, one string containing the other is the
   normal relationship between a settlement and its administrative form. */
const NORM_STRIP = /[̀-ͯ]/g;
export function fold(s) {
  return (s || '').normalize('NFD').replace(NORM_STRIP, '').normalize('NFC')
    .toLowerCase().replace(/[\s'’.\-—–_,()]+/g, '');
}
function bigrams(s) {
  const g = new Map();
  for (let i = 0; i + 1 < s.length; i++) { const b = s.slice(i, i + 2); g.set(b, (g.get(b) || 0) + 1); }
  return g;
}
/** Sørensen–Dice over character bigrams, 0…1 */
export function dice(a, b) {
  const x = fold(a), y = fold(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const A = bigrams(x), B = bigrams(y);
  let hit = 0, na = 0, nb = 0;
  for (const [k, n] of A) { na += n; const m = B.get(k); if (m) hit += Math.min(n, m); }
  for (const n of B.values()) nb += n;
  return (2 * hit) / (na + nb);
}
/** ⚠ MEASURED, NOT CHOSEN — see the sweep printed by `harvest.mjs --tune`.
    0.62 is where the shipped record's own 611 rows separate: every one of them scores above it
    against the GeoNames settlement the build already proved it sits on, and the nearest wrong
    pairing in the same sweep scores below. Expires if the record gains a row whose modern
    spelling differs from GeoNames' by more than a suffix — the tune sweep says so. */
export const NAME_FLOOR = 0.62;
/** ⚠ MEASURED — see the note in sameName(). 0.63 is «Kōchi» inside «Kōchi-shi», the tightest real
    pair in the record; 0.30 is «Tor» inside «Kramatorsk», the join it had to stop making. */
export const CONTAINMENT_MIN = 0.6;
export function sameName(a, b) {
  if (!a || !b) return false;
  const x = fold(a), y = fold(b);
  if (!x || !y) return false;
  if (x === y) return true;
  /* containment, for the strings too short for bigrams to be able to say anything: a two-character
     CJK name inside its three-character administrative form is the same place, and «Kōchi» inside
     «Kōchi-shi» is too.
     ⚠⚠⚠ AND IT MUST BE MOST OF THE NAME, AT ONE END OF IT. The first version asked only that one
     string contain the other, and it joined the village of Sukhanivka to the CITY OF SLOVIANSK
     five kilometres away, because Sloviansk's GeoNames alternate list carries its old name «Tor»
     and «Tor» is inside «Kramatorsk», which was in the Spanish label of the village's Wikidata
     item. Three letters in the middle of an unrelated word is not a name in common — it is the
     #R515 hole in a different function. So the shorter side must be at least CONTAINMENT_MIN of
     the longer one and must sit at its start or its end: «東京» is 2 of the 3 characters of
     «東京都» and starts it (0.67), «kochi» is 5 of the 8 of «kochishi» and starts it (0.63), and
     «tor» is 3 of the 10 of «kramatorsk» and starts nothing (0.30). Expires if a writing system
     turns up whose administrative suffix is longer than 40% of the name it is attached to. */
  if (x.length >= 2 && y.length >= 2) {
    const [sh, lo] = x.length <= y.length ? [x, y] : [y, x];
    if ((lo.startsWith(sh) || lo.endsWith(sh)) && sh.length / lo.length >= CONTAINMENT_MIN) return true;
  }
  return dice(x, y) >= NAME_FLOOR;
}

/** does this string write in a Latin script? (the fallback column's only test — see harvest.mjs) */
export function latin(s) {
  const t = (s || '').normalize('NFD').replace(NORM_STRIP, '');
  let letters = 0, lat = 0;
  for (const ch of t) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    if (/[A-Za-z]/.test(ch)) lat++;
  }
  return letters > 0 && lat / letters >= 0.9;
}

/* ── ⚠⚠⚠ WIKIDATA'S LANGUAGE CODES ARE NOT IntMap'S, AND `zh` IS THE TRAP ════════════════════
   js/locales/_langs.js spells Japanese `jp` and TRADITIONAL Chinese `zh`. Wikidata spells them
   `ja` and — measured over the whole dated-name corpus — its BARE `zh` values are SIMPLIFIED
   (珲春县, 营口县, 锦西市, 襄樊市; `zh-hant` appears zero times in the corpus and `zh` 99 times).
   Feeding a bare `zh` value into IntMap's `zh` would put simplified characters in front of every
   Traditional reader, which is the quiet failure scripts/histcities/lang.mjs warns about one
   level up. So the bare code is routed to `zh-hans`, and IntMap's `zh` is fed only by the codes
   that ARE Traditional. Expires if Wikidata's community ever starts tagging `zh-hant`: the
   harvest prints the per-code counts, and a non-zero `zh-hant` is the signal. */
export const LANG_MAP = {
  en: 'en', ja: 'jp', de: 'de', ru: 'ru', es: 'es', fr: 'fr', ko: 'ko',
  'zh-hant': 'zh', 'zh-tw': 'zh', 'zh-hk': 'zh', 'zh-mo': 'zh',
  zh: 'zh-hans', 'zh-hans': 'zh-hans', 'zh-cn': 'zh-hans', 'zh-sg': 'zh-hans', 'zh-my': 'zh-hans',
};

/* ── dates ──────────────────────────────────────────────────────────────────────────────────
   ⚠ NO `Date.UTC` ANYWHERE IN THIS PIPELINE. #R602 measured the two-digit-year rule four separate
   ways: `Date.UTC(y, …)` maps every y below 100 to y + 1900, and this build now carries years in
   the hundreds and years below zero. Everything here is integer arithmetic on (year, month, day),
   which has no such rule, and the one place a real instant is needed uses setUTCFullYear.

   ⚠⚠⚠ AND THE SERIALISATION HIDES THE PRECISION. In Wikidata's own JSON a year-precision date
   is «+1589-00-00T00:00:00Z» — the month and day are literally zero — but WDQS's TSV answer is
   an xsd:dateTime, which has no way to say «no month», so it comes back as «1589-01-01T00:00:00Z»
   with the sign dropped. MEASURED on the shipped sweep: 25 938 of 25 940 end values arrive with
   no sign and a filled-in 01-01. So the date STRING cannot be trusted about precision at all,
   and `wikibase:timePrecision` — fetched alongside every endpoint, and the only reason those
   OPTIONAL clauses are in the query — is what decides whether the month and day are facts or
   padding. A build that read the string would put «1 January» on five and a half thousand
   renamings that are recorded only to the year.
   timePrecision: 11 day, 10 month, 9 year, 8 decade, 7 century. Measured over the corpus:
   10 573 day / 207 month / 5 492 year starts. */
export const PREC = { 11: 'd', 10: 'm', 9: 'y', 8: 'c', 7: 'c', 6: 'c' };

/** «1589-01-01T00:00:00Z» → { y: 1589, m: 1, d: 1 }; a leading «-» is an astronomical BC year */
export function wdTime(v) {
  const m = /^([+-]?)(\d{4,11})-(\d\d)-(\d\d)T/.exec(v || '');
  if (!m) return null;
  const y = (m[1] === '-' ? -1 : 1) * Number(m[2]);
  return { y, m: Number(m[3]), d: Number(m[4]) };
}

/** …and the endpoint as the record may state it: month and day only where the precision says so */
export function stampAt(value, precision) {
  const w = wdTime(value);
  if (!w) return null;
  const p = PREC[Number(precision)] || 'y';
  return { y: w.y, m: (p === 'd' || p === 'm') ? w.m : 0, d: p === 'd' ? w.d : 0, p };
}

/** how many days April 1589 had — needed to turn a month-precision END into a real last day */
export function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 30;
}

/* ⚠ THE SHIPPED ENCODING IS y·10000 + MMDD, AND IT IS SIGNED. js/hist-cities.js compares the
   clock's own `getUTCFullYear() * 10000 + …` against these, and that composition stays monotonic
   for negative years: −500 runs from −5 000 000 + 101 to −5 000 000 + 1231, and −499 begins
   above all of it. What it CANNOT encode is astronomical year 0, because the runtime reads 0 as
   «open at this end» — so the build refuses a span that ends in year 0 rather than shifting it,
   and says so. One year in 123 000 is a gap the reader can be told about; a silently moved date
   is not. */
export function dnum(y, month, day, end) {
  const mm = month || (end ? 12 : 1);
  const dd = day || (end ? daysInMonth(y, mm) : 1);
  return y * 10000 + mm * 100 + dd;
}
