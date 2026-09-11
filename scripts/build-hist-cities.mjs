#!/usr/bin/env node
/* ============================================================================
 *  IntMap · data/hist-cities.json — the name a city carried in the year on the clock   (#R427)
 *  ⚠⚠⚠ …AND WHICH CITY THAT IS — the guard radius                                      (#R521)
 *  ⚠⚠⚠ …AND HOW FAR BACK — two derived upstreams, and the floor that stopped being 1850 (#R679)
 * ----------------------------------------------------------------------------
 *  「都市名ラベルも同じ要領で（Chronos に）対応するように。」 The country labels have travelled
 *  in time since #R94k; scripts/histcities/*.mjs is the same record for SETTLEMENTS, and this
 *  turns it into the one file the app fetches.
 *
 *  ══ ⚠⚠⚠ WHAT #R521 CHANGED, AND WHY «Kochi» WAS NOT ONE BAD ROW ════════════════════════════
 *  A reader travelling to 1950 saw 高知市 relabelled コーチン. The row is right — Kochi in
 *  Kerala WAS Cochin until 1996 — and the row was not the defect. The defect was that a SPELLING
 *  was being used as an IDENTITY: js/hist-cities.js rewrote `ofm-city`'s `text-field` wherever
 *  the tile's own name matched a key, with nothing in the expression that could tell one Kochi
 *  from another. Every city on Earth sharing a spelling with a row was in scope, and the record
 *  holds over a thousand spellings.
 *
 *  So identity is now NAME **AND** PLACE. Each row carries a guard radius `g`; the runtime asks
 *  MapLibre's `distance` expression how far the candidate feature is from the row's coordinate
 *  and only renames it inside that radius. Kochi, Japan is 6 900 km from Kochi, Kerala.
 *
 *  ══ AND THE GATE THAT WAS SUPPOSED TO CATCH IT HAD THE ANSWER DELETED FROM ITS EVIDENCE ═════
 *  #R427's rule was «no other settlement of 20 000+ may carry this spelling», resolved against
 *  data/gazetteer-world.json.gz. That file is built for js/newsgeo.js, which needs ONE point per
 *  spelling, so scripts/build-gazetteer.mjs keeps `the more populous homonym` and drops the rest.
 *  ⚠⚠⚠ THE UNIQUENESS THE GATE WAS ASKED TO PROVE HAD BEEN IMPOSED ON ITS ORACLE. The evidence is
 *  now data/histcities-homonyms.json.gz (scripts/build-histcities-homonyms.mjs): GeoNames
 *  cities500, unfiltered, restricted to the spellings this record actually joins on.
 *
 *  ══ ⚠⚠⚠ WHAT #R679 ADDED, AND WHAT IT REFUSED TO DO ════════════════════════════════════════
 *  「Chronosの歴史的地名…をできる限りすべてを最高レベル品質と精度で網羅するように。私はあなたに
 *    いつの時代までかをここで制限することもしません。」 The record was 611 handwritten cities in
 *  74 countries, and not one of its spans ended before 1867. It now also reads two DERIVED
 *  sources — Wikidata for the modern renamings and Pleiades for antiquity — through
 *  scripts/histcities/harvest.mjs, which writes them out as ordinary record files.
 *
 *  ⚠ THE 611 ARE NOT REPLACED, AND THE REASON IS MEASURED. Forty of them were checked against
 *  Wikidata one by one: name AND span agreed in every era for 16. The other 24 did not fail a
 *  filter — nine have no dated name statement in Wikidata at all, and seven more carry only an
 *  undated statement of their present name. Replacing the record with the upstream would have
 *  deleted three fifths of it. So a written row always wins, a derived row that is the same place
 *  contributes only the spans the written row does not already cover, and nothing here can delete
 *  a written row (⑥ below).
 *
 *  ══ WHAT IS PROVEN HERE, ROW BY ROW ════════════════════════════════════════════════════════
 *   ① THE COORDINATE IS THE CITY. For a WRITTEN row: some settlement carrying one of the row's
 *      spellings, in the row's own country, must sit within ANCHOR_TOL_KM of the row's point. It
 *      found four (Sorokyne, KwaDukuza, Kunming, Kariega). A row GeoNames genuinely does not
 *      carry says so in `unlisted`.
 *      ⚠ FOR A DERIVED ROW THE QUESTION IS ALREADY ANSWERED UPSTREAM — the coordinate is
 *      Wikidata's P625 or Pleiades' reprPoint, not a number anybody typed here — so what this
 *      build checks is the OTHER half: that the harvest found a settlement the label layer draws
 *      within the same tolerance, and the row carries WHICH settlement in `ev.a`. A derived row
 *      that could not be anchored was never written down (see harvest.mjs).
 *   ② THE GUARD SEPARATES. `g` = half the distance to the nearest OTHER settlement answering to
 *      one of the row's spellings — never more than GUARD_MAX_KM, never below the floor. Derived,
 *      not typed, by ONE function (guardFrom, scripts/histcities-record.mjs) over evidence that
 *      comes from the committed homonym index for a written row and from the row's own `ev.r`
 *      for a derived one. ⚠ Both are snapshots of the same GeoNames archive; what differs is
 *      where the answer is stored, not how the radius is computed.
 *   ③ A NAMESAKE INSIDE THE GUARD IS DECLARED, AND THE DECLARATION IS RE-TESTED. Twin towns
 *      (Valga/Valka, 1.2 km) are closer than any radius. Those need `waive`, which names the
 *      other place and asserts the spelling reaches it ONLY through GeoNames' alternate list —
 *      an assertion this build re-checks every run. ⚠ A DERIVED ROW MAY NOT WAIVE ANYTHING: a
 *      waiver is a sentence a person wrote about the world, and nobody wrote eight thousand of
 *      them. The harvest drops the key instead.
 *   ④ KEYS ARE UNIQUE WITHIN A ROW. Distant cities may share a spelling: the runtime groups
 *      their guarded candidates under one match branch. If their evidence-derived guards overlap,
 *      the earlier row retains the key; a spelling cannot resolve competing nearby identities.
 *   ⑤ ERAS are ordered, disjoint, and inside the clock's reach — which is now
 *      js/hist-scale.js's own FLOOR, evaluated rather than copied (see below).
 *   ⑥ THE WRITTEN RECORD IS WHOLE. Every one of the handwritten rows reaches the shipped file.
 *
 *  ⚠ AND THE COMMITTED FILE IS RE-DERIVED, byte for byte, by `--check` (npm run check:histcities,
 *  inside `npm test`) — so data/hist-cities.json cannot drift away from the record.
 *
 *      node scripts/build-hist-cities.mjs            # write data/hist-cities.json
 *      node scripts/build-hist-cities.mjs --check    # re-derive and compare; exit 1 on any drift
 *      node scripts/build-hist-cities.mjs --report   # the coverage table, per language
 *      node scripts/build-hist-cities.mjs --audit    # every row × every namesake, as a table
 *  ══ ⚠⚠⚠ TWO THINGS THIS ROUND MEASURED AND THEN DID NOT DO ═════════════════════════════════
 *  ① AN OPEN START IS STILL OPEN, and under the new floor that is a bigger claim than it was.
 *     `E(0, 1924, 'Tsaritsyn')` used to mean «for the whole reachable past», and the reachable
 *     past was 1850–, so it was true. It now reaches astronomical year −122 999, and the same row
 *     says Volgograd was called Царицын in 10 000 BC. ⚠ THIS IS #R602's SHAPE — lowering a floor
 *     makes paths that were unreachable start lying — and it was checked before being left alone:
 *     the vector tiles under the label are MODERN IN EVERY YEAR, so at 1200 the map is already
 *     drawing a city that did not exist, and the choice is between the name it held 1589–1925 and
 *     the name it has held since 1961. Neither is right and the earlier one is less wrong. The
 *     alternative — clipping open starts to a year nobody wrote down — is the fabricated date
 *     IM-20260824-001 forbids. So the file DECLARES it instead: an open endpoint ships with
 *     precision '-', which is «this record does not say». The runtime marks an open-start
 *     winning name with [?], explained beside Chronos, rather than claiming a known start.
 *  ② THE ROWS THAT MAY NEVER BE DRAWN ARE SHIPPED ANYWAY. `ofm-city` filters on
 *     `class in [city, town]`, so a row whose settlement OSM tags `place=village` can never be
 *     relabelled — #R409's «a row that cannot reach the screen is indistinguishable from one that
 *     works». 1 952 of the 3 205 derived Wikidata rows anchor on a settlement under 10 000 people.
 *     ⚠ BUT THE PROXY WAS CALIBRATED BEFORE IT WAS TRUSTED, against the 605 handwritten rows that
 *     resolve to a GeoNames settlement — rows #R521 checked against real tiles. «under 10 000 and
 *     not an administrative seat» would have thrown out NINE of them (Kuujjuaq 2 668, Arviat
 *     2 864, Naujaat 1 225, Kinngait 1 396, Inukjuak 1 821, Kugluktuk 1 382, Cape Canaveral 9 912,
 *     Trakai 5 530, Khankendi 2 100 — Arctic hamlets that are the only settlement for hundreds of
 *     kilometres and are drawn as towns). A 1.5% error rate against known-good rows is too high to
 *     spend on a saving nothing needs: the file is fetched once, lazily, when the clock first
 *     leaves «now», and 559 kB gzipped is a seventh of data/gazetteer-world.json.gz (#R689: the
 *     third upstream took it from 377 kB, and the file is still fetched once and only on demand).
 *     Expires if `ofm-city`'s filter changes, or if the file has to move into the boot bundle.
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createContext, runInContext } from 'node:vm';
import {
  loadRecord, km, GUARD_M, guardFrom, GUARD_FLOOR_KM, GUARD_HARD_FLOOR_KM,
  ANCHOR_TOL_KM, SAME_PLACE_KM,
} from './histcities-record.mjs';
import { LANGS } from './histcities/lang.mjs';
import { sameName, daysInMonth as daysInMonthLocal } from './histcities/upstream.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'hist-cities.json');
const HOM = join(ROOT, 'data', 'histcities-homonyms.json.gz');

/* ── the numbers, and where each of them comes from ─────────────────────────────────────────── */
const GUARD_MAX_KM = GUARD_M / 1000;
const MEASURED_RATIO = 3;     /* a declared guard must be at least this many times the measured gap */
const ANCHOR_MAX_KM = 40;     /* how far to look for the row's own city before calling it unproven */

/* ⚠⚠⚠ (#R679) THE CLOCK'S FLOOR IS READ FROM THE CLOCK, NOT COPIED FROM IT.
   This constant used to be `const CLOCK_FLOOR = 1850`, with a comment naming js/chronos.js YMIN
   as its source, and the rule it enforced was «a span that ENDS before the floor can never be
   displayed, so shipping it is shipping something invisible» (#R409's lesson, one file over).
   The rule is still right. The number was wrong the moment the clock moved: this round took the
   floor down to astronomical year −122 999, and a copy of «1850» would have gone on rejecting
   every ancient span in the record as unreachable — a gate enforcing a limit the app no longer
   has. #R500 measured what a copied number does; this one evaluates js/hist-scale.js in a vm and
   reads FLOOR off the module it exports. If that file stops exporting a FLOOR, this build stops,
   which is the correct failure: the reachable range is not something to guess at. */
function clockFloor() {
  const src = readFileSync(join(ROOT, 'js', 'hist-scale.js'), 'utf8');
  const ctx = createContext({ window: {} });
  runInContext(src, ctx, { filename: 'js/hist-scale.js' });
  const f = ctx.window.IntMapHistScale && ctx.window.IntMapHistScale.FLOOR;
  if (!Number.isFinite(f)) throw new Error('js/hist-scale.js no longer exports a numeric FLOOR — the reachable range of the clock cannot be assumed');
  return f;
}
const CLOCK_FLOOR = clockFloor();
const NOW_Y = new Date().getUTCFullYear();

const argv = process.argv.slice(2);
const MODE = argv.includes('--check') ? 'check' : argv.includes('--report') ? 'report'
  : argv.includes('--audit') ? 'audit' : 'write';

const problems = [];
const warnings = [];
function fail(msg) { console.error('✖ ' + msg); process.exit(1); }

/* ── the record, and the evidence ───────────────────────────────────────────────────────────── */
const { files: REGIONS, rows: allRows, licences: LICENCES } = await loadRecord();

/* ── ⚠⚠⚠ (#R689) ⑦ EVERY UPSTREAM THAT IS OWED CREDIT IS PAID BY A ROW OF THE SOURCES PAGE ────
   #R679 harvested Pleiades, whose CC BY 3.0 makes attribution a CONDITION OF REDISTRIBUTION, and
   wrote that condition into the generated file's header as a sentence: «sources.html must name
   Pleiades and its contributors». 739 Pleiades cities then shipped inside data/hist-cities.json
   and no reader-facing page named Pleiades at all. ⚠ NOTHING WAS SUPPOSED TO CATCH IT: the
   licence was prose, and prose is addressed to whoever reads the file next.
   ⚠ THE UNIVERSE IS THE RECORD, NOT A LIST. loadRecord() demands a LIC() declaration from any
   file whose rows are derived, so this gate sees the next upstream on the day it is harvested
   without anybody remembering to add it here (#R429). What it compares is a VALUE — the exact
   `n` string of the DATA_SOURCES row — and not two people's idea of the same name. */
{
  const reg = readFileSync(join(ROOT, 'js', 'reference-data.js'), 'utf8');
  const arr = /const DATA_SOURCES=\[[\s\S]*?\n  \];/.exec(reg);
  if (!arr) problems.push('js/reference-data.js no longer holds DATA_SOURCES as one array literal, so the credit this record owes cannot be proven paid');
  else {
    for (const l of LICENCES) {
      if (!l.attribution) continue;
      if (!arr[0].includes(l.source)) {
        problems.push(`scripts/histcities/${l._file} ships ${l.rows} rows from ${l.publisher} under ${l.licence}, which makes credit a condition of redistribution, and js/reference-data.js has no DATA_SOURCES row «${l.source}» to pay it`);
      }
    }
  }
}
let HOMONYMS;
try { HOMONYMS = JSON.parse(gunzipSync(readFileSync(HOM)).toString('utf8')); }
catch (_) { fail('data/histcities-homonyms.json.gz is missing or unreadable — run `node scripts/build-histcities-homonyms.mjs`'); }

/* ⚠ THE ORDER IS THE PRECEDENCE. A handwritten row is looked at first, keeps every key it has and
   every span it states; a derived row is merged into it or takes what is left. Wikidata before
   Pleiades because the two overlap only on cities that have both a modern and an ancient name,
   and the modern rename is the one a reader is more likely to be looking for. */
const RANK = { hand: 0, 'derived-wikidata.mjs': 1, 'derived-pleiades.mjs': 2 };
const rank = (r) => (r.derived ? (RANK[r._file] === undefined ? 3 : RANK[r._file]) : 0);
const rows = allRows.slice().sort((a, b) => rank(a) - rank(b));
const handCount = rows.filter((r) => !r.derived).length;

/* ── era arithmetic, over both shapes of span ────────────────────────────────────────────────
   A written era states whole years (`E(1914, 1923, …)`, 0 = open). A derived one states a stamp
   with a precision (`ED([1914,0,0,'y'], …)`). Everything below asks these two functions rather
   than reading the fields, so a rule cannot accidentally apply to one shape and not the other. */
const isStamp = (v) => v && typeof v === 'object';
/** the first instant of a span endpoint, as the shipped YYYYMMDD integer; 0 = open */
function dnum(v, end) {
  if (!v) return 0;
  if (!isStamp(v)) return v ? v * 10000 + (end ? 1231 : 101) : 0;
  const m = v.m || (end ? 12 : 1);
  const d = v.d || (end ? dim(v.y, m) : 1);
  return v.y * 10000 + m * 100 + d;
}
function dim(y, m) {
  if (m === 2) return (y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)) ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 30;
}
/** the year of an endpoint, or null when it is open */
const yr = (v) => (!v ? null : isStamp(v) ? v.y : v);
/** ⚠ THE PRECISION IS PART OF THE ANSWER (IM-20260824-001). A written row states whole years, so
    its endpoints are 'y'; an open end is '-', which is «this record does not say», not «now». */
const prec = (v) => (!v ? '-' : isStamp(v) ? v.p : 'y');
/* ⚠⚠⚠ (#R679) DOES THIS SPAN SAY WHEN IT BEGAN? An open endpoint means «this record does not
   constrain that end» — it is NOT a claim to own everything on the other side of it. That is
   #R604's rule for OHM's «*_decdate», one layer over, and the two rules below are the same
   sentence applied to this file. ⚠ EVERY rule that treats the two shapes differently asks THIS
   function, so it is attached to the fact «the span states a start» and not to any one call
   site (#R429). There is no matching statesEnd(): the record holds 2 537 open starts and, as
   measured this round, ZERO open ends — writing a rule for a shape nothing has would be a rule
   nothing can test. Add it the day an upstream files one. */
const statesStart = (e) => !!e.from;

/* ── ⑥ + the merge: a derived row that is the same place as an earlier row is not a second city ─
   ⚠⚠⚠ THE JOIN IS POSITION **AND** NAME, for the reason the guard exists at all (#R521). Two
   cities ten kilometres apart are two cities; the same city filed twice by two upstreams shares
   a spelling. Neither test alone is enough, and «same QID» is not available — the handwritten
   record has no QIDs, and Wikidata itself does not keep one city on one item (Byzantium and
   Constantinople are Q16869, Istanbul is Q406, and P1365 connects only 9% of ancient places to
   their modern successor). So the identity of a place here is where it is plus what it is called.
   ⚠ AND THE MERGE IS ADDITIVE. The host row keeps its own keys and its own spans; the derived
   row contributes only spans that overlap nothing the host already states. A derived row cannot
   move a coordinate, widen a guard, or contradict a written date. */
const fkey = (s) => String(s || '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
function samePlace(a, b) {
  if (km(a.lon, a.lat, b.lon, b.lat) > ANCHOR_TOL_KM) return false;
  const A = new Set(a.keys.map(fkey));
  return b.keys.some((k) => A.has(fkey(k)));
}
const spanOf = (e) => [dnum(e.from, false) || -Infinity, dnum(e.to, true) || Infinity];
/* ⚠⚠⚠ (#R679) A HOST SPAN THAT NEVER SAID WHEN IT BEGAN DOES NOT COVER THE PAST.
   Measured: the handwritten Istanbul row is one span, `E(0, 1929, 'Constantinople')`, and
   Pleiades files TEN DATED PERIODS for the same point (pl-520998) — Kōnstantinoupolis −1200…299,
   Constantinopolis 300…631, Quṣtanṭīnīya 632…750, … Ḳosṭanṭıniyye 1919…1923. All ten were
   discarded here as «already covered», because an open start reaches −Infinity, and the shipped
   map answered «Constantinople» for 300 BC — six centuries before the city was founded under that
   name. THE UNDATED CLAIM WAS EVICTING THE DATED EVIDENCE. (Six of the ten reach the file; the
   other four lose to DATED Wikidata spans for the same years, which is RANK doing its job.)
   So coverage is only ever asserted by a span that states a start. The converse still holds: a
   span with both ends written down covers exactly what it says, and a derived span inside it is
   still dropped. ⚠ Expires if the record ever gains open ENDS (see statesStart above) — an open
   end would need the same treatment on the other side. */
/* ⚠ AND «COVERED» IS ASYMMETRIC, which is the same rule read from the other side. Measured while
   fixing the above: 137 rows are a handwritten open-start span (Harare/«Salisbury», Kananga/
   «Luluabourg») joined by a derived row whose statement is ALSO undated — usually the very same
   name. Two undated spans over one place is the ambiguity this whole change is about, arriving
   from the other direction: neither is more specific, so nothing could decide which one nameAt()
   should reach. There the earlier row wins, by the precedence RANK already sets (a written row
   always wins), and the derived duplicate is dropped. ⚠ What is NOT done is inventing a start for
   either of them — a fabricated date is IM-20260824-001. */
function alreadyCovered(e, eras) {
  if (!statesStart(e)) return eras.some((x) => !statesStart(x));
  const [f, t] = spanOf(e);
  return eras.some((x) => { if (!statesStart(x)) return false; const [xf, xt] = spanOf(x); return f <= xt && xf <= t; });
}
/* ⚠⚠⚠ AND THE ORDER IS THE ANSWER. js/hist-cities.js's nameAt() returns the FIRST span that
   contains the year, so once a dated span may overlap an open one, which of them a reader sees is
   decided by this comparator and by nothing else. THE MORE SPECIFIC EVIDENCE ANSWERS FIRST: spans
   that state a start, in chronological order, then the spans that do not. ⚠ Array#sort is stable
   in Node, so spans that tie keep the order the record wrote them in.
   ⚠⚠ AND WHAT THAT COSTS WAS MEASURED, NOT ASSUMED. All 221 spans this change lets through fall
   inside the reach of the open span they used to be hidden by — that is the mechanism — so in 103
   cities a dated span now answers years an undated handwritten one used to answer alone. In 34 of
   them (115 spans) the dated span is attested in NONE of the nine languages (the «a» bitmask is 0), so every
   language shows its Latin/other-script column: Istanbul in 1900 reads «Цариград» (Wikidata,
   1453-06-07…1923-10-23) where it used to read «Constantinople» in all nine. Both are true; the
   dated one is the one with evidence behind its dates, and the answer it replaced at 300 BC was
   «Constantinople», which is false by six centuries. ⚠ THE 34 ARE NOT A FIXED COST — an
   attestation axis in this comparator would be a second, different rule, and it belongs to
   whoever measures whether a name a reader cannot read is worse than a name with a worse date. */
const eraOrder = (x, y) => (statesStart(y) ? 1 : 0) - (statesStart(x) ? 1 : 0) || (spanOf(x)[0] - spanOf(y)[0]);

const merged = { rows: 0, eras: 0, dropped: 0, intoHand: 0 };
const kept = [];
for (const r of rows) {
  if (!r.derived) { kept.push(r); continue; }
  /* only rows near enough to be worth comparing — the record is thousands of rows now */
  const host = kept.find((h) => samePlace(h, r));
  if (!host) { kept.push(r); continue; }
  merged.rows++;
  if (!host.derived) merged.intoHand++;
  for (const e of r.eras) {
    if (alreadyCovered(e, host.eras)) { merged.dropped++; continue; }
    host.eras.push(e);
    merged.eras++;
  }
  host.eras.sort(eraOrder);
}

/* ── ①②③ identity: which city, how far the guard may reach, and what still needs saying ────── */
const audit = [];
const seenId = new Map(), seenKey = new Map();
const final = [];
for (const r of kept) {
  const at = `${r._file} «${r.id}»`;
  if (seenId.has(r.id)) problems.push(`duplicate id «${r.id}» (${seenId.get(r.id)} and ${r._file})`);
  seenId.set(r.id, r._file);

  /* eras: ordered most-specific-first, disjoint WHERE BOTH STATE A START, inside the record's
     reach, and never merely restating the modern name.
     ⚠ THE SORT IS NOT THE MERGE'S BUSINESS, it is every row's: a row nothing merged into is read
     by the same nameAt(), so the ordering rule is applied here, to all 4 000 of them. */
  r.eras.sort(eraOrder);
  let prevEnd = null, openStart = null;
  const eras = [];
  for (const e of r.eras) {
    const t = yr(e.to);
    /* ⚠ A START BELOW THE FLOOR IS NOT A DEFECT. #R409's rule is about what can REACH THE SCREEN,
       and a span that begins before the clock's earliest year but ends after it is on screen for
       every year the reader can actually visit — Pleiades files a palaeolithic site starting at
       −2 600 000, and the only thing that means is «for as long as you can travel». What can
       never be drawn is a span that has ENDED before the floor, and that is still refused. */
    if (t !== null && t > NOW_Y) problems.push(`${at}: era «${e.name.en}» ends in ${t}, in the future`);
    if (t !== null && t < CLOCK_FLOOR) problems.push(`${at}: era «${e.name.en}» ends in ${t}, before the clock's floor of ${CLOCK_FLOOR} (js/hist-scale.js FLOOR) — no reader can ever reach a year where it would be drawn, so it is shipped and invisible.`);
    const fs = dnum(e.from, false) || -Infinity;
    /* ⚠⚠⚠ (#R679) THIS RULE WAS RELAXED IN EXACTLY ONE DIRECTION, and the direction is the fix
       above. A dated span overlapping an open-start span is now the CORRECT state — that is what
       «ten dated Pleiades periods under one undated Constantinople» looks like once the dated ones
       are allowed through — and eraOrder guarantees the dated one is reached first. Two spans that
       BOTH state a start may still not overlap: there the record would be answering one year with
       two names and nothing could decide between them. Two spans that both leave the start open is
       the same ambiguity from the other side, so it is refused too (the record holds none). */
    if (statesStart(e)) {
      if (prevEnd !== null && fs <= prevEnd) problems.push(`${at}: era «${e.name.en}» starts at ${fs}, which overlaps the previous span ending ${prevEnd} — both state when they began, so the record is giving one year two names`);
    } else if (openStart) {
      problems.push(`${at}: era «${e.name.en}» leaves its start open, and so does «${openStart}» — neither is more specific than the other, so nothing decides which one nameAt() reaches first. One of the two has to say when it began.`);
    }
    /* ⚠⚠⚠ (#R679) THE NINE-LANGUAGE RULE IS ASKED OF THE HANDWRITTEN RECORD ONLY, and splitting
       it is not a relaxation — it is the difference between two different claims. A zero in a
       handwritten row is a person saying «this place has no established Korean form», and the
       build is right to demand that somebody made that judgement for all nine. A derived row
       cannot make that judgement about anything: measured over the whole Wikidata corpus the
       nine are served 2 465 (ru) / 919 (ja) / 800 (fr) / 511 (es) / 458 (de) / 303 (en) /
       278 (zh-cn) / 64 (zh) / 5 (ko) times, and not one of the six cities this round tested by
       hand has all nine. Requiring nine there would either delete the harvest or invent
       transliterations, and inventing them would make the past claim more than the present does.
       ⚠ SO THE FILE SAYS WHICH ONES ARE REAL. Every era ships an `a` bitmask over `langs`, and a
       language whose bit is clear is showing the Latin/English column — exactly what the live map
       already does for a settlement OSM carries no tag for (js/place-labels.js coalesces
       name:zh-Hant → name:zh → name:en → name:latin). The fallback is no longer silent. */
    /* ⚠ (#R679) THE QUESTION IS WHO WROTE THIS SPAN, NOT WHICH ROW IT ENDED UP ON — the same
       correction the coverage table already carries below. Since the open-start fix, a handwritten
       row hosts dated derived spans as a matter of course (Istanbul hosts six), and asking the
       upstream for nine hand-written forms would be asking a question it cannot answer. */
    if (!e.name._derived) for (const lg of LANGS) if (!e.name[lg]) problems.push(`${at}: era «${e.name.en}» has no ${lg} form`);
    if (!e.name.en) problems.push(`${at}: era has no English form`);
    /* ⚠ AN ERA THAT RESTATES A KEY CHANGES NOTHING ON SCREEN. A handwritten row saying so is a
       mistake somebody made and must be told about; a derived row saying so is the upstream
       filing the present name with an end date, which happens (Medina/المدينة المنورة), and the
       answer is to drop the span, not to stop the build over somebody else's data. */
    if (r.keys.some((k) => k === e.name.en)) {
      /* ⚠ same correction, and here it is load-bearing: «serdar-tm» is a handwritten row onto which
         Wikidata merges an undated span restating the present name. Stopping the build over that
         would be blaming the record for somebody else's data. The span is dropped either way. */
      if (!e.name._derived) problems.push(`${at}: era name «${e.name.en}» is also a modern key — nothing would change`);
      continue;
    }
    eras.push(e);
    if (statesStart(e)) prevEnd = dnum(e.to, true) || Infinity; else openStart = e.name.en;
  }
  r.eras = eras;
  if (!eras.length) { merged.dropped++; continue; }

  /* ④ One spelling can identify distant cities. Keep separate point identities when their
     evidence-derived guards do not overlap; retain earlier-source precedence otherwise.
     Earlier rows have already been audited. Derived rows carry the same rival distance that
     the audit below uses, so no larger radius or fabricated identity enters this join. */
  const candidateGuardKm = r.derived ? guardFrom(r.ev && r.ev.r ? r.ev.r[2] : Infinity) : GUARD_MAX_KM;
  const hits = [];
  const keys = [];
  for (const k of r.keys) {
    if (!k) { problems.push(`${at}: empty key`); continue; }
    if (keys.includes(k)) { problems.push(`${at}: duplicate key «${k}» within one row`); continue; }
    const prior = seenKey.get(k) || [];
    const ambiguous = prior.find((p) => {
      const proof = audit.find((a) => a.r === p);
      /* Match the shipped radii, which are rounded down to 100 metres. */
      const left = Math.floor(candidateGuardKm * 10) / 10;
      const right = Math.floor((proof ? proof.guardKm : GUARD_MAX_KM) * 10) / 10;
      return km(p.lon, p.lat, r.lon, r.lat) <= left + right;
    });
    if (ambiguous) {
      if (!r.derived) problems.push(`${at}: key «${k}» cannot spatially separate this row from «${ambiguous.id}»`);
      continue;
    }
    keys.push(k);
  }
  if (!keys.length) {
    if (!r.derived) problems.push(`${at}: every key is spoken for — a written row must keep at least one`);
    merged.dropped++;
    continue;
  }
  for (const k of keys) seenKey.set(k, [...(seenKey.get(k) || []), r]);
  r.keys = keys;

  /* ⚠ the two proof paths meet here: a written row's namesakes come out of the committed index,
     a derived row's out of the evidence the harvest wrote into it. Same arithmetic either way. */
  let anchor = null, nearestRival = null, guardKm;
  if (!r.derived) {
    for (const k of r.keys) {
      const found = HOMONYMS.keys[k];
      if (!found) { problems.push(`${at}: key «${k}» is not covered by data/histcities-homonyms.json.gz — run \`node scripts/build-histcities-homonyms.mjs\` so the spelling is resolved against GeoNames before it ships`); continue; }
      for (const h of found) {
        hits.push({ k, name: h[0], cc: h[1], lon: h[2], lat: h[3], pop: h[4], fcode: h[5], field: h[6], d: km(r.lon, r.lat, h[2], h[3]) });
      }
    }
    /* ① the anchor: the biggest settlement near this point that answers to one of the row's
       spellings AT ALL — an alternate name proves «this coordinate is that city» perfectly well. */
    const near = hits.filter((h) => h.d <= ANCHOR_MAX_KM);
    anchor = near.filter((h) => h.cc === r.cc).sort((a, b) => b.pop - a.pop)[0] || null;
    if (!anchor) {
      if (!r.unlisted) {
        const other = near.sort((a, b) => a.d - b.d)[0];
        problems.push(other
          ? `${at}: the nearest settlement answering to any of these spellings is ${other.name} in ${other.cc} (${Math.round(other.d)} km), and the row declares ${r.cc} — either the coordinate or the country is wrong`
          : `${at}: GeoNames cities500 carries no settlement under any of ${r.keys.map((k) => '«' + k + '»').join(', ')} — the coordinate cannot be proven, and the guard radius is centred on it. Fix the spelling, or declare { unlisted: '…why…' }.`);
      }
    } else if (anchor.d > ANCHOR_TOL_KM) {
      problems.push(`${at}: the coordinate is ${anchor.d.toFixed(1)} km from ${anchor.name} (${anchor.cc}, pop ${anchor.pop.toLocaleString('en-US')}), which is the settlement these spellings name. The guard radius is centred on the coordinate, so the era name would simply never appear. Move it to ${anchor.lon}, ${anchor.lat}.`);
    } else if (r.unlisted) {
      problems.push(`${at}: declares «unlisted», but ${anchor.name} (${anchor.cc}) resolves ${anchor.d.toFixed(1)} km away — drop the declaration`);
    }

    /* ② the guard. ⚠ WHICH FIELD MATCHED IS THE WHOLE QUESTION HERE. OpenMapTiles carries OSM's
       `name` and `name:*`; GeoNames' alternate list is a pile of exonyms, former names and
       transliterations that no tile is labelled with. A namesake under its OWN name is a live
       mislabel waiting for a radius that reaches it; a namesake in the alternate list is a claim
       to be read, which is what ③ is for.
       ⚠ «the same place, listed twice» IS A CLAIM ABOUT ONE COUNTRY'S OWN FILING, so the collapse
       is only allowed inside the row's country. A border does not run through a duplicate record —
       but it does run between Valga and Valka, which are 2.3 km apart and are two towns. */
    const elsewhere = (h) => !anchor || h.cc !== anchor.cc || km(anchor.lon, anchor.lat, h.lon, h.lat) > SAME_PLACE_KM;
    const rivals = hits.filter((h) => h.field !== 'alt' && elsewhere(h)).sort((a, b) => a.d - b.d);
    nearestRival = rivals[0] || null;
    guardKm = guardFrom(nearestRival ? nearestRival.d : Infinity);
    if (guardKm < GUARD_FLOOR_KM) {
      const m = r.measured;
      const rival = `${nearestRival.name} (${nearestRival.cc}, pop ${nearestRival.pop.toLocaleString('en-US')}) is only ${nearestRival.d.toFixed(1)} km away and carries «${nearestRival.k}» as its own name, so the guard shrinks to ${guardKm.toFixed(1)} km`;
      if (!m) {
        problems.push(`${at}: ${rival} — below the ${GUARD_FLOOR_KM} km floor, which is what a row gets when nobody has measured the gap between its coordinate and the node the tiles draw. Either drop the key, or measure that gap against a real tile and declare { measured: { km, on, why } }.`);
      } else if (guardKm < GUARD_HARD_FLOOR_KM) {
        problems.push(`${at}: ${rival} — below the ${GUARD_HARD_FLOOR_KM} km hard floor, which no measurement can lift: at ofm-city's minzoom of 3 the tile's own quantisation is ±0.61 km, so a guard this small is decided by rounding. Drop the key.`);
      } else if (guardKm < m.km * MEASURED_RATIO) {
        problems.push(`${at}: ${rival}, but the row measured its label ${m.km} km from this coordinate (${m.on}) — the guard must be at least ${MEASURED_RATIO}× that, and ${guardKm.toFixed(1)} km is not. Re-measure, or drop the key.`);
      }
    } else if (r.measured) {
      problems.push(`${at}: declares «measured», but the guard is ${guardKm.toFixed(1)} km, at or above the ${GUARD_FLOOR_KM} km floor — the declaration excuses nothing, so it should go`);
    }

    /* ③ a namesake INSIDE the guard: declared, named, and re-tested */
    const inside = hits.filter((h) => h.d <= guardKm && elsewhere(h));
    const claimed = new Set();
    for (const h of inside) {
      const w = (r.waive || []).find((x) => x.key === h.k && x.place === h.name && x.cc === h.cc);
      if (!w) {
        problems.push(`${at}: ${h.name} (${h.cc}, pop ${h.pop.toLocaleString('en-US')}) is ${h.d.toFixed(1)} km away — inside the ${guardKm.toFixed(1)} km guard — and answers to «${h.k}» (matched on its ${h.field}). Either drop the key, or declare { waive: [{ key: '${h.k}', place: '${h.name}', cc: '${h.cc}', why: '…' }] } and say why no tile carries that spelling for it.`);
      } else {
        claimed.add(w);
        if (h.field !== 'alt') {
          problems.push(`${at}: the waiver for ${h.name} (${h.cc}) says the spelling «${h.k}» reaches it only through GeoNames' alternate list — but GeoNames now carries it as that place's ${h.field === 'name' ? 'own name' : 'ASCII name'}. The waiver has stopped being true; a tile can carry that label now.`);
        }
      }
    }
    for (const w of (r.waive || [])) {
      if (!claimed.has(w)) problems.push(`${at}: the waiver for ${w.place} (${w.cc}) under «${w.key}» no longer matches anything inside the guard — the finding it excuses is gone, so the waiver should go too`);
    }
    audit.push({ r, anchor, nearestRival, guardKm, hits, inside });
  } else {
    /* the derived path: the evidence travels with the row, and the same function reads it */
    const ev = r.ev;
    anchor = { name: ev.a[0], cc: ev.a[1], d: ev.a[2], pop: ev.a[3], lon: r.lon, lat: r.lat };
    if (!(anchor.d <= ANCHOR_TOL_KM)) problems.push(`${at}: the harvest anchored this row ${anchor.d} km away, past the ${ANCHOR_TOL_KM} km tolerance — re-run scripts/histcities/harvest.mjs`);
    nearestRival = ev.r ? { name: ev.r[0], cc: ev.r[1], d: ev.r[2], pop: 0, k: r.keys[0], field: 'name' } : null;
    guardKm = guardFrom(nearestRival ? nearestRival.d : Infinity);
    if (guardKm < GUARD_FLOOR_KM) {
      problems.push(`${at}: the evidence puts ${nearestRival.name} (${nearestRival.cc}) ${nearestRival.d} km away, which is under the ${GUARD_FLOOR_KM} km floor. A derived row has no waiver to fall back on — harvest.mjs should have dropped the key.`);
    }
    audit.push({ r, anchor, nearestRival, guardKm, hits: [], inside: [] });
  }
  final.push(r);
}

/* ⑥ nothing may delete a written row */
const handShipped = final.filter((r) => !r.derived).length;
if (handShipped !== handCount) {
  problems.push(`the handwritten record holds ${handCount} cities and only ${handShipped} reached the file — a derived source may add to the record, never subtract from it`);
}

if (problems.length) {
  console.error(`\n✖ hist-cities: ${problems.length} problem(s)\n`);
  for (const p of problems.slice(0, 60)) console.error('  · ' + p);
  if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`);
  process.exit(1);
}

/* ── ⚠⚠⚠ (#R689) TWO SPANS THAT STATE THE SAME NAME SHARE WHAT EACH OF THEM KNOWS ───────────
   #R679 shipped the ordering that lets DATED evidence answer before an undated claim, measured
   what that costs a reader, and left the cost standing: at 1900 Istanbul reads «Цариград» where it
   used to read «Constantinople» in all nine languages, because the dated span is attested in none
   of them. It named the open question exactly — «whoever measures whether a name a reader cannot
   read is worse than a name with a worse date» — and turned down three ways of answering it, all
   three of which worked by REORDERING the spans, and all three of which therefore risked putting
   «Constantinople» back in 300 BC.

   ⚠ THE ORDER IS NOT WHAT IS WRONG. Re-measured over 1,634 instants and every city: 324,259
   answers show a winning span with no form in the reader's language while another covering span
   has one — and in 67.6% of them THE TWO SPANS ARE STATING THE SAME NAME. Volgograd is the shape:
   OpenHistoricalMap dates «Царицынъ» to 1589–1917, the handwritten row holds the same name as
   «Tsaritsyn / Царицын / ツァリーツィン» in eight languages and cannot say when it began. Answering
   with the Cyrillic form for an English reader is not a date problem and no reordering fixes it;
   the record simply had the English spelling filed on a different row of the same city.

   ⇒ A span may take a language column from another span OF THE SAME PLACE that states THE SAME
   NAME. Nothing is reordered, so no year gets a different name and the 300 BC answer cannot come
   back. Nothing is invented either: every column added was written down by somebody about this
   name, and the attestation bit that ships says so as truthfully afterwards as before.
   ⚠ «THE SAME NAME» IS A MEASURE, NOT A TABLE (#R515). It is sameName() — the same bigram
   agreement the harvest uses to decide whether a settlement answers to a spelling — asked over
   every distinct form each span offers, so «Царицынъ»/«Царицын» agree and «Βυζάντιον»/
   «Constantinople» do not. What is left after this pass is the honest residue: Hippo Regius beside
   Bône, Saldae beside Bougie — DIFFERENT names, where the era's own name is the right answer and
   the other span is the undated one that should not have been reaching that year anyway.
   ⚠ AND IT OVERRULES A HANDWRITTEN ZERO, WHICH IS DELIBERATE. N()'s zero says «no established form
   in this language»; a sibling span of the same name that HAS one is evidence against that, and
   evidence outranks an absence. The count is printed below. */
const alias = { spans: 0, cols: 0, hand: 0 };
for (const r of final) {
  const formsOf = (e) => [...new Set(LANGS.map((lg) => e.name[lg]).filter(Boolean))];
  const F = r.eras.map(formsOf);
  for (let i = 0; i < r.eras.length; i++) {
    const a = r.eras[i];
    let got = 0;
    for (let k = 0; k < r.eras.length; k++) {
      if (k === i) continue;
      const b = r.eras[k];
      /* ⚠⚠⚠ THE TWO SPANS HAVE TO OVERLAP IN TIME, AND THAT IS NOT A DETAIL. A measure of string
         agreement cannot tell «Царицынъ → Царицын» (one name, an orthographic reform) from
         «Кирово → Кіровоград» (two names, a renaming) — dice puts both above the floor, in every
         language, because a city's successor name is usually built out of its predecessor.
         What tells them apart is the CLOCK: two spans that overlap are two accounts of the same
         instant, so if they also state the same name they are the same claim; two spans that do
         not overlap are a SUCCESSION, and a succession of similar strings is exactly the renaming
         this record exists to show. Measured with the overlap test off: the 1934–1938 «Kirovo» span
         took Korean 키로보흐라드 — «Kirovohrad», the name it was about to be given — and the
         «Port Arthur» span (…1904) took Korean 뤼순 from «Ryojun» (1905–1945). Both are the NEXT
         name, put in front of a reader as the name of a year it did not belong to. */
      const lo = Math.max(spanOf(a)[0], spanOf(b)[0]), hi = Math.min(spanOf(a)[1], spanOf(b)[1]);
      if (lo > hi) continue;
      if (!F[i].some((x) => F[k].some((y) => sameName(x, y)))) continue;
      for (const lg of LANGS) {
        if (a.name._has[lg] || !b.name._has[lg] || !b.name[lg]) continue;
        a.name[lg] = b.name[lg];
        a.name._has[lg] = true;
        got++;
      }
    }
    if (got) { alias.spans++; alias.cols += got; if (!r.derived) alias.hand++; }
  }
}

/* ── ⚠⚠⚠ (#R689) ONE NAME HELD WITHOUT INTERRUPTION IS ONE SPAN, NOT THREE ─────────────────
   OpenHistoricalMap files a node per ADMINISTRATIVE event, not per renaming, so Nálepkovo arrives
   as «Merény 1450–1724 · Merény 1725–1871 · Merény 1872–1918» — three true statements about one
   uninterrupted name. Measured before this was written: 605 spans across 462 cities are a repeat
   of the span immediately before them. Nothing a reader sees changes (nameAt() returns the first
   span containing the instant, and it returned «Merény» either way); what changes is that the file
   stops calling them three historical names, which is the number every document quoting this
   record repeats.
   ⚠ ONLY WHERE THERE IS NO GAP. A name that lapsed and came back is two spans and must stay two —
   the join is «the next span begins the very day after this one ends», computed the way
   scripts/histcities/harvest.mjs computes dayBefore(), by integer arithmetic on (y, m, d) and
   never through Date.UTC, which maps every year under 100 to y + 1900 (#R602).
   ⚠ AND THE PRECISION FOLLOWS THE ENDPOINT THAT SURVIVES. The merged span keeps the earlier
   span's start and the later one's end, so `p` is those two endpoints' own precisions and no
   endpoint gains a certainty its source did not state. */
const collapsed = { spans: 0, rows: 0 };
{
  const dayAfter = (t) => {
    let { y, m, d } = { y: t.y, m: t.m || 12, d: t.d || 0 };
    if (!t.d) d = daysInMonthLocal(y, m);
    d += 1;
    if (d > daysInMonthLocal(y, m)) { d = 1; m += 1; if (m > 12) { m = 1; y += 1; } }
    return y * 10000 + m * 100 + d;
  };
  for (const r of final) {
    const out = [];
    let gone = 0;
    for (const e of r.eras) {
      const prev = out[out.length - 1];
      const same = prev && LANGS.every((lg) => prev.name[lg] === e.name[lg]);
      /* both must state their ends, and the later must state its start, or «no gap» is not a
         question this record can answer */
      if (same && prev.to && e.from && dnum(e.from, false) === dayAfter(prev.to)) {
        prev.to = e.to;
        gone++;
        continue;
      }
      out.push(e);
    }
    if (gone) { r.eras = out; collapsed.spans += gone; collapsed.rows++; }
  }
}

/* ── the file ──────────────────────────────────────────────────────────────────────────────── */
/* rounded DOWN to 100 m: a derived number that is re-derived from an external dump should not
   churn the shipped file over a metre, and rounding down never lets a guard grow. */
/* ⚠⚠⚠ (#R689) THE SOURCE LETTER IS DERIVED FROM THE FILE THAT HOLDS THE ROW. It used to read
   `r._file === 'derived-pleiades.mjs' ? 'p' : 'w'` — a list of one, which answers 'w' for every
   upstream that is not Pleiades. This round added a third, and that expression would have shipped
   2,000-odd OpenHistoricalMap rows labelled «Wikidata» with nothing red anywhere. The letter is now
   the first character of the file's own name, checked for collisions here, so the next upstream is
   right on the day it is harvested (#R429: the rule belongs to the fact, not to a call site). */
const SRC_CODE = new Map();
for (const f of REGIONS) {
  const m = /^derived-([a-z0-9]+)\.mjs$/.exec(f);
  if (!m) continue;
  const code = m[1][0];
  if (code === 'h') problems.push(`scripts/histcities/${f} would ship under the letter «h», which data/hist-cities.json already spends on the handwritten record — rename the file`);
  for (const [g, c] of SRC_CODE) if (c === code) problems.push(`scripts/histcities/${f} and ${g} would both ship under the letter «${code}» — the shipped record could not tell them apart`);
  SRC_CODE.set(f, code);
}
const guardOf = (r) => Math.floor(audit.find((a) => a.r === r).guardKm * 10) * 100;
const bitOf = (name) => {
  let n = 0;
  for (let i = 0; i < LANGS.length; i++) if (name._has && name._has[LANGS[i]]) n |= 1 << i;
  return n;
};
const out = {
  v: 3,
  src: `scripts/histcities/ — ${REGIONS.length - LICENCES.length} handwritten region files plus `
    + `${LICENCES.length} derived from upstreams; built by scripts/build-hist-cities.mjs`,
  /* ⚠ (#R689) THE RIGHTS TRAVEL WITH THE DATA. A reader who has this file and not the repository
     still has to be able to see whose work is in it and under what terms — and a shipped file
     that carries its own licence is the thing a gate can check against the Sources page. */
  rights: LICENCES.map((l) => ({ publisher: l.publisher, licence: l.licence, url: l.url, attribution: l.attribution })),
  note: 'Outside every span the modern tile label stands. `g` is the guard radius in metres: a tile label is renamed '
    + 'only if its own spelling is one of `k` AND it lies within `g` of (lon, lat). `f`/`t` are signed YYYYMMDD '
    + '(negative years are astronomical, so -330 is 331 BC). `p` is the precision of those two endpoints — d day, '
    + 'm month, y year, c a period boundary from a vocabulary rather than a date, - open. `a` is a bitmask over '
    + '`langs`: a clear bit means no source writes that name in that language and the English/Latin column stands. '
    + '`s` is the source: h the handwritten record, '
    + [...SRC_CODE].map(([f, c]) => `${c} ${/^derived-([a-z0-9]+)/.exec(f)[1]}`).join(', ') + '.',
  langs: LANGS,
  cities: final.map((r) => ({
    id: r.id,
    lon: +r.lon.toFixed(4),
    lat: +r.lat.toFixed(4),
    cc: r.cc,
    s: r.derived ? SRC_CODE.get(r._file) : 'h',
    g: guardOf(r),
    k: r.keys.slice(),
    e: r.eras.map((e) => {
      const n = {};
      for (const lg of LANGS) n[lg] = e.name[lg];
      return { f: dnum(e.from, false), t: dnum(e.to, true), p: prec(e.from) + prec(e.to), a: bitOf(e.name), n };
    }),
  })),
};
const text = JSON.stringify(out) + '\n';

/* ── the coverage table: what «no established form» actually costs, measured ────────────────── */
const eraCount = final.reduce((n, r) => n + r.eras.length, 0);
const keyCount = final.reduce((n, r) => n + r.keys.length, 0);
/* ⚠ THE SPLIT IS BY WHERE THE SPAN CAME FROM, NOT BY WHICH ROW IT ENDED UP ON. 78 derived spans
   are merged onto handwritten rows, and counting those as handwritten would credit the written
   record with a nine-language coverage nobody wrote. `_derived` is set by ED() on the name. */
function coverage(pick) {
  const have = Object.fromEntries(LANGS.map((l) => [l, 0]));
  let total = 0;
  for (const r of final) for (const e of r.eras) {
    if (!pick(e)) continue;
    total++;
    for (const lg of LANGS) if (e.name._has && e.name._has[lg]) have[lg]++;
  }
  return { have, total };
}
function report() {
  const tight = audit.filter((a) => a.guardKm < GUARD_MAX_KM);
  const unlisted = final.filter((r) => r.unlisted);
  const waived = final.reduce((n, r) => n + (r.waive || []).length, 0);
  /* ⚠ THE SECOND COPY OF THE SAME RULE, AND IT DRIFTED THE MOMENT A THIRD UPSTREAM ARRIVED.
     This read `_file === 'derived-pleiades.mjs' ? 'p' : 'w'` too, so the first build that carried
     OpenHistoricalMap printed «4,906 from Wikidata» for a record holding 2,245 rows that are not
     Wikidata's. It is the shipped file's own letter now, from the one map that defines it. */
  const bySrc = (c) => final.filter((r) => (r.derived ? SRC_CODE.get(r._file) : 'h') === c);
  const named = [...SRC_CODE].map(([f, c]) => `${bySrc(c).length} from ${/^derived-([a-z0-9]+)/.exec(f)[1]}`);
  console.log(`\nhist-cities · ${final.length} cities · ${eraCount} historical names · ${REGIONS.length} record files`);
  console.log(`  sources: ${bySrc('h').length} handwritten, ${named.join(', ')}`);
  console.log(`  collapsed: ${collapsed.spans} spans were the same name continuing on ${collapsed.rows} cities`);
  console.log(`  same-name columns shared: ${alias.cols} language forms moved onto ${alias.spans} spans (${alias.hand} of them handwritten)`);
  console.log(`  merged: ${merged.rows} derived rows were the same place as an earlier row (${merged.intoHand} of them a handwritten one); `
    + `${merged.eras} spans were added to a row that already existed and ${merged.dropped} were dropped as already covered`);
  console.log(`  countries: ${new Set(final.map((r) => r.cc)).size}`);
  const years = final.flatMap((r) => r.eras.map((e) => yr(e.to)));
  const band = (lo, hi) => years.filter((y) => y !== null && y >= lo && y < hi).length;
  console.log(`  spans by the year they end: BC ${band(-Infinity, 1)} · 1–999 ${band(1, 1000)} · 1000–1499 ${band(1000, 1500)} · `
    + `1500–1849 ${band(1500, 1850)} · 1850– ${band(1850, Infinity)}`);
  const p = {};
  for (const r of final) for (const e of r.eras) for (const s of [prec(e.from), prec(e.to)]) p[s] = (p[s] || 0) + 1;
  console.log(`  endpoint precision: ${Object.entries(p).sort().map(([k, n]) => `${k} ${n}`).join(' · ')}`);
  console.log(`  identity: ${keyCount} spellings, each bound to a point; ${final.length - tight.length - unlisted.length} rows at the ${GUARD_MAX_KM} km guard, `
    + `${tight.length} narrowed by a namesake, ${unlisted.length} not carried by GeoNames, ${waived} declared waiver(s)`);
  for (const a of tight.filter((x) => !x.r.derived).sort((x, y) => x.guardKm - y.guardKm)) {
    const m = a.r.measured;
    console.log(`    ${a.guardKm.toFixed(1).padStart(5)} km  ${a.r.id} — nearest namesake ${a.nearestRival.name} (${a.nearestRival.cc}) at ${a.nearestRival.d.toFixed(1)} km`
      + (m ? `  ⚠ below the ${GUARD_FLOOR_KM} km floor on a measurement: label ${m.km} km from the coordinate (${m.on})` : ''));
  }
  console.log('  per-language forms actually written down — ⚠ SEPARATELY, because the two halves of the');
  console.log('  record are answering different questions (see the note on the nine-language rule above):');
  for (const [what, pick] of [['handwritten', (e) => !e.name._derived], ['derived', (e) => e.name._derived]]) {
    const { have, total } = coverage(pick);
    if (!total) continue;
    console.log(`    ${what} (${total} spans)`);
    for (const lg of LANGS) console.log(`      ${lg.padEnd(8)} ${String(have[lg]).padStart(5)}/${total}  ${(100 * have[lg] / total).toFixed(1).padStart(5)}%`);
  }
  if (warnings.length) { console.log(`\n  ${warnings.length} warning(s):`); for (const w of warnings.slice(0, 40)) console.log('    · ' + w); }
}

/* ── the audit: every row against every settlement on Earth that answers to one of its spellings ─
   ⚠ MACHINE-GENERATED, so «we checked once» cannot decay into «we checked in 2026». */
function auditTable() {
  console.log('id\tfile\tcc\tlon\tlat\tguard_km\tanchor\tanchor_km\tnamesakes\tnearest_rival\trival_km\trival_field\tverdict');
  for (const a of audit.sort((x, y) => x.guardKm - y.guardKm || x.r.id.localeCompare(y.r.id))) {
    const verdict = a.r.unlisted ? 'UNLISTED' : a.inside.length ? 'WAIVED_ALT_ONLY'
      : a.guardKm < GUARD_MAX_KM ? 'SAFE_NARROWED' : a.nearestRival ? 'SAFE_SPATIAL' : 'SAFE_UNIQUE';
    const rivals = a.hits.filter((h) => h.d > a.guardKm).length;
    console.log([a.r.id, a.r._file, a.r.cc, a.r.lon, a.r.lat, a.guardKm.toFixed(1),
      a.anchor ? a.anchor.name : '—', a.anchor ? a.anchor.d.toFixed(1) : '—', rivals,
      a.nearestRival ? `${a.nearestRival.name} (${a.nearestRival.cc})` : '—',
      a.nearestRival ? a.nearestRival.d.toFixed(1) : '—', a.nearestRival ? a.nearestRival.field : '—', verdict].join('\t'));
  }
}

if (MODE === 'check') {
  let cur = null;
  try { cur = readFileSync(OUT, 'utf8'); } catch (_) { fail(`data/hist-cities.json is missing — run \`node scripts/build-hist-cities.mjs\``); }
  /* ⚠ LINE ENDINGS ARE NOT CONTENT (#R283's rule, and it cost this round a red gate). Git checks the
     file out with CRLF on Windows and with LF on the CI runner, so a byte-for-byte comparison against
     what the builder just wrote is a check that passes on one machine and fails on the other —
     which is worse than no check, because the failure teaches you to distrust the gate. */
  const eol = (s) => s.replace(/\r\n/g, '\n');
  if (eol(cur) !== eol(text)) fail('data/hist-cities.json does not match scripts/histcities/ — re-run `node scripts/build-hist-cities.mjs` and commit the result');
  console.log(`✓ hist-cities: data/hist-cities.json matches the record (${final.length} cities, ${eraCount} names, `
    + `${handShipped} of them handwritten and all present, every spelling bound to a point, clock floor ${CLOCK_FLOOR})`);
} else if (MODE === 'report') {
  report();
} else if (MODE === 'audit') {
  auditTable();
} else {
  writeFileSync(OUT, text);
  report();
  /* ⚠ BYTES, NOT `text.length`. That is a count of UTF-16 code units, and this file is two thirds
     Cyrillic, Greek and CJK — the old line reported 1 593 kB for a file that is 1 794 kB on disk. */
  console.log(`\n✓ wrote data/hist-cities.json (${(Buffer.byteLength(text) / 1024).toFixed(1)} kB)`);
}
