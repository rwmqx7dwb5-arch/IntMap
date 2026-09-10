#!/usr/bin/env node
/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — the harvest that writes the derived record  (#R679)
 * ----------------------------------------------------------------------------
 *  ⚠ NOT A RECORD FILE (it exports HELPER, not ROWS). It WRITES two record files:
 *      scripts/histcities/derived-wikidata.mjs   — the modern renamings, with date precision
 *      scripts/histcities/derived-pleiades.mjs   — antiquity
 *  which scripts/build-hist-cities.mjs then reads exactly like the eleven handwritten ones.
 *
 *      node scripts/histcities/harvest.mjs           # download (cached) and rewrite both
 *      node scripts/histcities/harvest.mjs --tune    # print the sweeps the thresholds come from
 *
 *  ══ ⚠⚠⚠ WHY THE HARVEST IS COMMITTED SOURCE AND NOT A BUILD STEP ═══════════════════════════
 *  `npm run check:histcities` re-derives data/hist-cities.json from the record and compares it
 *  byte for byte. That gate must run on a CI machine with no network and must give the same
 *  answer twice, so a build step that asks Wikidata what it thinks today cannot be inside it.
 *  The same reasoning already governs data/histcities-homonyms.json.gz, which is a COMMITTED
 *  snapshot of GeoNames refreshed by hand. These two files are the same kind of object: an
 *  upstream, frozen, readable, and re-derivable by one command.
 *
 *  ══ ⚠⚠⚠ AND WHY THE PROOF MOVES WITH THEM ══════════════════════════════════════════════════
 *  A handwritten row proves ①its coordinate and ②its guard radius against
 *  data/histcities-homonyms.json.gz at BUILD time. A derived row cannot: that index covers only
 *  the spellings the handwritten record joins on, and the derived rows bring thousands more.
 *  So each derived row CARRIES ITS OWN EVIDENCE — the settlement the coordinate resolved to, and
 *  the nearest settlement on Earth that answers to one of its spellings under its own name — and
 *  scripts/build-hist-cities.mjs runs THE SAME ARITHMETIC over that evidence that it runs over
 *  the index for a handwritten row (guardFrom(), scripts/histcities-record.mjs). The guard is
 *  still derived and still cannot be typed; what changed is WHERE the oracle's answer is stored.
 *  ⚠ The staleness class is unchanged: both are snapshots of the same GeoNames archive, and both
 *  go stale the same way, on the same command.
 *  ⚠ DERIVED ROWS ARE HELD TO A STRICTER RULE THAN WRITTEN ONES in one respect: a namesake that
 *  answers only through GeoNames' alternate list can be WAIVED by a handwritten row, because a
 *  human wrote a sentence saying why no tile carries that spelling. Nobody can write that
 *  sentence for eight thousand rows, so here an alternate-list namesake narrows the guard exactly
 *  like an own-name one, and a key that cannot clear the floor is dropped.
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { join } from 'node:path';
import {
  ROOT, cacheFile, cachedFetch, sparqlTSV, tsvRows, term, loadGeoNames, grid,
  sameName, fold, latin, LANG_MAP, stampAt, daysInMonth, UA,
} from './upstream.mjs';
import { km, guardFrom, GUARD_FLOOR_KM, ANCHOR_TOL_KM, SAME_PLACE_KM } from '../histcities-record.mjs';
import { LIC } from './lang.mjs';

export const HELPER = true;

/* ══ ⚠⚠⚠ (#R689) WHAT EACH UPSTREAM COSTS, DECLARED WHERE IT IS HARVESTED ═══════════════════
   These travel into the generated record files, and scripts/build-hist-cities.mjs refuses to
   write data/hist-cities.json unless every one of them that owes attribution is paid by a row of
   js/reference-data.js's DATA_SOURCES. `source` is that row's `n` string, compared as a value.
   ⚠ THE PLEIADES READING IS PER RECORD AND THAT IS WHY THE HARVEST FILTERS. Measured 2026-09-10
   over places-latest: 26 971 places state CC BY 3.0 «The Contributors», 15 348 the same text with
   «The Creators», and exactly one is CC BY-SA 3.0 (Ancient World Mapping Center) — which is why
   §5 keeps only plain CC BY and counts the rest. The declaration below can say «CC BY 3.0»
   because the harvest has already made it true of what ships. */
const WD_LICENCE = LIC({
  publisher: 'Wikidata',
  licence: 'CC0 1.0 Universal',
  url: 'https://www.wikidata.org/wiki/Wikidata:Licensing',
  attribution: false,
  read: '2026-09-10',
});
/* ⚠ OHM IS CC0 AND THE HARVEST MAKES THAT TRUE OF WHAT SHIPS: 41,300 of the 122,939 place
   nodes (33.6%) carry a per-element `license` tag that is NOT CC0 — 39,398 CC-BY-4.0 (one French
   import) and 1,803 ODbL — and §5b leaves every one of them out. So no credit is owed. The map
   already carries an OpenHistoricalMap row on the Sources page for the borders and the
   subdivisions it draws (#R518, #R530); this adds the settlement names to what that row covers. */
const OHM_LICENCE = LIC({
  publisher: 'OpenHistoricalMap contributors',
  licence: 'CC0 1.0 Universal',
  url: 'https://www.openhistoricalmap.org/copyright',
  attribution: false,
  read: '2026-09-11',
});
const PL_LICENCE = LIC({
  publisher: 'Pleiades (pleiades.stoa.org) and its contributors',
  licence: 'CC BY 3.0',
  url: 'https://pleiades.stoa.org/credits',
  attribution: true,
  source: 'Pleiades — a gazetteer of past places (CC BY 3.0)',
  read: '2026-09-11',
});

const TUNE = process.argv.includes('--tune');
const ONLY = process.argv.includes('--wikidata') ? 'wd'
  : process.argv.includes('--pleiades') ? 'pl'
  : process.argv.includes('--ohm') ? 'ohm' : null;
const TODAY = new Date().toISOString().slice(0, 10);

/* the nine, in the order data/hist-cities.json's `langs` gives them — the attestation bitmask's
   bit order is this array's index, and scripts/histcities/lang.mjs holds the same list. */
const LANGS = ['en', 'jp', 'de', 'ru', 'es', 'zh', 'zh-hans', 'fr', 'ko'];

/* ⚠ THE PRESENT, FOR THE ONE QUESTION THAT NEEDS IT: «is this name the city's name now?»
   A name that has not ended is the label the vector tile already carries, so it is never an era.
   Nothing else in this file compares against the current year. */
const NOW_Y = new Date().getUTCFullYear();



/* ═══ 1. THE ORACLE ═══════════════════════════════════════════════════════════════════════ */
let GEO = null, GRID = null;
async function oracle() {
  if (GEO) return;
  GEO = await loadGeoNames();
  GRID = grid(GEO);
  console.log(`  GeoNames cities500: ${GEO.length.toLocaleString('en-US')} settlements`);
}

/** the settlement within ANCHOR_TOL_KM that best answers to one of `names`
 *  ⚠⚠⚠ ANSWERING UNDER ITS OWN NAME BEATS ANSWERING THROUGH THE ALTERNATE LIST, AND NEARER BEATS
 *  BIGGER. This used to take the most populous settlement that matched anything at all, and that
 *  is how the village of Sukhanivka (1.3 km, 1 325 people, matching on its own name) lost to the
 *  city of Sloviansk (5.7 km, 105 141 people, matching through an alternate) — which would have
 *  relabelled a city of a hundred thousand with a village's former name for a century of the
 *  clock. Population answers «which of these places matters most»; the question here is «which of
 *  these places IS this», and the answers to that are the name it goes by and how far away it is.
 *  ⚠ THE HANDWRITTEN PATH IN scripts/build-hist-cities.mjs STILL RANKS BY POPULATION, on purpose:
 *  there the coordinate was typed by a person and GeoNames files a city and its administrative
 *  seat as separate rows, so the biggest row under the row's own spelling is the city meant. Here
 *  the coordinate IS the upstream's own point for the thing being described. */
function anchorFor(lon, lat, names) {
  let best = null;
  for (const p of GRID.near(lon, lat, ANCHOR_TOL_KM)) {
    const d = km(lon, lat, p.lon, p.lat);
    if (d > ANCHOR_TOL_KM) continue;
    let own = false, alt = false;
    for (const n of names) {
      if (!n) continue;
      if (sameName(p.name, n) || sameName(p.ascii, n)) { own = true; break; }
      if (!alt && p.alts.some((a) => sameName(a, n))) alt = true;
    }
    if (!own && !alt) continue;
    const score = [own ? 0 : 1, d, -p.pop];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1]
      || (score[1] === best.score[1] && score[2] < best.score[2])))) best = { p, d, score };
  }
  return best;
}

/* ═══ 2. THE MEASURE THAT SEPARATES A RENAMING FROM A CHANGE OF ADMINISTRATIVE RANK ═══════════
 *  ⚠⚠⚠ 573 of Wikidata's 888 dated Japanese name statements for settlements are «町 → 市», and
 *  102 of 180 Chinese ones are «乡 → 镇». Shipping those would put «1954 年に郡山町」 in front of a
 *  reader as a HISTORICAL NAME when the only thing that changed is the word for what kind of
 *  municipality it is. But the fix must not be a list of suffixes: the next language brings its
 *  own, and a list written today silently keeps shipping the ones it does not know about.
 *
 *  So the alternation is DISCOVERED. For every (historical name, modern name) pair in the same
 *  language, strip the longest common prefix and the longest common suffix; what is left is an
 *  ordered pair of fragments. Count how many DISTINCT PLACES exhibit the same fragment pair in
 *  the same position. A pair that hundreds of unrelated towns share is not a name — it is the
 *  grammar of the country's municipal code. A pair that one town has is that town's history.
 *
 *  ⚠ AND THE PREFIX MATTERS. 郡山町 → 大和郡山市 shares no prefix, so it is not this shape at
 *  all: something was added to the NAME, and that is a renaming even though the rank changed too.
 *  Only a pure alternation — same stem, different rank word — is suppressed. */
function alternation(oldName, newName) {
  const a = [...(oldName || '')], b = [...(newName || '')];
  if (!a.length || !b.length) return null;
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const fa = a.slice(p, a.length - s).join(''), fb = b.slice(p, b.length - s).join('');
  if (!p && !s) return null;                      /* nothing shared: a different name */
  const shared = p + s;
  if (shared < 2) return null;                    /* one shared character is a coincidence */
  if (shared < Math.min(a.length, b.length) * 0.4) return null;
  return { key: (p ? 'P' : '') + (s ? 'S' : '') + '|' + fa + '>' + fb, fa, fb };
}
/* ⚠⚠⚠ MEASURED, AND THE SWEEP HAS NO CLEAN GAP — which is itself the finding. --tune prints
   every fragment pair by how many distinct places share it, and the tail runs down smoothly:
   村>町 (363), 町>市 (268), «ий сельсовет»>«ое сельское поселение» (108), 乡>镇 (106), the Galician
   articles O/A/Os/As (277/219/47/40), «Desa » (18) and «Kota Besar » (15), the Romanian «de Jos»/
   «de Sus» (24/19), «rayonu»>«bələdiyyəsi» (21) — and then, below about twenty, single-character
   orthographic swaps (е>є, b>v, o>u, «t. »>«aint-»). NONE of those is a place being called
   something else; they are the grammar of how places are named, in a municipal code or a spelling
   reform. So there is no threshold that separates «administrative» from «a name», and the one that
   is set here separates «systematic» from «this town's own history», with the error deliberately on
   the side of SHIPPING: a suppressed renaming is invisible and unrecoverable, while an over-shipped
   orthographic variant is at worst a label that says almost the same thing. Expires when a sweep
   shows a pair above this count that is a genuine renaming — which is what --tune is for. */
let ADMIN_MIN = 20;

/* ═══ 3. WIKIDATA ════════════════════════════════════════════════════════════════════════ */
/* ⚠ THE TRIPLE ORDER IS THE QUERY. See scripts/histcities/upstream.mjs — the closure has to come
   AFTER the dated name statement or Blazegraph times out at sixty seconds, every time. */
const wdQuery = (prop) => `PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX pqv: <http://www.wikidata.org/prop/qualifier/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
SELECT ?item ?name ?s ?sp ?e ?ep ?lat ?lon WHERE {
  ?item p:${prop} ?st .
  { ?st pq:P580 ?d } UNION { ?st pq:P582 ?d }
  ?item wdt:P31/wdt:P279* wd:Q486972 .
  ?st ps:${prop} ?name .
  OPTIONAL { ?st pqv:P580 ?sv . ?sv wikibase:timeValue ?s ; wikibase:timePrecision ?sp . }
  OPTIONAL { ?st pqv:P582 ?ev . ?ev wikibase:timeValue ?e ; wikibase:timePrecision ?ep . }
  OPTIONAL { ?item p:P625/psv:P625 ?cv . ?cv wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon . }
}`;

const labelQuery = (qids) => `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
SELECT ?item ?l ?native WHERE {
  VALUES ?item { ${qids.map((q) => 'wd:' + q).join(' ')} }
  OPTIONAL { ?item rdfs:label ?l }
  OPTIONAL { ?item wdt:P1705 ?native }
}`;

async function harvestWikidata() {
  /* ── the statements ─────────────────────────────────────────────────────────────────────── */
  const items = new Map();   /* qid → { lon, lat, st: [ … ] } */
  const langSeen = new Map();
  let rawStatements = 0, dated = 0;
  for (const prop of ['P1448', 'P1705', 'P2561', 'P1813']) {
    const text = await sparqlTSV(wdQuery(prop), `wd-${prop}.tsv`);
    const rows = tsvRows(text);
    console.log(`  Wikidata ${prop}: ${rows.length.toLocaleString('en-US')} statement rows`);
    for (const r of rows) {
      rawStatements++;
      const item = term(r.item); const name = term(r.name);
      if (!item || !name || !name.v) continue;
      const end = term(r.e), start = term(r.s);
      const lat = term(r.lat), lon = term(r.lon);
      /* ⚠ A NAME THAT HAS NOT ENDED IS THE NAME THE TILE ALREADY CARRIES. That single condition
         removes every kind of thing this record must not ship: the current official name, and
         the Galician bulk import of 2 659 statements all starting in 2026, which is a spelling
         normalisation of small place names and not a history of anything. */
      if (!end || !end.v) continue;
      dated++;
      let it = items.get(item.v);
      if (!it) items.set(item.v, it = { qid: item.v, lon: null, lat: null, st: [] });
      if (lat && lon && it.lat === null) { it.lat = Number(lat.v); it.lon = Number(lon.v); }
      const lg = (name.lang || '').toLowerCase();
      langSeen.set(lg, (langSeen.get(lg) || 0) + 1);
      const sp = term(r.sp), ep = term(r.ep);
      const to = stampAt(end.v, ep ? ep.v : 0);
      if (!to) continue;
      it.st.push({
        name: name.v, lang: lg,
        start: start && start.v ? stampAt(start.v, sp ? sp.v : 0) : null,
        end: to,
      });
    }
  }
  console.log(`  → ${items.size.toLocaleString('en-US')} items, ${dated.toLocaleString('en-US')} of ${rawStatements.toLocaleString('en-US')} statements have an end date`);
  if (TUNE) {
    const top = [...langSeen].sort((a, b) => b[1] - a[1]).slice(0, 24);
    console.log('  language codes on ended name statements: ' + top.map(([l, n]) => `${l || '∅'}:${n}`).join(' '));
    console.log('  ⚠ bare zh → zh-hans (measured simplified); zh-hant count = ' + (langSeen.get('zh-hant') || 0));
  }

  /* ── the modern labels, for the join and for the administrative measure ─────────────────── */
  const qids = [...items.keys()].filter((q) => items.get(q).lat !== null).sort();
  const labels = new Map();  /* qid → { lang → label } */
  const CH = 350;
  for (let i = 0; i < qids.length; i += CH) {
    const chunk = qids.slice(i, i + CH);
    const text = await sparqlTSV(labelQuery(chunk), `wd-labels-${String(i / CH).padStart(3, '0')}.tsv`);
    for (const r of tsvRows(text)) {
      const it = term(r.item); if (!it) continue;
      let m = labels.get(it.v); if (!m) labels.set(it.v, m = {});
      const l = term(r.l);
      if (l && l.v && l.lang) m[l.lang] = l.v;
      const n = term(r.native);
      /* ⚠ P1705 IS NOT SINGLE-VALUED. Q1490 files both 東京都 and Tōkyō-to, and keeping only the
         last one read cost Tokyo the Japanese spelling the vector tile actually carries as
         `name` — which is the whole point of having a local key at all. */
      if (n && n.v) { if (!m['*native']) m['*native'] = []; if (!m['*native'].includes(n.v)) m['*native'].push(n.v); }
    }
    if ((i / CH) % 10 === 0) process.stdout.write(`\r  labels ${Math.min(i + CH, qids.length)}/${qids.length}   `);
  }
  console.log(`\r  labels for ${labels.size.toLocaleString('en-US')} items                `);

  /* ── the administrative alternation, discovered ─────────────────────────────────────────── */
  const altCount = new Map();
  for (const q of qids) {
    const L = labels.get(q) || {};
    const seen = new Set();
    for (const s of items.get(q).st) {
      const modern = L[s.lang];
      if (!modern) continue;
      const a = alternation(s.name, modern);
      if (a && !seen.has(a.key)) { seen.add(a.key); altCount.set(a.key, (altCount.get(a.key) || 0) + 1); }
    }
  }
  if (TUNE) {
    const top = [...altCount].sort((a, b) => b[1] - a[1]).slice(0, 40);
    console.log('  fragment alternations by number of distinct places:');
    for (const [k, n] of top) console.log(`    ${String(n).padStart(5)}  ${k}`);
  }

  /* ── rows ──────────────────────────────────────────────────────────────────────────────── */
  const rows = [];
  const stats = { noCoord: 0, noAnchor: 0, noEra: 0, admin: 0, sameAsModern: 0, yearZero: 0, eras: 0 };
  for (const q of qids) {
    const it = items.get(q);
    const L = labels.get(q) || {};
    const native = L['*native'] || [];
    const cand = [L.en].concat(native, [L.ja, L.ru, L.de, L.fr, L.es, L.ko, L.zh]).filter(Boolean);
    if (!cand.length) { stats.noAnchor++; continue; }
    const a = anchorFor(it.lon, it.lat, cand);
    if (!a) { stats.noAnchor++; continue; }

    const eras = clusterEras(it.st);
    const keep = [];
    for (const e of eras) {
      if (e.from && e.from.y === 0) { stats.yearZero++; continue; }
      if (e.to.y === 0) { stats.yearZero++; continue; }
      if (e.to.y > NOW_Y) continue;
      /* the era must be a DIFFERENT name from the one the tile carries, in some language */
      const modernForms = [a.p.name, a.p.ascii, L.en].concat(native).filter(Boolean);
      if (modernForms.some((m) => fold(m) === fold(e.n.en))) { stats.sameAsModern++; continue; }
      /* …and the difference must not be only the word for what rank of municipality it is */
      let admin = false;
      for (const [lg, v] of Object.entries(e.raw)) {
        const modern = L[lg];
        if (!modern) continue;
        const alt = alternation(v, modern);
        if (alt && (altCount.get(alt.key) || 0) >= ADMIN_MIN) { admin = true; break; }
      }
      if (admin) { stats.admin++; continue; }
      keep.push(e);
    }
    if (!keep.length) { stats.noEra++; continue; }
    stats.eras += keep.length;
    rows.push({
      src: 'wd', id: 'wd-' + q.toLowerCase(), qid: q,
      lon: +it.lon.toFixed(4), lat: +it.lat.toFixed(4), cc: a.p.cc,
      keyCand: dedupe([a.p.name, a.p.ascii, L.en].concat(native).filter(Boolean)),
      anchor: { name: a.p.name, cc: a.p.cc, km: +a.d.toFixed(2), pop: a.p.pop, fcode: a.p.fcode, lon: a.p.lon, lat: a.p.lat },
      eras: keep,
    });
  }
  console.log(`  → ${rows.length.toLocaleString('en-US')} candidate rows; dropped: ${stats.noAnchor} with no settlement at the coordinate, `
    + `${stats.noEra} with nothing left to say; suppressed ${stats.admin} rank changes, ${stats.sameAsModern} restatements of the modern name`);
  return rows;
}

function dedupe(a) {
  const seen = new Set(), out = [];
  for (const x of a) { const f = fold(x); if (!f || seen.has(f)) continue; seen.add(f); out.push(x); }
  return out;
}

/* ═══ 4. STATEMENTS → ERAS ════════════════════════════════════════════════════════════════
 *  One era is one span in which the city was called something. Wikidata files it once per
 *  language, and the languages disagree — Leningrad ends 1991-09-05 in Spanish, Armenian,
 *  Belarusian, Ukrainian and Hungarian, and 1991-09-06 in Russian. So the statements are grouped
 *  by span and the span is then decided by what the group AGREES on:
 *  ⚠⚠⚠ WHERE THEY DISAGREE, THE PRECISION FALLS. Sources that name two different days for the
 *  same event know the year, not the day, and saying «6 September» because Russian Wikipedia
 *  said so is inventing a fact the record does not have. This is 「日付精度の保持（架空の改称日を
 *  捏造しない）」 from IM-20260824-001, implemented as arithmetic rather than as a promise. */
const yearOf = (t) => (t ? t.y + ((t.m || 1) - 1) / 12 : null);

function clusterEras(st) {
  const sorted = st.slice().sort((a, b) => yearOf(a.end) - yearOf(b.end) || (yearOf(a.start) || -1e9) - (yearOf(b.start) || -1e9));
  const groups = [];
  for (const s of sorted) {
    const g = groups[groups.length - 1];
    const ok = g && Math.abs(yearOf(s.end) - yearOf(g[0].end)) <= 1
      && (!s.start || !g[0].start || Math.abs(yearOf(s.start) - yearOf(g[0].start)) <= 1);
    if (ok) g.push(s); else groups.push([s]);
  }
  /* ⚠⚠⚠ AND THEN THE OVERLAPS ARE MERGED, because js/hist-cities.js returns the FIRST span that
     contains the clock's instant and the build refuses a row whose spans overlap. Ho Chi Minh
     City is the measured case: French sources end «Saïgon» on 1975-04-30 and Vietnamese ones end
     «Sài Gòn» on 1976-07-02, which is 1.25 years apart — outside the grouping tolerance, so two
     groups, and they overlap for fourteen months. They are not two names; they are two accounts
     of when one name stopped. Merging them and letting consensus() decide the endpoint is what
     makes the disagreement visible as a LOWER PRECISION instead of as a silently dropped span. */
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i + 1 < groups.length; i++) {
      const a = groups[i], b = groups[i + 1];
      const aEnd = Math.max(...a.map((s) => yearOf(s.end)));
      const bStart = b.some((s) => !s.start) ? -Infinity : Math.min(...b.map((s) => yearOf(s.start)));
      if (bStart < aEnd - SUBSTANTIAL) { groups.splice(i, 2, a.concat(b)); merged = true; break; }
    }
  }
  return disjoin(groups.map(buildEra).filter(Boolean));
}

/* ⚠ HALF A YEAR, AND THE REASON IS THE CALENDAR. Two eras that overlap by a fortnight are not two
   accounts of one name — they are two accounts of one BOUNDARY, written in different calendars.
   Measured: Bulgarian Wikidata ends «Санкт Петербург» on 1914-08-31 and Ukrainian begins
   «Петроград» on 1914-09-13, the same day thirteen days apart because one of them is Julian.
   Merging on any overlap at all swallowed the pre-1914 name into Petrograd. An overlap longer
   than this is a real disagreement about which name was in use, and those ARE merged, so that
   consensus() can turn the disagreement into a lower precision instead of a dropped span. */
const SUBSTANTIAL = 0.5;

/* ⚠⚠⚠ TWO ERAS OVERLAP OR NOT AT THE INSTANT THE FILE SHIPS, NOT AT THE STAMP THE RECORD HOLDS.
   An endpoint with year precision is written down as [1962, 0, 0, 'y'] and ships as 1962-01-01 if
   it is a start and 1962-12-31 if it is an END — that asymmetry is the whole meaning of a coarse
   precision. Comparing the stamps instead put «ends 1962» before «begins 1962-06-01» and let five
   rows ship overlapping spans that the build then refused. So the comparison expands both sides
   the way scripts/build-hist-cities.mjs will, and asks about the same numbers the runtime does. */
const instant = (t, end) => (t
  ? t.y * 10000 + (t.m || (end ? 12 : 1)) * 100 + (t.d || (end ? daysInMonth(t.y, t.m || 12) : 1))
  : (end ? Infinity : -Infinity));

/** the day before a stated start — derived from a stated date, never invented */
function dayBefore(t) {
  let y = t.y, m = t.m || 1, d = t.d || 1;
  if (d > 1) d -= 1;
  else if (m > 1) { m -= 1; d = daysInMonth(y, m); }
  else { y -= 1; m = 12; d = 31; }
  /* an endpoint may not claim a month or a day its precision does not support */
  return { y, m: t.p === 'd' || t.p === 'm' ? m : 0, d: t.p === 'd' ? d : 0, p: t.p };
}

/* ⚠⚠⚠ THE SPANS OF ONE CITY ARE A PARTITION, NOT A PILE. js/hist-cities.js returns the FIRST span
   containing the clock's instant, so an overlap is a precedence rule nobody wrote down, and
   scripts/build-hist-cities.mjs refuses one outright. Where two eras still touch after the merge
   above, the earlier one is CLIPPED to the day before the later one begins — which uses only what
   the upstream stated (the later era's own start) and invents no date. If the clip would empty an
   era, that era loses its place rather than shipping as a span nobody can reach. */
function disjoin(eras) {
  const out = [];
  for (const e of eras) {
    if (!e.from && out.length) continue;          /* an open start under a fixed one is a conflict */
    let placed = false;
    while (!placed) {
      const prev = out[out.length - 1];
      if (!prev || !e.from || instant(e.from, false) > instant(prev.to, true)) { placed = true; break; }
      const clipped = dayBefore(e.from);
      if (prev.from && instant(prev.from, false) > instant(clipped, true)) out.pop();
      else { prev.to = clipped; placed = true; }
    }
    if (e.from && instant(e.from, false) > instant(e.to, true)) continue;
    out.push(e);
  }
  return out;
}

/** the value a group agrees on, and the precision that agreement actually supports */
function consensus(times) {
  const have = times.filter(Boolean);
  if (!have.length) return null;
  const vote = (f) => {
    const c = new Map();
    for (const t of have) { const v = f(t); if (v === undefined || v === null || v === 0) continue; c.set(v, (c.get(v) || 0) + 1); }
    const best = [...c].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
    return { v: best ? best[0] : 0, split: c.size > 1 };
  };
  const Y = vote((t) => t.y === 0 ? '0' : t.y);
  const y = Y.v === '0' ? 0 : Y.v;
  const inYear = have.filter((t) => t.y === y);
  const M = vote((t) => (inYear.includes(t) ? t.m : 0));
  const inMonth = inYear.filter((t) => t.m === M.v);
  const D = vote((t) => (inMonth.includes(t) ? t.d : 0));
  /* the best precision anyone declared, capped by what the group agrees on */
  let p = 'y';
  const rank = { c: 0, y: 1, m: 2, d: 3 };
  for (const t of inYear) if (rank[t.p] > rank[p]) p = t.p;
  if (Y.split) p = 'y';
  if (rank[p] >= 2 && (M.split || !M.v)) p = 'y';
  if (rank[p] >= 3 && (D.split || !D.v)) p = M.v ? 'm' : 'y';
  if (have.every((t) => t.p === 'c')) p = 'c';
  return { y, m: rank[p] >= 2 ? M.v : 0, d: rank[p] >= 3 ? D.v : 0, p };
}

function buildEra(group) {
  const to = consensus(group.map((s) => s.end));
  if (!to) return null;
  const withStart = group.filter((s) => s.start);
  const from = withStart.length ? consensus(withStart.map((s) => s.start)) : null;
  /* the surface forms, one per language, by majority */
  const byLang = new Map();
  for (const s of group) {
    let m = byLang.get(s.lang); if (!m) byLang.set(s.lang, m = new Map());
    m.set(s.name, (m.get(s.name) || 0) + 1);
  }
  const pick = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  const raw = {};                                  /* wikidata language code → form */
  for (const [lg, m] of byLang) raw[lg] = pick(m);
  const n = {};                                    /* IntMap language code → form */
  const attested = new Set();
  for (const [lg, v] of Object.entries(raw)) {
    const im = LANG_MAP[lg];
    if (!im) continue;
    if (n[im] && attested.has(im)) continue;
    n[im] = v; attested.add(im);
  }
  /* ⚠⚠⚠ THE ENGLISH COLUMN, WHEN THERE IS NO ENGLISH STATEMENT. Measured over the whole corpus,
     English is the SIXTH best-served language (303 places) behind Russian (2 465) and Japanese
     (919): dropping every era Wikidata has not written in English would throw away most of the
     harvest, and inventing a transliteration would make the past claim more than the present
     does (scripts/histcities/lang.mjs's rule). So the English column takes the Latin-script
     spelling the MOST languages agree on — a measure over what the upstream actually wrote, not
     a hand-ranked list of which language to trust. Ties break alphabetically so the file is
     byte-stable. If the group has no Latin-script form at all, the majority form stands as
     written, which is exactly what js/place-labels.js already shows for a settlement OSM has no
     Latin tag for. Either way the attestation bitmask says English was not attested. */
  if (!n.en) {
    const latinForms = new Map();
    for (const v of Object.values(raw)) if (latin(v)) latinForms.set(v, (latinForms.get(v) || 0) + 1);
    if (latinForms.size) n.en = [...latinForms].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    else {
      const all = new Map();
      for (const v of Object.values(raw)) all.set(v, (all.get(v) || 0) + 1);
      n.en = [...all].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    }
  }
  return { from, to, n, raw, attested: [...attested] };
}

/* ═══ 5. PLEIADES ════════════════════════════════════════════════════════════════════════
 *  ⚠⚠⚠ THE «1700–2100» BAND IS NOT A SPAN, IT IS AN IDENTITY. Pleiades gives every modern name
 *  the same start and end — `Paris|fr|1700–2100` does not mean anyone started saying «Paris» in
 *  1700 — so shipping it as a span would be a fabricated date on almost every place in the file.
 *  What it IS, is Pleiades' own statement of what the place is called NOW, which is precisely the
 *  join this build needs: it turns «some ancient site near 2.35, 48.86» into «the settlement the
 *  vector tile labels Paris». So a name whose span covers the present is used as the identity and
 *  never as an era, and a name whose span has ended becomes one.
 *
 *  ⚠ THE LICENCE IS PER RECORD. 26 971 places are CC BY 3.0 «The Contributors», 15 348 the same
 *  text with «The Creators», and exactly one is CC BY-SA 3.0 (Ancient World Mapping Center). A
 *  build that wrote «this dataset is CC BY» in sources.html would be lying about that one, so the
 *  rights string is read per place and anything that is not plain CC BY is left out, counted. */
const PLEIADES_URL = 'https://atlantides.org/downloads/pleiades/json/pleiades-places-latest.json.gz';
const PLEIADES_MIN = 'pleiades-min2.json';
const BS = String.fromCharCode(92);

async function pleiadesPlaces() {
  const min = cacheFile(PLEIADES_MIN);
  if (existsSync(min)) return JSON.parse(readFileSync(min, 'utf8'));
  const gz = cacheFile('pleiades-places-latest.json.gz');
  if (!existsSync(gz)) await cachedFetch(PLEIADES_URL, 'pleiades-places-latest.json.gz');
  /* ⚠ STREAMED, BRACE BY BRACE. The archive is 135 MB compressed and something over a gigabyte
     of JSON-LD — `{"@graph":[…]}`, not GeoJSON — so JSON.parse of the whole thing is not an
     option on this machine. Each top-level object inside @graph is parsed on its own and reduced
     to the five fields this build reads before the next one is read.
     ⚠⚠⚠ AND THE SCAN POSITION SURVIVES THE CHUNK BOUNDARY. The first version restarted at the
     beginning of the buffer on every 64 kB read, because a string that straddled two chunks left
     the scanner with nowhere safe to stop; a Pleiades place carries its full edit history and
     runs to megabytes, so the same bytes were re-walked dozens of times and the extraction had
     not finished after fifty minutes. Carrying `pos`, `inStr` and `esc` across reads makes it
     one pass over the file, and the buffer is only ever sliced when an object completes. */
  const out = [];
  let buf = '', pos = 0, depth = 0, start = -1, inStr = false, esc = false, inGraph = false;
  const stream = createReadStream(gz).pipe(createGunzip());
  for await (const chunk of stream) {
    buf += chunk.toString('utf8');
    if (!inGraph) {
      const i = buf.indexOf('"@graph"');
      if (i < 0) { if (buf.length > 1e6) buf = buf.slice(-1e5); continue; }
      const j = buf.indexOf('[', i); if (j < 0) continue;
      buf = buf.slice(j + 1); pos = 0; inGraph = true;
    }
    while (pos < buf.length) {
      const ch = buf[pos];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === BS) esc = true;
        else if (ch === '"') inStr = false;
        pos++; continue;
      }
      if (ch === '"') { inStr = true; pos++; continue; }
      if (ch === '{') { if (depth === 0) start = pos; depth++; pos++; continue; }
      if (ch === '}') {
        depth--; pos++;
        if (depth === 0) {
          const o = JSON.parse(buf.slice(start, pos));
          const rp = o.reprPoint;
          out.push({
            id: String(o.id || ''), title: o.title || '', rights: o.rights || '',
            types: o.placeTypes || [],
            rp: rp ? [+rp[0].toFixed(5), +rp[1].toFixed(5)] : null,
            names: (o.names || []).map((x) => ({ r: x.romanized || '', a: x.attested || '', l: (x.language || '').toLowerCase(), s: x.start, e: x.end })),
          });
          buf = buf.slice(pos); pos = 0; start = -1;
        }
        continue;
      }
      pos++;
    }
  }
  writeFileSync(min, JSON.stringify(out));
  return out;
}

const CCBY = /creative commons attribution 3\.0/i;
const CCBYSA = /share.?alike/i;

/* ⚠⚠⚠ PLEIADES IS A GAZETTEER OF PLACES, NOT OF CITIES. 42 321 of them, and the ones with both
   an ancient and a modern name include the Baths of Constantine, the Asklepieion of Corinth, 198
   rivers, 149 islands, 75 capes and 44 city gates. The first run of this harvest shipped a row
   that renamed the label «Rome» to «Constantinianum lavacrum» for the whole fourth century,
   because a bath house inside Rome resolves to the settlement Rome and answers to its name.
   ⚠ The discriminator is Pleiades' OWN WORD for an inhabited place. Its place-type vocabulary
   spells them `settlement`, `settlement-modern` and `fortified-settlement` — 1 683 of the
   2 643 candidates — and everything else in that vocabulary names a feature, a structure or a
   landform. Matching the term rather than listing the 25 others means a type added upstream is
   admitted only if Pleiades itself calls it a settlement. */
const SETTLEMENT = /(^|-)settlement(-|$)/;

/* ⚠ `romanized` MAY HOLD SEVERAL VARIANTS IN ONE STRING, comma-separated
   («al-Qustantīnīya, al-Qustantiniya, el-Qustantiniye»). A label is one name, so the first
   variant — the one Pleiades lists first — is the label and the rest are not shipped. */
const firstForm = (v) => String(v || '').split(',')[0].trim();

/* ⚠⚠⚠ AND A PILE OF ATTESTATIONS IS NOT A SEQUENCE OF NAMES. Constantinople carries eleven
   overlapping name records — Greek, Latin, Arabic, Ottoman, German — because they are what
   somebody wrote down, not a partition of the timeline. The clock asks a different question:
   what was this place called IN THIS YEAR, once. So the spans are cut at every boundary any of
   them names, and in each resulting stretch the name whose OWN span is narrowest wins, because
   the narrowest attestation is the most specific claim anybody made about that stretch. Adjacent
   stretches with the same winner are then joined back up, so the shipped spans are as long as
   the evidence allows and never overlap. Ties break on the earlier start and then alphabetically,
   so the file is byte-stable. */
function partitionSpans(items) {
  const spans = new Map();
  for (const n of items) {
    const k = n.s + '/' + n.e;
    let g = spans.get(k); if (!g) spans.set(k, g = []);
    g.push(n);
  }
  const list = [...spans.values()];
  const bounds = new Set();
  for (const g of list) { bounds.add(g[0].s); bounds.add(g[0].e + 1); }
  const b = [...bounds].sort((x, y) => x - y);
  const segs = [];
  for (let i = 0; i + 1 < b.length; i++) {
    const s0 = b[i], e0 = b[i + 1] - 1;
    const cover = list.filter((g) => g[0].s <= s0 && g[0].e >= e0);
    if (!cover.length) continue;
    cover.sort((x, y) => (x[0].e - x[0].s) - (y[0].e - y[0].s) || x[0].s - y[0].s
      || firstForm(x[0].label).localeCompare(firstForm(y[0].label)));
    const prev = segs[segs.length - 1];
    if (prev && prev.g === cover[0] && prev.e + 1 === s0) prev.e = e0;
    else segs.push({ s: s0, e: e0, g: cover[0] });
  }
  return segs;
}

async function harvestPleiades() {
  const places = await pleiadesPlaces();
  console.log(`  Pleiades: ${places.length.toLocaleString('en-US')} places, ${places.filter((p) => p.rp).length.toLocaleString('en-US')} with a representative point`);
  const stats = { sa: 0, noRights: 0, noPoint: 0, notSettlement: 0, noModern: 0, noAnchor: 0, noEra: 0, eras: 0, zero: 0 };
  const rows = [];
  for (const pl of places) {
    if (!pl.rp) { stats.noPoint++; continue; }
    if (CCBYSA.test(pl.rights)) { stats.sa++; continue; }
    if (!CCBY.test(pl.rights)) { stats.noRights++; continue; }
    if (!(pl.types || []).some((t) => SETTLEMENT.test(t))) { stats.notSettlement++; continue; }
    const modern = [], ancient = [];
    for (const n of pl.names) {
      const label = firstForm(n.r || n.a);
      if (!label) continue;
      if (typeof n.s !== 'number' || typeof n.e !== 'number') continue;
      /* «covers the present» is the identity test, and it is written against the DATA's own
         convention rather than against the literal pair 1700/2100: any name whose span has not
         ended is the name now, whatever numbers the record used to say so. */
      if (n.e >= NOW_Y) modern.push(label);
      else ancient.push({ label, lang: n.l, s: n.s, e: n.e });
    }
    if (!modern.length) { stats.noModern++; continue; }
    if (!ancient.length) { stats.noEra++; continue; }
    const a = anchorFor(pl.rp[0], pl.rp[1], modern);
    if (!a) { stats.noAnchor++; continue; }
    const eras = [];
    for (const seg of partitionSpans(ancient)) {
      if (seg.s === 0 || seg.e === 0) { stats.zero++; continue; }
      const n = {}, attested = new Set();
      for (const x of seg.g) {
        const im = LANG_MAP[x.lang];
        if (im && !n[im]) { n[im] = x.label; attested.add(im); }
      }
      if (!n.en) n.en = seg.g.map((x) => x.label).sort()[0];
      if (modern.some((m) => fold(m) === fold(n.en)) || sameName(a.p.name, n.en)) continue;
      /* ⚠ THE PRECISION IS 'c', AND THAT IS NOT MODESTY. Pleiades' start and end come from its
         time-period vocabulary — «hellenistic-republican» begins at −330 and «roman» at −30, and
         those two numbers alone account for 18 360 of its 40 463 dated name records — so they are
         period boundaries, not years anybody attested for this name in this place. The record
         also never writes year 0 (measured: not once in 40 463), so whether its BC years are
         astronomical or historical cannot be settled from the data and may be off by one. Both
         facts are inside what 'c' claims; 'y' would claim past them. */
      eras.push({
        from: { y: seg.s, m: 0, d: 0, p: 'c' }, to: { y: seg.e, m: 0, d: 0, p: 'c' },
        n, raw: {}, attested: [...attested],
      });
    }
    if (!eras.length) { stats.noEra++; continue; }
    stats.eras += eras.length;
    rows.push({
      src: 'pl', id: 'pl-' + pl.id, qid: '',
      lon: pl.rp[0], lat: pl.rp[1], cc: a.p.cc,
      /* ⚠ A KEY IS A SPELLING THE TILE MAY CARRY FOR THIS SETTLEMENT — not every modern name in
         the place record. «Baths of Constantine» is a modern name of a Pleiades place and it is
         not a name of the city the label layer draws. */
      keyCand: dedupe([a.p.name, a.p.ascii].concat(modern.filter((m) => sameName(m, a.p.name) || sameName(m, a.p.ascii)))),
      anchor: { name: a.p.name, cc: a.p.cc, km: +a.d.toFixed(2), pop: a.p.pop, fcode: a.p.fcode, lon: a.p.lon, lat: a.p.lat },
      eras,
    });
  }
  console.log(`  → ${rows.length.toLocaleString('en-US')} candidate rows, ${stats.eras.toLocaleString('en-US')} ancient spans; `
    + `${stats.notSettlement.toLocaleString('en-US')} places are not settlements, ${stats.noModern.toLocaleString('en-US')} have no name in use today, `
    + `${stats.noAnchor.toLocaleString('en-US')} have no settlement the label layer draws within ${ANCHOR_TOL_KM} km, `
    + `${stats.sa} are CC BY-SA and ${stats.noRights} carry no CC BY statement`);
  return rows;
}

/* ═══ 5b. OPENHISTORICALMAP ═══════════════════════════════════════════════════════════════
 *  ⚠⚠⚠ #R679 MEASURED THIS UPSTREAM AND TURNED IT DOWN, AND BOTH OF ITS MEASUREMENTS WERE
 *  ARTEFACTS OF HOW THEY WERE TAKEN. What it wrote was: the era names are not in `old_name`, they
 *  are separate nodes stacked at the same coordinate; `wikidata` is on 19.6% and the same QID can
 *  sit on two nodes of different eras; `type=chronology` membership is 5.1% — «so we would have
 *  to invent our own identity rule», and inventing one was refused. The refusal was right and the
 *  premise was wrong. Re-measured 2026-09-10 over the same 122,939 `place=city|town|village|hamlet`
 *  nodes:
 *
 *   ① THE NODES ARE NOT STACKED, THEY ARE JITTERED. Volgograd's four are at longitude
 *      44.5147028 / …27 / …26 / …26. Of the 1,920 QIDs that appear on two or more nodes, only
 *      4.2% have their nodes at an identical coordinate and 80.1% have them 1–110 m apart. An
 *      identity test written on exact equality measures a recall of 4.2% BY CONSTRUCTION — it is
 *      measuring its own tolerance, not the upstream.
 *   ② THE CHRONOLOGY TEST HAS TO BE HALF-OPEN. OHM chains a succession as `1852..1853` then
 *      `1853..1889`. Asking whether two closed intervals overlap calls almost every clean chain
 *      dirty: 78–82% «overlapping» against 96.9% clean when the shared endpoint is read the way
 *      OHM writes it.
 *
 *  ⇒ At a 250 m single-link tolerance, and validated against OHM's OWN `wikidata` tags: 91.1% of
 *  multi-QID groups hold one QID (n=1,889) and 87.0% of multi-node QIDs land in one group, with
 *  96.9% of the groups a clean chronology. Distinct settlements are 500 m or more apart 74.4% of
 *  the time, which is why precision holds at 250 m and collapses to 76.6% at a kilometre.
 *  ⚠ THE 8.9% IS AN UPPER BOUND ON FALSE BUNDLING, because most of it is Wikidata modelling a
 *  successor settlement as a separate entity — `Tenōchtitlan 1325..1521 (Q13695)` beside
 *  `Ciudad de México 1521.. (Q1489)` — which is exactly the bundling a record of NAMES wants.
 *
 *  ⚠⚠⚠ AND THE FABRICATED DATES ARE DECLARED BY THE MAPPERS, SO NO HEURISTIC IS WRITTEN HERE.
 *  #R679 saw thirteen `place=neighbourhood` objects around Tokyo with a made-up 1800/1900 pair and
 *  concluded a bulk import had to be screened out by shape. World-wide there are seventeen objects
 *  with that exact pair and ten of them are `place=neighbourhood`, which this query never asks for.
 *  The real bulk fabrication is 34,836 French communes given `start_date=1800` by one import — and
 *  every one of them carries `start_date:fixme=arbitrary`. 39,959 nodes (32.5%) flag their start
 *  as arbitrary, low-confidence or fixme, and OHM writes uncertainty in a `*:edtf` sidecar
 *  (`?` `~` `..`) while the plain field stays a crisp number. A round-number heuristic finds 394
 *  nodes and libels genuine `1400..1700` history; the declared fields find all 39,959 and were
 *  written by the people who know. ⇒ READ WHAT THE UPSTREAM DECLARES (#R650's shape: the rule
 *  belongs to the publisher's own statement, not to our guess about it).
 *
 *  ⚠ THE LICENCE IS CC0 EXCEPT WHERE AN ELEMENT SAYS OTHERWISE, and 33.6% of these nodes carry a
 *  `license=*` tag (39,398 CC-BY-4.0 — the same French import — and 1,803 ODbL). Same discipline
 *  as Pleiades: the tag is read per element and anything that is not CC0 is left out and counted,
 *  so the declaration in WD_LICENCE/OHM_LICENCE is true of what actually ships.
 *
 *  ⚠ WHAT THIS DOES NOT BUY IS THE NINE LANGUAGES. Only 945 of the 2,553 usable gap-era nodes
 *  carry any `name:<lang>` at all, and for IntMap's nine the best served is English at 192. OHM
 *  supplies the endonym and the DATES; the other eight columns stay unattested, exactly as they do
 *  for Pleiades, and the attestation bitmask says so rather than the English form being copied
 *  across and called a translation. */
const OHM_OVERPASS = 'https://overpass-api.openhistoricalmap.org/api/interpreter';
/* 15° × 30° tiles. ⚠ NOT AN OPTIMISATION — one planet-wide `node[place=…]` request is refused,
   and the tile size is what was measured to return on the first attempt for all 144 of them. */
const OHM_TILE_LON = 15, OHM_TILE_LAT = 30;
const OHM_CLUSTER_M = 250;
/* ⚠ CC0 OR NOTHING. OHM's own copyright page: «made available under CC0», with per-element
   exceptions carried in a `license` tag. These are the strings its elements actually use. */
const OHM_CC0 = /^(cc0|cc-0|public.?domain|pd)/i;

/** an OSM/OHM date field → the record's stamp, or null when it is not a crisp date.
 *  ⚠ THE PRECISION IS THE FIELD'S OWN LENGTH. `1589` is a year, `1589-06` a month, `1589-06-07`
 *  a day — OHM writes exactly what it knows and pads nothing, which is the opposite of what
 *  WDQS's TSV does (see upstream.mjs stampAt). Measured over 113,378 start dates and 22,778 end
 *  dates: every one of them is one of these three shapes bar ten typos, and not a single `C18`,
 *  `~1700`, `1580..1590` or `early 1800s` in either field. */
function ohmDate(v) {
  const s = String(v || '').trim();
  let m = /^(-?)(\d{1,6})$/.exec(s);
  if (m) return { y: (m[1] ? -1 : 1) * Number(m[2]), m: 0, d: 0, p: 'y' };
  m = /^(-?)(\d{1,6})-(\d\d)$/.exec(s);
  if (m) { const mo = Number(m[3]); return mo >= 1 && mo <= 12 ? { y: (m[1] ? -1 : 1) * Number(m[2]), m: mo, d: 0, p: 'm' } : null; }
  m = /^(-?)(\d{1,6})-(\d\d)-(\d\d)$/.exec(s);
  if (m) {
    const mo = Number(m[3]), da = Number(m[4]);
    if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return { y: (m[1] ? -1 : 1) * Number(m[2]), m: mo, d: da, p: 'd' };
  }
  return null;
}

/** ⚠ THE UPSTREAM'S OWN DOUBT, IN THE UPSTREAM'S OWN WORDS. `end` picks which endpoint's
 *  sidecar tags are read, so the rule is attached to the endpoint and not to a call site. */
function ohmDoubts(t, end) {
  const k = end ? 'end_date' : 'start_date';
  if (t[k + ':fixme']) return 'fixme';
  if (/^low$/i.test(t[k + ':confidence'] || '')) return 'confidence';
  if (/arbitrary/i.test(t[k + ':source'] || '')) return 'source';
  if (/[?~]|\.\./.test(t[k + ':edtf'] || '')) return 'edtf';
  return '';
}

/** every `place=city|town|village|hamlet` node OHM holds, tile by tile, cached */
async function ohmNodes() {
  const seen = new Map();
  let tiles = 0;
  for (let lon = -180; lon < 180; lon += OHM_TILE_LON) {
    for (let lat = -90; lat < 90; lat += OHM_TILE_LAT) {
      const bbox = `${lat},${lon},${lat + OHM_TILE_LAT},${lon + OHM_TILE_LON}`;
      const q = `[out:json][timeout:900];node["place"~"^(city|town|village|hamlet)$"](${bbox});out tags center;`;
      const buf = await cachedFetch(OHM_OVERPASS, `ohm-place-${lon}-${lat}.json`, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      const j = JSON.parse(buf.toString('utf8'));
      for (const el of j.elements || []) if (!seen.has(el.id)) seen.set(el.id, el);
      tiles++;
    }
  }
  console.log(`  OHM: ${tiles} tiles, ${seen.size.toLocaleString('en-US')} distinct place nodes`);
  return [...seen.values()];
}

/** single-link clusters at OHM_CLUSTER_M, over a degree grid coarse enough to hold the radius */
function ohmCluster(nodes) {
  const cell = 0.01;                                   /* ~1.1 km — comfortably over 250 m */
  const buckets = new Map();
  const key = (a, b) => a + ':' + b;
  nodes.forEach((n, i) => {
    const k = key(Math.floor(n.lat / cell), Math.floor(n.lon / cell));
    let a = buckets.get(k); if (!a) buckets.set(k, a = []);
    a.push(i);
  });
  const parent = nodes.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  nodes.forEach((n, i) => {
    const cy = Math.floor(n.lat / cell), cx = Math.floor(n.lon / cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of buckets.get(key(cy + dy, cx + dx)) || []) {
        if (j <= i) continue;
        if (km(n.lon, n.lat, nodes[j].lon, nodes[j].lat) * 1000 <= OHM_CLUSTER_M) union(i, j);
      }
    }
  });
  const groups = new Map();
  nodes.forEach((_, i) => { const r = find(i); let a = groups.get(r); if (!a) groups.set(r, a = []); a.push(i); });
  return [...groups.values()].map((ix) => ix.map((i) => nodes[i]));
}

async function harvestOHM() {
  const raw = await ohmNodes();
  const stats = {
    noName: 0, noDate: 0, badDate: 0, doubted: 0, notCC0: 0,
    groups: 0, noModern: 0, noAnchor: 0, noEra: 0, eras: 0, zero: 0, sameName: 0, noStart: 0,
  };
  /* ── ① what OHM itself says is usable ─────────────────────────────────────────────────── */
  const usable = [];
  for (const el of raw) {
    const t = el.tags || {};
    const lon = el.lon != null ? el.lon : (el.center && el.center.lon);
    const lat = el.lat != null ? el.lat : (el.center && el.center.lat);
    if (lon == null || lat == null) continue;
    if (!t.name) { stats.noName++; continue; }
    if (t.license && !OHM_CC0.test(t.license)) { stats.notCC0++; continue; }
    if (!t.start_date && !t.end_date) { stats.noDate++; continue; }
    const from = t.start_date ? ohmDate(t.start_date) : null;
    const to = t.end_date ? ohmDate(t.end_date) : null;
    if ((t.start_date && !from) || (t.end_date && !to)) { stats.badDate++; continue; }
    if ((from && ohmDoubts(t, false)) || (to && ohmDoubts(t, true))) { stats.doubted++; continue; }
    usable.push({ id: el.id, lon, lat, t, from, to, name: t.name });
  }
  console.log(`  → ${usable.length.toLocaleString('en-US')} usable nodes; dropped ${stats.noName.toLocaleString('en-US')} unnamed, `
    + `${stats.noDate.toLocaleString('en-US')} undated, ${stats.badDate} with a date this cannot read, `
    + `${stats.doubted.toLocaleString('en-US')} the mappers themselves flag as arbitrary/low-confidence/uncertain, `
    + `${stats.notCC0.toLocaleString('en-US')} under a licence that is not CC0`);

  /* ── ② one place per cluster ───────────────────────────────────────────────────────────── */
  const rows = [];
  for (const g of ohmCluster(usable)) {
    stats.groups++;
    /* THE PLACE'S PRESENT NAME is the member whose name has not ended. A cluster with none of
       those is a place that no longer exists under any name, and the label layer draws no tile
       for it — #R409's «a row that cannot reach the screen». */
    const modern = g.filter((n) => !n.to || n.to.y >= NOW_Y);
    if (!modern.length) { stats.noModern++; continue; }
    const modernNames = dedupe(modern.flatMap((n) => [n.name, n.t['name:en']]).filter(Boolean));
    const a = anchorFor(modern[0].lon, modern[0].lat, modernNames);
    if (!a) { stats.noAnchor++; continue; }
    const cand = [];
    for (const n of g) {
      if (!n.to || n.to.y >= NOW_Y) continue;                       /* still current → not an era */
      if (modernNames.some((m) => fold(m) === fold(n.name)) || sameName(a.p.name, n.name)) { stats.sameName++; continue; }
      /* ⚠⚠⚠ AND IT HAS TO SAY WHEN IT BEGAN. An era with no start answers every year below its
         end, and the clock's floor is astronomical year −122 999 — the record already carries
         2 292 such claims it inherited from the handwritten rows and from Wikidata's silence, and
         this round measured that they CANNOT be bounded from upstream (Wikidata's inception covers
         half of them and dates the municipality rather than the place). A third upstream does not
         get to add more of them when 99.5% of its own nodes DO state a start: 624 of OHM's 122,939
         carry an end and no start, and 48 of those survived every other test here. What is lost is
         48 places whose only evidence would have been undatable; what is kept is that every OHM
         span in the file says when it begins. ⚠ Expires if OHM's end-only share stops being a
         rounding error — the count is printed on every harvest. */
      if (!n.from) { stats.noStart++; continue; }
      if (n.from.y === 0) { stats.zero++; continue; }
      if (n.to.y === 0) { stats.zero++; continue; }
      const nm = { en: n.t['name:en'] || n.name };
      const attested = new Set();
      if (n.t['name:en']) attested.add('en');
      for (const [k, v] of Object.entries(n.t)) {
        const mm = /^name:([A-Za-z-]+)$/.exec(k);
        if (!mm) continue;
        const im = LANG_MAP[mm[1].toLowerCase()];
        if (im && !nm[im]) { nm[im] = v; attested.add(im); }
      }
      cand.push({ from: n.from, to: n.to, n: nm, raw: {}, attested: [...attested], _at: instant(n.from, false) });
    }
    if (!cand.length) { stats.noEra++; continue; }
    cand.sort((x, y) => x._at - y._at);
    /* ⚠ THE CHAIN IS CLOSED BY disjoin(), NOT BY A CONVENTION TYPED HERE. OHM writes a succession
       as `1852..1853` then `1853..1889`, so the two touch at the shared endpoint; disjoin() clips
       the earlier one to the day before the later one BEGINS, which is a date the upstream stated.
       Deciding here whether `end_date` is inclusive or exclusive would be a convention invented to
       fit — and it would be wrong for the 0.5% of nodes that carry an end and no successor. */
    const eras = disjoin(cand.map((e) => ({ from: e.from, to: e.to, n: e.n, raw: e.raw, attested: e.attested })));
    if (!eras.length) { stats.noEra++; continue; }
    stats.eras += eras.length;
    rows.push({
      src: 'ohm', id: 'ohm-' + Math.min(...g.map((n) => n.id)), qid: '',
      lon: modern[0].lon, lat: modern[0].lat, cc: a.p.cc,
      keyCand: dedupe([a.p.name, a.p.ascii].concat(modernNames.filter((m) => sameName(m, a.p.name) || sameName(m, a.p.ascii)))),
      anchor: { name: a.p.name, cc: a.p.cc, km: +a.d.toFixed(2), pop: a.p.pop, fcode: a.p.fcode, lon: a.p.lon, lat: a.p.lat },
      eras,
    });
  }
  console.log(`  → ${rows.length.toLocaleString('en-US')} candidate rows, ${stats.eras.toLocaleString('en-US')} spans, from ${stats.groups.toLocaleString('en-US')} clusters at ${OHM_CLUSTER_M} m; `
    + `${stats.noModern.toLocaleString('en-US')} clusters have no name still in use, ${stats.noAnchor.toLocaleString('en-US')} have no settlement the label layer draws within ${ANCHOR_TOL_KM} km, `
    + `${stats.noEra.toLocaleString('en-US')} have no ended name, ${stats.sameName.toLocaleString('en-US')} ended names are the present name again, ${stats.noStart.toLocaleString('en-US')} ended names never say when they began, ${stats.zero} touch astronomical year 0`);
  return rows;
}

/* ═══ 6. THE KEYS, AND THE GUARD EACH ONE EARNS ══════════════════════════════════════════
 *  ⚠ A SPELLING IS NOT AN IDENTITY (#R521). Every key a derived row proposes is resolved against
 *  the whole of cities500 — own name, ASCII name AND alternate list — and the nearest OTHER
 *  settlement answering to it decides the guard radius. A key whose namesake is close enough to
 *  push the guard under the floor is DROPPED, and a row that loses all its keys is dropped with
 *  it: there is no sentence anybody can write here to keep it. */
function resolveKeys(rows) {
  const want = new Set();
  for (const r of rows) for (const k of r.keyCand) want.add(k);
  const hits = new Map();
  for (const p of GEO) {
    const seen = new Map();
    const mark = (v, own) => { if (v && want.has(v) && !seen.has(v)) seen.set(v, own); };
    mark(p.name, true); mark(p.ascii, true);
    for (const alt of p.alts) mark(alt, false);
    for (const [v] of seen) {
      let a = hits.get(v); if (!a) hits.set(v, a = []);
      a.push(p);
    }
  }
  const stats = { dropped: 0, rows: 0 };
  const out = [];
  for (const r of rows) {
    const keys = [], rivals = [];
    for (const k of r.keyCand) {
      const found = hits.get(k) || [];
      let nearest = null;
      for (const p of found) {
        const d = km(r.lon, r.lat, p.lon, p.lat);
        /* ⚠⚠⚠ «THE SAME PLACE, LISTED TWICE» IS MEASURED FROM THE ANCHOR, NOT FROM THE ROW.
           The first version asked how far the candidate was from the row's own coordinate, which
           is the upstream's point and can be kilometres from the settlement — and then the
           anchor became its own rival. Measured: Ho Chi Minh City's Wikidata point is 9.5 km from
           the GeoNames city, so «Ho Chi Minh City» was treated as a namesake 9.5 km away, the
           guard fell to 4.75 km, the key was dropped, and the row shipped keyed only on its
           Khmer label. GeoNames files a city and its administrative seat as two rows a kilometre
           or two apart; that, and only that, is what this collapses. */
        if (p.cc === r.anchor.cc && km(r.anchor.lon, r.anchor.lat, p.lon, p.lat) <= SAME_PLACE_KM) continue;
        if (!nearest || d < nearest.km) nearest = { name: p.name, cc: p.cc, km: +d.toFixed(2), pop: p.pop };
      }
      const g = guardFrom(nearest ? nearest.km : Infinity);
      if (g < GUARD_FLOOR_KM) { stats.dropped++; continue; }
      keys.push(k);
      if (nearest) rivals.push(nearest);
    }
    if (!keys.length) { stats.rows++; continue; }
    rivals.sort((a, b) => a.km - b.km);
    out.push(Object.assign({}, r, { keys, rival: rivals[0] || null }));
  }
  console.log(`  keys: ${stats.dropped.toLocaleString('en-US')} dropped for a namesake too close to tell apart, `
    + `${stats.rows.toLocaleString('en-US')} rows lost every key`);
  return out;
}

/* ═══ 7. THE RECORD FILE ═════════════════════════════════════════════════════════════════ */
const js = (s) => JSON.stringify(s);
const bit = (att) => att.reduce((n, l) => n | (1 << LANGS.indexOf(l)), 0);

function stamp(t) { return t ? `[${t.y},${t.m},${t.d},'${t.p}']` : '0'; }

/* ⚠⚠⚠ (#R689) THE LICENCE IS WRITTEN AS A VALUE, NOT AS A SENTENCE IN THE HEADER. It was a
   sentence — «sources.html must name Pleiades and its contributors» — addressed to whoever read
   the file next, and nobody did: 739 Pleiades cities shipped with no reader-facing credit at all.
   A `LIC()` declaration is read by scripts/build-hist-cities.mjs, which fails the build unless
   js/reference-data.js carries the row that pays it. See scripts/histcities/lang.mjs. */
function writeRecord(file, rows, header, lic) {
  const licSrc = `export const LICENCE = LIC(${JSON.stringify(lic, null, 2)});`;
  const lines = [header, "import { D, ED, LIC } from './lang.mjs';", '', licSrc, '', 'export const ROWS = ['];
  for (const r of rows) {
    const eras = r.eras.map((e) => {
      const n = {};
      for (const lg of LANGS) if (e.n[lg]) n[lg] = e.n[lg];
      return `    ED(${stamp(e.from)}, ${stamp(e.to)}, ${js(n)}, ${bit(e.attested)})`;
    }).join(',\n');
    const ev = { a: [r.anchor.name, r.anchor.cc, r.anchor.km, r.anchor.pop], r: r.rival ? [r.rival.name, r.rival.cc, r.rival.km] : 0, on: TODAY };
    lines.push(`  D(${js(r.id)}, ${r.lon}, ${r.lat}, ${js(r.cc)}, ${js(r.keys)}, [\n${eras},\n  ], ${js(ev)}),`);
  }
  lines.push('];');
  writeFileSync(join(ROOT, 'scripts', 'histcities', file), lines.join('\n') + '\n');
  const bytes = readFileSync(join(ROOT, 'scripts', 'histcities', file)).length;
  console.log(`✓ wrote scripts/histcities/${file} — ${rows.length.toLocaleString('en-US')} rows, `
    + `${rows.reduce((n, r) => n + r.eras.length, 0).toLocaleString('en-US')} eras, ${(bytes / 1024).toFixed(0)} kB`);
}

const HEAD = (what, src, lic) => `/* ============================================================================
 *  IntMap · HISTORICAL CITY NAMES — ${what}
 * ----------------------------------------------------------------------------
 *  ⚠⚠⚠ MACHINE-GENERATED. Do not edit by hand: the next harvest overwrites it.
 *      node scripts/histcities/harvest.mjs
 *
 *  Source: ${src}
 *  Licence: ${lic}
 *
 *  Every row carries the evidence its guard radius is derived from (\`ev\`) — the settlement the
 *  coordinate resolved to, and the nearest other settlement on Earth answering to one of its
 *  spellings. scripts/build-hist-cities.mjs runs the same arithmetic over it that it runs over
 *  data/histcities-homonyms.json.gz for a handwritten row. See scripts/histcities/harvest.mjs.
 * ==========================================================================*/`;

/* ═══ 8. RUN ═══════════════════════════════════════════════════════════════════════════
   ⚠ ONLY WHEN INVOKED AS A PROGRAM. scripts/histcities-record.mjs imports every .mjs in this
   directory to find out what it is, so a module that downloads 135 MB at import time would make
   `npm run check:histcities` a network operation. */
const MAIN = process.argv[1] && /histcities[\\/]harvest\.mjs$/.test(process.argv[1]);

if (MAIN) {
  console.log(`histcities harvest · ${TODAY}`);
  await oracle();
  if (!ONLY || ONLY === 'wd') {
    const rows = resolveKeys(await harvestWikidata());
    writeRecord('derived-wikidata.mjs', rows,
      HEAD('the modern renamings, from Wikidata', 'Wikidata dated name statements (P1448 / P1705 / P2561 / P1813 qualified with P580 / P582), over the human-settlement subclass closure of Q486972',
        'CC0 1.0 — no attribution required, and none is claimed'), WD_LICENCE);
  }
  if (!ONLY || ONLY === 'ohm') {
    const rows = resolveKeys(await harvestOHM());
    writeRecord('derived-ohm.mjs', rows,
      HEAD('the medieval and early-modern renamings, from OpenHistoricalMap', 'OpenHistoricalMap place=city|town|village|hamlet nodes carrying start_date / end_date, over its own Overpass endpoint',
        'CC0 1.0 — no attribution required; elements declaring any other licence are left out'), OHM_LICENCE);
  }
  if (!ONLY || ONLY === 'pl') {
    const rows = resolveKeys(await harvestPleiades());
    writeRecord('derived-pleiades.mjs', rows,
      HEAD('antiquity, from Pleiades', 'Pleiades gazetteer of the ancient world (pleiades.stoa.org), places-latest JSON-LD',
        'CC BY 3.0 — ATTRIBUTION IS A CONDITION OF REDISTRIBUTION. sources.html must name Pleiades and its contributors.'), PL_LICENCE);
  }
}
