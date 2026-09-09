/* ============================================================================
 *  IntMap · THE UNITED STATES CONGRESS — HOUSE 1976–2018, SENATE 1976–2024   (#R588)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  #R243 already ships every presidential election. THIS PACK IS THE OTHER TWO FEDERAL BALLOTS a
 *  reader casts, and they are not one thing twice:
 *
 *    · THE HOUSE is 435 pieces of ground that are RE-DRAWN, so the map belongs to the Congress and
 *      not to the country. Between 1976 and 2018 the national district map changed fifteen times —
 *      most at a census, and several in the middle of a decade because a court threw a plan out
 *      (Texas 2004 and 2006, Georgia 2006, Pennsylvania 2018). An election painted on the
 *      neighbouring Congress's polygons hands seats to the wrong ground, so each of those maps is
 *      built once and shared only by the elections actually fought on it.
 *    · THE SENATE is not a map of the country at all. A THIRD of it is elected at a time, so a
 *      frame that colours all fifty states tells the reader that sixteen states voted when they did
 *      not. The geometry of a Senate election is THE STATES THAT VOTED IN IT — nothing else — which
 *      is why its eras are per-election rather than per-decade.
 *
 *  ⚠ AND A STATE CAN ELECT TWO SENATORS IN ONE YEAR. In eleven of the twenty-five cycles a state
 *  held its class election AND a special election to finish someone else's term. One polygon cannot
 *  carry two winners, so a year's special elections are their own election with their own geometry
 *  of just those states. Nothing is merged and nothing is dropped.
 *
 *  ══ WHERE THE NUMBERS COME FROM, AND WHAT COULD NOT BE GOT ══════════════════════════════════
 *  Measured 2026-09-09, every URL below by hand:
 *    · HOUSE 1976–2018  MEDSL's own repository, github.com/MEDSL/constituency-returns (CC0).
 *    · HOUSE 2020–2024  NOT INCLUDED, and not for want of looking. MEDSL's «U.S. House 1976–2024»
 *      (doi:10.7910/DVN/IG0UN2) and both of its predecessors are behind Harvard Dataverse
 *      guestbook 458: the file API answers 400 «You may not download this file without the required
 *      Guestbook response», and `?gbrecs=true`, `?gbrecs=false`, `?format=original` and the
 *      dataset-level endpoint are all refused the same way. No MEDSL-official mirror of the
 *      district returns for those three cycles exists on GitHub — the year repositories carry
 *      president, senate and precinct files only. The FEC publishes 2020 and 2022 as XLSX and has
 *      not published 2024 at all. ⚠ Rather than fill three cycles from an unaccountable personal
 *      mirror, the House series stops where the licensed record stops and this comment says so.
 *    · SENATE 1976–2024  MEDSL's «U.S. Senate statewide 1976–2024» (doi:10.7910/DVN/PEJ5QU, CC0),
 *      which is on the SAME Dataverse and is NOT behind that guestbook — measured, not assumed.
 *    · HOUSE DISTRICTS  Jeffrey B. Lewis et al., congressional district boundaries (MIT): the
 *      standard shapes for historical Congresses, covering every Congress this pack needs.
 *    · STATES  us-atlas@3 states-10m (ISC), 1:10 000 000 TopoJSON in plain WGS 84.
 *
 *  ⚠ NOTHING HERE IS A WRITTEN-OUT LIST OF STATES, DISTRICTS, CONGRESSES OR FILE NAMES. The
 *  Congresses come from the years in the returns; the states come from the returns; the boundary
 *  files come from the repository's own directory listing; the eras come from comparing the
 *  resulting district sets. The one hand-written table is PARTIES — a colour and nine names cannot
 *  be derived from a vote count — and it is guarded: a party that wins a seat and is not in it
 *  fails the build instead of vanishing off the map.
 * ==========================================================================*/
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';
import * as topojson from 'topojson-client';

/* ── the sources ───────────────────────────────────────────────────────────────────────────── */
const HOUSE_CSV = 'https://raw.githubusercontent.com/MEDSL/constituency-returns/master/1976-2018-house.csv';
const SENATE_TAB = 'https://dataverse.harvard.edu/api/access/datafile/13887039';   /* doi:10.7910/DVN/PEJ5QU */
const LEWIS_TREE = 'https://github.com/JeffreyBLewis/congressional-district-boundaries/tree/master/GeoJson';
const LEWIS_RAW = 'https://raw.githubusercontent.com/JeffreyBLewis/congressional-district-boundaries/master/GeoJson/';
const STATES_TOPO = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const SRC_HOUSE = 'MIT Election Data and Science Lab · district boundaries by Jeffrey B. Lewis et al.';
const SRC_SENATE = 'MIT Election Data and Science Lab · state outlines from us-atlas / Natural Earth';
const LIC_HOUSE = 'Returns CC0 1.0 · boundaries MIT';
const LIC_SENATE = 'Returns CC0 1.0 · state outlines ISC (Natural Earth data, public domain)';

export const about = 'United States — House of Representatives 1976–2018 and Senate 1976–2024, ' +
  'district by district, on the boundaries each election was actually fought on.';

/* ── simplification ────────────────────────────────────────────────────────────────────────────
   Lewis ships the districts at the resolution they were digitised at: 100.8 MB across the state
   files this pack reads. FIFTEEN national maps have to be committed, so the tolerance is a real
   choice and it was measured rather than guessed — the 113th Congress's 435 districts, 2026-09-09:

        0.004° → 2.67 MB     0.008° → 1.45 MB     0.012° → 1.01 MB
        0.020° → 0.64 MB     0.030° → 0.45 MB

   0.012° is ≈ 1.0 km at the Rio Grande and 0.6 km at the Canadian border, which is four times finer
   than the 0.05° the Census's own TIGERweb service applies to the same national query, and it puts
   the fifteen eras at about 14 MB. ⚠ Raise it far enough and a single-borough New York district
   (roughly 5 km across) collapses; simplifyGeoJSON throws rather than quietly losing the district,
   so the failure is loud. States are a coarser object than a district but they are re-written once
   per Senate cycle, and at 0.004° all of them together come to 1.4 MB, so they are left sharp. */
const HOUSE_TOL = 0.012;
const STATE_TOL = 0.004;
const DECIMALS = 4;              /* 0.0001° ≈ 11 m — finer than the tolerance, so it costs nothing */

/* ⚠ ALASKA'S TAIL IS WHY THIS EXISTS. The western Aleutians sit past +179°, so a naive bounding box
   over American ground is the whole planet. They are the western continuation of Alaska, so any
   longitude east of this meridian is read as its negative counterpart when the home box is
   computed. Measured: the only American land east of +170° is that chain. */
const ALEUTIAN_MERIDIAN = 170;

/* ── the party table ───────────────────────────────────────────────────────────────────────────
   Keyed by the label the returns actually print, lower-cased. The two colours are the ones American
   broadcasters use on election night and are the same two #R243 gives the presidential layer, so a
   reader moving between the two layers is not asked to relearn the map.

   ⚠ MINNESOTA AND NORTH DAKOTA HAVE NO DEMOCRATIC PARTY. They have the Democratic–Farmer–Labor
   Party and the Democratic–Nonpartisan League Party, and until 1995 Minnesota's Republicans were
   the Independent-Republicans. Those are the names on the ballot and the fill uses them; `bloc` is
   what puts them in the right bar, because the seat is Democratic in every published count of the
   chamber. Their colour is the parent party's, unchanged — no broadcaster has ever given the DFL a
   blue of its own, and inventing one would draw a distinction that does not exist in the world.

   ⚠ TWO LABELS ARE ONE MAN'S OWN BALLOT LINE. «Connecticut for Lieberman» (2006) and «Independent
   for Maine» (Angus King, 2012 and 2018) are parties only in the sense that ballot-access law is a
   form; both men sat as independents and were reported as independents on every election night, so
   they fold into `us:ind` rather than take a colour of their own. */
const PARTIES = {
  'democrat':                            'us:dem',
  'democratic':                          'us:dem',
  'democrat (not identified on ballot)': 'us:dem',
  'democratic/working families':         'us:dem',
  'republican':                          'us:rep',
  'independent':                         'us:ind',
  'connecticut for lieberman':           'us:ind',
  'independent for maine':               'us:ind',
  /* ⚠ ONE CELL IN THE UPSTREAM FILE NAMES A MAN INSTEAD OF A PARTY. Pennsylvania's 1st district in
     1980 carries the label «foglietta (democrat)», which is not a party and whose parenthesis is
     also wrong: Thomas Foglietta lost the Democratic primary that year and was elected running as
     an INDEPENDENT (he was returned as a Democrat from 1982 on, and the file labels those years
     «democrat»). Following the parenthesis would paint the seat with the party that beat him.
     ⚠ This is the one case-specific correction in the pack and it exists because the upstream cell
     is wrong, not because the structure could not cope (`.agents/rules/no-ad-hoc-hardcoding.md` §6).
     It can be deleted the day MEDSL fixes the cell — at which point the label disappears from the
     file and this key becomes dead, which is invisible; the guard that matters is the one in
     build(), which fails on any winning label this table does not know. */
  'foglietta (democrat)':                'us:ind',
  'democratic-farmer-labor':             'us:dfl',
  'independent-republican':              'us:ir',
  'democratic-nonpartisan league':       'us:dnl',
};

const PARTY_TABLE = {
  'us:dem': { bloc: 'us:dem', col: '#1f5fd0', n: {
    en: 'Democratic Party', native: 'Democratic Party', ja: '民主党', de: 'Demokratische Partei',
    ru: 'Демократическая партия', es: 'Partido Demócrata', fr: 'Parti démocrate',
    'zh-Hant': '民主黨', 'zh-Hans': '民主党', ko: '민주당' } },
  'us:rep': { bloc: 'us:rep', col: '#d02f2f', n: {
    en: 'Republican Party', native: 'Republican Party', ja: '共和党', de: 'Republikanische Partei',
    ru: 'Республиканская партия', es: 'Partido Republicano', fr: 'Parti républicain',
    'zh-Hant': '共和黨', 'zh-Hans': '共和党', ko: '공화당' } },
  'us:ind': { col: '#8a8f98', n: {
    en: 'Independent', native: 'Independent', ja: '無所属', de: 'Unabhängig',
    ru: 'Независимый', es: 'Independiente', fr: 'Sans étiquette',
    'zh-Hant': '無黨籍', 'zh-Hans': '无党籍', ko: '무소속' } },
  'us:dfl': { bloc: 'us:dem', col: '#1f5fd0', n: {
    en: 'Minnesota Democratic–Farmer–Labor Party', native: 'Democratic–Farmer–Labor Party',
    ja: 'ミネソタ民主農民労働党', de: 'Demokratisch-Farmer-Arbeiter-Partei',
    ru: 'Демократическо-фермерско-рабочая партия', es: 'Partido Demócrata-Campesino-Laborista',
    fr: 'Parti démocrate-fermier-travailliste', 'zh-Hant': '明尼蘇達民主農工黨',
    'zh-Hans': '明尼苏达民主农工党', ko: '미네소타 민주농민노동당' } },
  'us:ir': { bloc: 'us:rep', col: '#d02f2f', n: {
    en: 'Minnesota Independent-Republican Party', native: 'Independent-Republican Party',
    ja: 'ミネソタ独立共和党', de: 'Unabhängig-Republikanische Partei',
    ru: 'Независимо-республиканская партия', es: 'Partido Independiente-Republicano',
    fr: 'Parti indépendant-républicain', 'zh-Hant': '明尼蘇達獨立共和黨',
    'zh-Hans': '明尼苏达独立共和党', ko: '미네소타 독립공화당' } },
  'us:dnl': { bloc: 'us:dem', col: '#1f5fd0', n: {
    en: 'North Dakota Democratic–Nonpartisan League Party', native: 'Democratic–NPL Party',
    ja: 'ノースダコタ民主非党派連盟党', de: 'Demokratisch-Überparteiliche Liga',
    ru: 'Демократическая партия — Беспартийная лига', es: 'Partido Demócrata-Liga No Partidista',
    fr: 'Parti démocrate–Ligue non partisane', 'zh-Hant': '北達科他民主無黨聯盟黨',
    'zh-Hans': '北达科他民主无党联盟党', ko: '노스다코타 민주무당파연맹당' } },
};

/* ── where the boundary series has no shape ────────────────────────────────────────────────────
   ⚠ A DISTRICT WITH A RESULT AND NO POLYGON IS NORMALLY A BUG IN THIS FILE, so it stops the build.
   Exactly one is not: New York's 33rd district exists in the returns for the 98th to the 102nd
   Congresses and the Lewis series has no shape for it in any of them (measured 2026-09-09 —
   «New York_098_to_098» holds 33 features numbered 1–32 and 34, and «New York_099_to_102» the
   same). There is no second source for those five maps: the Census cartographic series begins at
   the 103rd Congress. So the seat is left off the map for those five elections and each of their
   notes says the frame accounts for 434 of 435 seats, which is true, rather than drawing 434 and
   implying 435, which is not. Delete this entry when the upstream shape appears — the build fails
   if the declaration outlives the gap. */
const BOUNDARY_GAPS = {
  'ny-33': { from: 98, to: 102 },
};

/* ── the chambers ──────────────────────────────────────────────────────────────────────────── */
const HOUSE_BODY = {
  en: 'House of Representatives', native: 'House of Representatives', ja: 'アメリカ合衆国下院',
  de: 'Repräsentantenhaus', ru: 'Палата представителей', es: 'Cámara de Representantes',
  fr: 'Chambre des représentants', 'zh-Hant': '美國眾議院', 'zh-Hans': '美国众议院', ko: '미국 하원',
};
const SENATE_BODY = {
  en: 'Senate', native: 'Senate', ja: 'アメリカ合衆国上院', de: 'Senat', ru: 'Сенат',
  es: 'Senado', fr: 'Sénat', 'zh-Hant': '美國參議院', 'zh-Hans': '美国参议院', ko: '미국 상원',
};
const SENATE_SPECIAL = {
  en: 'Senate (special elections)', native: 'Senate (special elections)',
  ja: 'アメリカ合衆国上院（補欠選挙）', de: 'Senat (Nachwahlen)', ru: 'Сенат (дополнительные выборы)',
  es: 'Senado (elecciones especiales)', fr: 'Sénat (élections partielles)',
  'zh-Hant': '美國參議院（補選）', 'zh-Hans': '美国参议院（补选）', ko: '미국 상원 (보궐선거)',
};

/* ── delimited text ────────────────────────────────────────────────────────────────────────────
   MEDSL ships the House as quoted CSV and the Senate as Dataverse's tab-separated ingest form, in
   which every character field is quoted as well. One reader, told which separator to expect. */
function parseTable(text, sep) {
  const rows = [];
  let row = [], cell = '', q = false;
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const head = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length === head.length).map(r => {
    const o = {};
    for (let i = 0; i < head.length; i++) o[head[i]] = r[i].trim();
    return o;
  });
}

/* `NA` is R's missing value and both files were written by R, so a cell holding it holds nothing.
   ⚠ #R543 measured the other half of this: `+null` and `+''` are both 0 and 0 is finite, so a
   missing count read as a number becomes a bar standing for a ballot nobody cast. */
const na = (v) => (v == null || v === '' || v === 'NA' || v === 'N/A');
const num = (v) => (na(v) ? null : (Number.isFinite(+v) ? +v : null));

/* ── which round decided the seat ──────────────────────────────────────────────────────────────
   Both files record every round a seat needed, and «the general election» is not always the last
   one — nor, in two Texas years, the first one either. Louisiana and Georgia send an inconclusive
   November ballot to a runoff; Texas held court-ordered open elections in 1996 and 2006 whose first
   round IS the general election and which the file stores under `pri`. So the seat belongs to
   whoever won the LAST round that was held, and rounds are RANKED rather than named. */
const roundRank = (r) => {
  const stage = String(r.stage || '').toLowerCase();
  if (String(r.runoff || '').toUpperCase() === 'TRUE' || /runoff/.test(stage)) return 3;
  if (stage === 'gen') return 2;
  return 1;
};

/* ── who is a candidate ────────────────────────────────────────────────────────────────────────
   A state's return also reports the ballots that chose nobody — blank, void, over-voted, scattered
   among write-ins — and MEDSL passes those through as rows with a vote count. They must not be able
   to win a district, and they are not caught by a written-out list of the words states happen to
   use. A residue label is one that NEVER carries a party anywhere in the file AND turns up in many
   different districts; a genuinely party-less independent turns up in exactly one.
   ⚠ Measured 2026-09-09 on the House file: forty-four labels never carry a party and they split
   with nothing in between — nine appear in 5 to 415 district-years, the other thirty-five in
   exactly one. Any cut strictly between 1 and 5 separates them, so this uses «more than one
   district». If a later edition of the returns closes that gap the split stops being clean, and
   the assertion below is what says so rather than a wrong map. */
const RESIDUE_MIN_DISTRICTS = 2;

function residueLabels(rows, nameOf, partyOf, districtOf) {
  const party = new Map(), where = new Map();
  for (const r of rows) {
    const n = nameOf(r);
    if (!party.has(n)) { party.set(n, false); where.set(n, new Set()); }
    if (!na(partyOf(r))) party.set(n, true);
    where.get(n).add(districtOf(r));
  }
  const out = new Set();
  for (const [n, hasParty] of party) {
    if (hasParty) continue;
    if (where.get(n).size >= RESIDUE_MIN_DISTRICTS) out.add(n);
  }
  return out;
}

/* ── a party the compilation forgot to record ──────────────────────────────────────────────────
   ⚠ FOUR SEATS IN FORTY YEARS ARE WON BY A CANDIDATE WHOSE PARTY CELL IS EMPTY, and three of them
   are in the most recent frame (Alabama 5, New Jersey 4 and Wisconsin 8 in 2018). Left alone the
   map draws three grey districts in the middle of a red state and the bar is three seats short —
   which is true of the file and false about the election.
   The file already knows the answer: the SAME PERSON, in the SAME STATE, is in it for other years
   with a party. So a blank is filled from the candidate's own record, and only when that record is
   unanimous — a member who changed party leaves two answers and keeps the blank, because «the party
   he was in some other decade» is not a fact about this ballot. This is derived from the returns and
   costs nothing when the returns are complete. */
function partyByCandidate(rows, acc, stateOf) {
  const seen = new Map();
  for (const r of rows) {
    const p = acc.partyOf(r);
    if (na(p)) continue;
    const k = stateOf(r) + '|' + acc.nameOf(r);
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k).add(String(p).toLowerCase());
  }
  const out = new Map();
  for (const [k, set] of seen) if (set.size === 1) out.set(k, [...set][0]);
  return out;
}

/* ── one contest ───────────────────────────────────────────────────────────────────────────────
   ⚠ NEW YORK AND CONNECTICUT PUT ONE CANDIDATE ON SEVERAL PARTY LINES and the returns file them as
   several rows. Reading the largest row as the winner sets Faso's 135 905 Republican votes against
   Teachout's 125 956 Democratic ones and forgets his 22 238 Conservative and Independence votes and
   her 15 268 Working Families ones. Votes are therefore summed PER CANDIDATE, and the candidate's
   party is the line that carried most of them. */
function contest(rows, acc, residue, known) {
  const top = Math.max(...rows.map(roundRank));
  const decisive = rows.filter(r => roundRank(r) === top);
  const agg = new Map();
  let total = null;
  for (const r of decisive) {
    const t = acc.totalOf(r);
    if (t != null && (total == null || t > total)) total = t;
    const n = acc.nameOf(r);
    if (na(n) || residue.has(n)) continue;
    const v = acc.votesOf(r);
    const e = agg.get(n) || { n, v: 0, best: -1, p: null };
    if (v != null) e.v += v;
    if (v != null && v > e.best) { e.best = v; e.p = na(acc.partyOf(r)) ? null : String(acc.partyOf(r)).toLowerCase(); }
    agg.set(n, e);
  }
  const state = decisive.length ? known.stateOf(decisive[0]) : '';
  for (const e of agg.values()) if (!e.p) e.p = known.party.get(state + '|' + e.n) || null;
  const cands = [...agg.values()].sort((a, b) => b.v - a.v);
  return { cands, total };
}

/* ── one district's row, and its contribution to the national bar ──────────────────────────────
   ⚠ AN ABSENT PARTY IS ABSENT, NOT «OTHER». Four contests in the House file and five in the Senate
   file record a winner the compilation could not attach a party to. They get no `w`, the map draws
   no colour, and the runtime says so in words — which is the truth, unlike a grey wedge labelled
   with a party nobody stood for. */
function districtRow(cands, total, tally) {
  const row = {};
  const win = cands[0];
  const pid = win && win.p ? PARTIES[win.p] : null;
  if (win && win.p && !pid) throw new Error('winning party «' + win.p + '» is not in the party table');
  if (pid) { row.w = pid; tally.seats.set(pid, (tally.seats.get(pid) || 0) + 1); }
  /* Six is what a reader reads. Every vote still counts towards the national share below, so the
     bar is computed from the whole return and only the list shown in a district is trimmed. */
  row.c = cands.slice(0, 6).map(c => {
    const o = { n: c.n };
    const p = c.p ? PARTIES[c.p] : null;
    if (p) o.p = p;
    if (c.v != null) o.v = c.v;
    return o;
  });
  if (total != null) row.t = total;
  for (const c of cands) {
    tally.cast += c.v || 0;
    const p = c.p ? PARTIES[c.p] : null;
    if (p) tally.votes.set(p, (tally.votes.get(p) || 0) + (c.v || 0));
  }
  /* the schema requires the winner to be among the candidates listed, and it is right to: a winner
     nobody stood against is a winner nobody counted. Six is enough for that in every real return,
     but «enough in every case measured» is not «enough», so it is checked. */
  if (row.w && !row.c.some(c => c.p === row.w)) {
    row.c = cands.map(c => {
      const o = { n: c.n };
      const p = c.p ? PARTIES[c.p] : null;
      if (p) o.p = p;
      if (c.v != null) o.v = c.v;
      return o;
    });
  }
  return row;
}

/* The national bar is what the reader came for, so it is written out rather than left to be
   inferred: seats won, and the party's share of every vote cast for the chamber that day. */
function nationalRows(tally, seenParty) {
  const rows = [];
  const pct = (p) => (tally.cast > 0 && tally.votes.has(p) ? Math.round(tally.votes.get(p) / tally.cast * 1000) / 10 : null);
  for (const [p, s] of [...tally.seats].sort((a, b) => b[1] - a[1])) {
    const row = { p, seats: s, dseats: s };
    const q = pct(p); if (q != null) row.pct = q;
    rows.push(row); seenParty.add(p);
  }
  for (const [p, v] of tally.votes) {
    if (tally.seats.has(p) || !v) continue;      /* votes without a seat are still a bar */
    rows.push({ p, seats: 0, dseats: 0, pct: pct(p) }); seenParty.add(p);
  }
  return rows;
}

/* ── election day ──────────────────────────────────────────────────────────────────────────────
   2 U.S.C. §7 has fixed it since 1845: the Tuesday next after the first Monday in November. That is
   arithmetic, not a table of twenty-five dates that could disagree with itself. */
function electionDay(year) {
  const d = new Date(Date.UTC(year, 10, 1));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);   /* the first Monday */
  d.setUTCDate(d.getUTCDate() + 1);                                /* the Tuesday next after it */
  return d.toISOString().slice(0, 10);
}

/* A district code has to be stable across forty years and safe in a file name and a DOM id. `ak-00`
   is the Census convention for an at-large seat and the returns number one 0, so the two agree by
   construction rather than by a conversion table. */
const cdCode = (po, district) => po.toLowerCase() + '-' + String(district).padStart(2, '0');
function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return n + 'th';
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}
const districtName = (state, d) => state + (d === 0 ? ' at-large' : ' ' + ordinal(d));

/* The Congress elected in November of `year`: the 1st sat in 1789 and a Congress lasts two years. */
const congressOf = (year) => (year - 1786) / 2;

/* ── the notes the reader reads ────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ EACH LANGUAGE BUILDS ITS OWN SENTENCE, AND THAT IS WHY THESE ARE FUNCTIONS. An ordinal is not
   a suffix everywhere («119th» is 「第119議会」, «Der 119. Kongress», «제119대»), and the counts do
   not fall in the same place in a Japanese or Korean clause as in an English one, so a template
   that splices numbers into one English sentence writes text no reader of those languages would.
   ⚠ BOTH `jp` AND `ja`: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the key
   js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data uses. */

/** The House. `gaps` are the districts the boundary series has no shape for in this Congress.
 *  ⚠ THE COUNT IN THE NOTE IS THE COUNT ON THE MAP — saying that this frame accounts for 434 of the
 *  chamber's 435 seats is the difference between a gap and a wrong number. */
function houseNote(c, drawn, gaps) {
  const cds = [...gaps].map(cd => cd.toUpperCase()).join(', ');
  const whole = drawn + gaps.size;
  const jp = '第 ' + c + ' 議会。すべての議席が選挙区の議席です。' + (gaps.size
    ? ' ⚠ ' + cds + ' は描かれていません。この議会の輪郭が境界データに存在しないためで、この枠が説明して' +
      'いるのは ' + whole + ' 議席のうち ' + drawn + ' 議席です。' : '');
  return {
    en: 'The ' + ordinal(c) + ' Congress. Every seat is a district seat.' + (gaps.size
      ? ' ⚠ ' + cds + ' is not drawn: the boundary series has no shape for it in this Congress, so ' +
        'this frame accounts for ' + drawn + ' of the chamber\'s ' + whole + ' seats.' : ''),
    ja: jp, jp,
    de: 'Der ' + c + '. Kongress. Jeder Sitz ist ein Wahlkreissitz.' + (gaps.size
      ? ' ⚠ ' + cds + ' wird nicht gezeichnet: Die Grenzserie enthält dafür in diesem Kongress keine ' +
        'Fläche, dieser Ausschnitt erklärt also ' + drawn + ' der ' + whole + ' Sitze der Kammer.' : ''),
    ru: c + '-й Конгресс. Каждое место — место от округа.' + (gaps.size
      ? ' ⚠ ' + cds + ' не показан: в серии границ нет его контура для этого Конгресса, поэтому этот ' +
        'кадр описывает ' + drawn + ' из ' + whole + ' мест палаты.' : ''),
    es: 'El ' + c + '.º Congreso. Todos los escaños son escaños de distrito.' + (gaps.size
      ? ' ⚠ ' + cds + ' no se dibuja: la serie de límites no tiene su forma en este Congreso, por lo ' +
        'que este marco explica ' + drawn + ' de los ' + whole + ' escaños de la cámara.' : ''),
    fr: 'Le ' + (c === 1 ? '1er' : c + 'e') + ' Congrès. Chaque siège est un siège de circonscription.' + (gaps.size
      ? ' ⚠ ' + cds + ' n’est pas dessiné : la série de contours ne contient aucune forme pour ce ' +
        'Congrès, si bien que cette vue rend compte de ' + drawn + ' des ' + whole + ' sièges de la chambre.' : ''),
    ko: '제' + c + '대 연방의회. 모든 의석이 지역구 의석입니다.' + (gaps.size
      ? ' ⚠ ' + cds + '은(는) 그려지지 않았습니다. 이 의회 시기의 경계 자료에 해당 구역의 도형이 없기 ' +
        '때문이며, 이 화면이 설명하는 것은 ' + whole + '석 가운데 ' + drawn + '석입니다.' : ''),
    zh: '第 ' + c + ' 屆國會。所有議席都是選區議席。' + (gaps.size
      ? ' ⚠ ' + cds + ' 未繪出：邊界資料中沒有本屆國會的該選區輪廓，因此這個畫面說明的是議會 ' +
        whole + ' 席中的 ' + drawn + ' 席。' : ''),
    'zh-hans': '第 ' + c + ' 届国会。所有议席都是选区议席。' + (gaps.size
      ? ' ⚠ ' + cds + ' 未绘出：边界数据中没有本届国会的该选区轮廓，因此这个画面说明的是议会 ' +
        whole + ' 席中的 ' + drawn + ' 席。' : ''),
  };
}

/** The Senate. ⚠ THE NUMBER IS THE SEATS CONTESTED, NOT THE CHAMBER — only about a third of the
 *  Senate is ever on the ballot, which is why a state that did not vote is not drawn at all. */
function senateNote(special, n) {
  const jp = (special ? '補欠選挙のみ。任期途中で空席となった議席を、通常選挙と同じ日に選びます。'
                      : '6 年の任期が満了した改選グループの選挙です。') +
    '100 議席のうち ' + n + ' 議席が改選され、描かれていない州は投票していません。';
  return {
    en: (special ? 'Special elections only — seats vacated mid-term, held on the same day as the general. '
                 : 'The class of senators whose six-year term ended. ') +
      n + ' of the 100 seats were on the ballot; a state that is not drawn did not vote.',
    ja: jp, jp,
    de: (special ? 'Nur Nachwahlen — Sitze, die mitten in der Wahlperiode frei wurden und am selben Tag wie die regulären Wahlen besetzt werden. '
                 : 'Die Gruppe der Senatoren, deren sechsjährige Amtszeit endete. ') +
      n + ' der 100 Sitze standen zur Wahl; ein Staat, der nicht gezeichnet ist, hat nicht gewählt.',
    ru: (special ? 'Только дополнительные выборы — места, освободившиеся посреди срока, замещаются в тот же день, что и очередные. '
                 : 'Группа сенаторов, чей шестилетний срок истёк. ') +
      'Из 100 мест избирались ' + n + '; штат, который не показан, не голосовал.',
    es: (special ? 'Solo elecciones especiales: escaños que quedaron vacantes a mitad del mandato y se cubren el mismo día que las generales. '
                 : 'La clase de senadores cuyo mandato de seis años terminó. ') +
      n + ' de los 100 escaños estaban en juego; un estado que no aparece dibujado no votó.',
    fr: (special ? 'Élections partielles uniquement : des sièges devenus vacants en cours de mandat, pourvus le même jour que les élections générales. '
                 : 'La série de sénateurs dont le mandat de six ans arrivait à son terme. ') +
      n + ' des 100 sièges étaient à pourvoir ; un État qui n’est pas dessiné n’a pas voté.',
    ko: (special ? '보궐선거만 해당합니다. 임기 중에 공석이 된 의석을 정기 선거와 같은 날 채웁니다. '
                 : '6년 임기가 끝난 상원의원 그룹의 선거입니다. ') +
      '100석 가운데 ' + n + '석이 선거 대상이었으며, 그려지지 않은 주는 투표하지 않았습니다.',
    zh: (special ? '僅為補選：任期中出缺的議席，與大選同日補選。' : '六年任期屆滿的參議員改選組別。') +
      '100 席中有 ' + n + ' 席改選；未繪出的州沒有投票。',
    'zh-hans': (special ? '仅为补选：任期中出缺的议席，与大选同日补选。' : '六年任期届满的参议员改选组别。') +
      '100 席中有 ' + n + ' 席改选；未绘出的州没有投票。',
  };
}

/* ── the home box ──────────────────────────────────────────────────────────────────────────────
   Derived from the polygons rather than written down, so it cannot drift away from what is drawn.
   ⚠ See ALEUTIAN_MERIDIAN: without the shift this returns the whole world. The result is clamped
   back into [-180, 180] because a home view is a place, not an unwrapped coordinate. */
function homeBox(featureCollections) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      const x = c[0] > ALEUTIAN_MERIDIAN ? c[0] - 360 : c[0];
      if (x < w) w = x;
      if (x > e) e = x;
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
    } else for (const k of c) walk(k);
  };
  for (const fc of featureCollections) for (const f of fc.features) if (f.geometry) walk(f.geometry.coordinates);
  const r = (v) => Math.round(v * 100) / 100;
  return [[Math.max(-180, r(w)), r(s)], [Math.min(180, r(e)), r(n)]];
}

/* ══ THE HOUSE ═════════════════════════════════════════════════════════════════════════════════ */
async function house(ctx, out, seenParty) {
  const rows = parseTable(await ctx.get(HOUSE_CSV, { text: true }), ',');
  const acc = {
    nameOf: r => r.candidate, partyOf: r => r.party,
    votesOf: r => num(r.candidatevotes), totalOf: r => num(r.totalvotes),
  };
  const residue = residueLabels(rows, acc.nameOf, acc.partyOf, r => r.year + '|' + r.state_po + '|' + r.district);
  const known = { stateOf: r => r.state_po, party: partyByCandidate(rows, acc, r => r.state_po) };

  /* state name → postal code, taken from the returns themselves: the boundary files know a state by
     its name and the results know it by its code, and this is the only place the two must meet. */
  const po = new Map();
  for (const r of rows) po.set(r.state.trim().toUpperCase(), r.state_po);

  const byYear = new Map();
  for (const r of rows) {
    const y = +r.year;
    if (!byYear.has(y)) byYear.set(y, new Map());
    const cd = cdCode(r.state_po, +r.district);
    const byDist = byYear.get(y);
    if (!byDist.has(cd)) byDist.set(cd, []);
    byDist.get(cd).push(r);
  }

  /* ── the boundary files, discovered ────────────────────────────────────────────────────────
     The repository names each file «<State>_<first>_to_<last>.geojson», but ⚠ THE RANGE IN THE NAME
     IS THE HULL OF WHAT IS INSIDE, NOT A PARTITION. Montana has one file spanning the 51st to the
     117th Congress holding its at-large seat for 51–65 and 103–117, and two more holding its two
     districts for 93–98 and 99–102; all three names contain 95 and only the third is right for it.
     So every file whose hull contains a Congress is read, and each FEATURE is then asked, through
     its own `startcong`/`endcong`, whether it existed in that Congress. */
  const listing = await ctx.get(LEWIS_TREE, { text: true });
  const files = [...new Set(listing.match(/[A-Za-z][A-Za-z ]*_\d{3}_to_\d{3}\.geojson/g) || [])];
  if (files.length < 500) {
    throw new Error('the Lewis directory listing yielded only ' + files.length + ' file names — its shape changed');
  }
  const byState = new Map();
  for (const f of files) {
    const m = f.match(/^(.+)_(\d{3})_to_(\d{3})\.geojson$/);
    const key = m[1].trim().toUpperCase();
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push({ file: f, from: +m[2], to: +m[3] });
  }

  const cache = new Map();
  const load = async (file) => {
    if (!cache.has(file)) {
      const buf = await ctx.get(LEWIS_RAW + file.replace(/ /g, '%20'));
      cache.set(file, JSON.parse(buf.toString('utf8')));
    }
    return cache.get(file);
  };

  async function mapFor(congress, wanted) {
    const feats = [];
    for (const [stateKey, ranges] of byState) {
      const code = po.get(stateKey);
      if (!code) continue;                       /* the returns give it no House seat (D.C.) */
      for (const r of ranges) {
        if (r.from > congress || r.to < congress) continue;
        for (const f of (await load(r.file)).features) {
          const p = (f && f.properties) || {};
          if (!(p.startcong <= congress && congress <= p.endcong)) continue;
          const cd = cdCode(code, +p.district);
          if (!wanted.has(cd)) continue;
          const nm = districtName(p.statename, +p.district);
          feats.push({ type: 'Feature', properties: { cd, n: { en: nm, native: nm } }, geometry: f.geometry });
        }
      }
    }
    return { type: 'FeatureCollection', features: feats };
  }

  /* ── the eras ──────────────────────────────────────────────────────────────────────────────
     Two Congresses share a map when the map is the same, which is a question about the polygons and
     not about the calendar. The signature is which state files contributed, so a mid-decade court
     order in one state opens a new era for the whole country — which is exactly what happened in
     2004, 2006 and 2018. */
  const years = [...byYear.keys()].sort((a, b) => a - b);
  const eras = new Map();                        /* signature → era */
  const geoOf = new Map();                       /* year → geo file name */
  const gapOf = new Map();                       /* year → districts the boundary series lacks */
  const usedGap = new Set();

  for (const y of years) {
    const c = congressOf(y);
    const wanted = new Set(byYear.get(y).keys());
    const sig = [...byState].map(([, rs]) => rs.filter(r => r.from <= c && c <= r.to).map(r => r.file).join('+')).join('|');
    if (!eras.has(sig)) {
      const id = 'us-house-c' + String(c).padStart(3, '0') + '.geo.json';
      const fc = simplifyGeoJSON(await mapFor(c, wanted), { tolerance: HOUSE_TOL, decimals: DECIMALS });
      eras.set(sig, { id, fc });
      out.geo[id] = fc;
    }
    const era = eras.get(sig);
    /* ⚠ THE SHARE IS CHECKED, NOT ASSUMED. If two Congresses were fought on the same boundary files
       but a different set of seats, sharing one file leaves a hole in the later one's choropleth,
       and a hole in a choropleth reads as «nobody won here». */
    const have = new Set(era.fc.features.map(f => f.properties.cd));
    const missing = [...wanted].filter(cd => !have.has(cd));
    const extra = [...have].filter(cd => !wanted.has(cd));
    const undeclared = missing.filter(cd => !(BOUNDARY_GAPS[cd] && BOUNDARY_GAPS[cd].from <= c && c <= BOUNDARY_GAPS[cd].to));
    if (undeclared.length || extra.length) {
      throw new Error('House ' + y + ' (Congress ' + c + '): ' + undeclared.length +
        ' district(s) with a result and no polygon (' + undeclared.slice(0, 5).join(', ') + '), ' +
        extra.length + ' with a polygon and no result (' + extra.slice(0, 5).join(', ') + ')');
    }
    gapOf.set(y, new Set(missing));
    for (const cd of missing) usedGap.add(cd);
    geoOf.set(y, era.id);
  }
  /* ⚠ A DECLARED GAP THAT IS NO LONGER A GAP IS A LIE ABOUT THE UPSTREAM, so it fails too — that is
     how the entry gets deleted the day Lewis publishes the missing shape. */
  for (const cd of Object.keys(BOUNDARY_GAPS)) {
    if (!usedGap.has(cd)) throw new Error('BOUNDARY_GAPS declares ' + cd + ' missing, but the boundary files have it — delete the entry');
  }

  /* ── the results ─────────────────────────────────────────────────────────────────────────── */
  for (const y of years) {
    const res = { d: {}, n: [] };
    const tally = { seats: new Map(), votes: new Map(), cast: 0 };
    const gaps = gapOf.get(y);
    for (const [cd, rs] of byYear.get(y)) {
      if (gaps.has(cd)) continue;                /* declared above: the shape does not exist */
      const { cands, total } = contest(rs, acc, residue, known);
      try { res.d[cd] = districtRow(cands, total, tally); }
      catch (e) { throw new Error('House ' + y + ' ' + cd + ': ' + e.message); }
    }
    res.n = nationalRows(tally, seenParty);

    const resId = 'us-house-' + y + '.res.json';
    out.res[resId] = res;
    const n = Object.keys(res.d).length;
    out.elections.push({
      id: 'us-house-' + y, polity: 'us', date: electionDay(y), y,
      body: HOUSE_BODY, geo: geoOf.get(y), res: resId,
      /* every seat in this chamber belongs to a piece of ground, so the bar chart IS the map and
         `listSeats` is genuinely zero rather than merely unrecorded */
      seatsTotal: n, districtSeats: n, listSeats: 0,
      src: SRC_HOUSE, lic: LIC_HOUSE,
      note: houseNote(congressOf(y), n, gaps),
    });
  }
  return [...eras.values()].map(e => e.fc);
}

/* ══ THE SENATE ════════════════════════════════════════════════════════════════════════════════ */
async function senate(ctx, out, seenParty) {
  const rows = parseTable(await ctx.get(SENATE_TAB, { text: true }), '\t').filter(r => !na(r.state_po));
  const acc = {
    nameOf: r => r.candidate, partyOf: r => r.party_detailed,
    votesOf: r => num(r.candidatevotes), totalOf: r => num(r.totalvotes),
  };
  const residue = residueLabels(rows, acc.nameOf, acc.partyOf, r => r.year + '|' + r.state_po + '|' + r.special);
  const known = { stateOf: r => r.state_po, party: partyByCandidate(rows, acc, r => r.state_po) };

  /* ⚠ A RUNOFF IS NOT ITS OWN ELECTION, AND GEORGIA'S IS NOT EVEN IN THE SAME YEAR. Georgia sent
     both of its 2020 seats to a runoff on 5 January 2021 and the returns file those four rows under
     year 2021; Louisiana's December runoffs stay inside their year. A contest therefore belongs to
     the CYCLE — the even year on or before the row's year — and the rounds inside it are ranked by
     roundRank, so the January ballot decides the November seat exactly as it did in law. */
  const cycleOf = (r) => (+r.year % 2 ? +r.year - 1 : +r.year);

  const byCycle = new Map();
  const fips = new Map();
  for (const r of rows) {
    const y = cycleOf(r);
    const kind = /true/i.test(r.special) ? 'sp' : 'reg';
    if (!byCycle.has(y)) byCycle.set(y, { reg: new Map(), sp: new Map() });
    const g = byCycle.get(y)[kind];
    const cd = r.state_po.toLowerCase();
    if (!g.has(cd)) g.set(cd, []);
    g.get(cd).push(r);
    fips.set(cd, String(r.state_fips).padStart(2, '0'));
  }

  /* us-atlas keys its states by FIPS and the returns carry the FIPS of every state that voted, so
     the join needs no table of names. The District of Columbia and the territories elect no senator
     and therefore never appear on the results side at all. */
  const topo = JSON.parse((await ctx.get(STATES_TOPO)).toString('utf8'));
  const states = new Map();
  for (const f of topojson.feature(topo, topo.objects.states).features) states.set(String(f.id), f);

  const eras = new Map();                        /* the set of states that voted → geo file name */
  const geos = [];
  for (const y of [...byCycle.keys()].sort((a, b) => a - b)) {
    for (const kind of ['reg', 'sp']) {
      const group = byCycle.get(y)[kind];
      if (!group.size) continue;

      const sig = [...group.keys()].sort().join(',');
      if (!eras.has(sig)) {
        const feats = [];
        for (const cd of [...group.keys()].sort()) {
          const f = states.get(fips.get(cd));
          if (!f) throw new Error('Senate ' + y + ': us-atlas has no outline for FIPS ' + fips.get(cd) + ' (' + cd + ')');
          const nm = f.properties.name;
          feats.push({
            type: 'Feature',
            properties: { cd, n: { en: nm, native: nm } },
            geometry: JSON.parse(JSON.stringify(f.geometry)),   /* simplify writes in place */
          });
        }
        const id = 'us-senate-' + y + (kind === 'sp' ? '-special' : '') + '.geo.json';
        const fc = simplifyGeoJSON({ type: 'FeatureCollection', features: feats }, { tolerance: STATE_TOL, decimals: DECIMALS });
        eras.set(sig, id);
        out.geo[id] = fc;
        geos.push(fc);
      }

      const res = { d: {}, n: [] };
      const tally = { seats: new Map(), votes: new Map(), cast: 0 };
      for (const [cd, rs] of group) {
        const { cands, total } = contest(rs, acc, residue, known);
        try { res.d[cd] = districtRow(cands, total, tally); }
        catch (e) { throw new Error('Senate ' + y + ' ' + cd + ': ' + e.message); }
      }
      res.n = nationalRows(tally, seenParty);

      const id = 'us-senate-' + y + (kind === 'sp' ? '-special' : '');
      const resId = id + '.res.json';
      out.res[resId] = res;
      const n = group.size;
      out.elections.push({
        id, polity: 'us', date: electionDay(y), y,
        body: kind === 'sp' ? SENATE_SPECIAL : SENATE_BODY,
        geo: eras.get(sig), res: resId,
        /* ⚠ THESE NUMBERS ARE THE SEATS CONTESTED, NOT THE CHAMBER. Only about a third of the
           Senate is ever on the ballot; the other two-thirds were elected in the two cycles before
           and are not in this frame at all, which is why the states that did not vote are not
           drawn rather than drawn empty. */
        seatsTotal: n, districtSeats: n, listSeats: 0,
        src: SRC_SENATE, lic: LIC_SENATE,
        note: senateNote(kind === 'sp', n),
      });
    }
  }
  return geos;
}

export async function build(ctx) {
  const out = { polities: [], parties: {}, elections: [], geo: {}, res: {} };
  const seenParty = new Set();

  const houseGeo = await house(ctx, out, seenParty);
  const senateGeo = await senate(ctx, out, seenParty);

  /* ⚠ THE PARTY TABLE IS BUILT FROM WHAT THE RESULTS USED, and a party the results used that this
     file has no colour and no names for stops the build. That is the guard that makes a
     hand-written table safe: the alternative failure is silent, and its shape is a seat painted the
     colour of nothing. */
  for (const pid of [...seenParty].sort()) {
    const p = PARTY_TABLE[pid];
    if (!p) throw new Error('party ' + pid + ' is used by a result and has no entry in PARTY_TABLE');
    out.parties[pid] = p.bloc ? { n: p.n, col: p.col, bloc: p.bloc } : { n: p.n, col: p.col };
  }

  out.polities.push({
    id: 'us',
    n: {
      en: 'United States', native: 'United States', ja: 'アメリカ合衆国', de: 'Vereinigte Staaten',
      ru: 'Соединённые Штаты', es: 'Estados Unidos', fr: 'États-Unis',
      'zh-Hant': '美國', 'zh-Hans': '美国', ko: '미국',
    },
    home: homeBox([...houseGeo, ...senateGeo]),
  });

  out.elections.sort((a, b) => (a.y - b.y) || a.id.localeCompare(b.id));
  return out;
}
