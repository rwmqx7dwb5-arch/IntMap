/* ============================================================================
 *  IntMap · EVERY BUNDESTAG ELECTION, 1949–2025   (#R588)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。…欧米日豪韓中露」— Germany's half of it, taken back
 *  as far as the machine-readable record goes, which is all twenty-one elections since 1949.
 *
 *  ══ WHERE EVERY NUMBER ON THE SCREEN COMES FROM ═════════════════════════════════════════════
 *    · CONSTITUENCY RETURNS — Die Bundeswahlleiterin's `btw_kerg.zip`, one CSV per election from
 *      1949 to 2025 (measured 2026-09-09: twenty-six members, the whole series in one archive).
 *      dl-de/by-2.0.
 *    · THE CHAMBER — the same office's «Bundestagswahlen seit 1949» database, which is the only
 *      published table that carries SEATS per party per election, split into the seats won in
 *      constituencies and the seats won from a Land list. dl-de/by-2.0.
 *    · BOUNDARIES 1980–2021 — Harvard Dataverse doi:10.7910/DVN/LI9BHM, CC0, one shapefile per
 *      election, built by dissolving BKG's VG5000 municipal geometry onto the constituencies of
 *      the day. ⚠ EPSG:25832, not WGS84 — see `utmZone32Inverse` below.
 *    · BOUNDARIES 2025 — the Bundeswahlleiterin's own WGS84 shapefile, dl-de/by-2.0, because for
 *      the current map the commission publishes the authoritative geometry directly.
 *
 *  ⚠ NO BOUNDARY DATA EXISTS FOR 1949–1976 IN ANY REDISTRIBUTABLE FORM (checked 2026-09-09: the
 *  Harvard series begins at 1980 and the commission's own geometry begins at 2009). Those eight
 *  elections are therefore carried WITHOUT a map — `geo` is absent, which the schema allows — and
 *  the reader gets the chamber and the parties but no fill. That is the honest state of the
 *  record; inventing polygons for them would be worse than having none.
 *
 *  ══ THE ONE THING THIS FILE MUST NOT GET WRONG ══════════════════════════════════════════════
 *  ⚠ THE FIRST VOTE ELECTS A PERSON; THE SECOND VOTE DECIDES THE CHAMBER. Colouring a constituency
 *  by its first-vote winner and then reading the map as «who governs» is the single mistake this
 *  layer could make, and since the 2023 reform it is not even approximately right: in 2025, 299
 *  constituencies produced 299 first-place finishers but only 276 of them received a seat, because
 *  a party may no longer hold more constituency seats than its second-vote share earns
 *  (Überhang- und Ausgleichsmandate were abolished). So:
 *      · `d[cd].w` is THE PARTY THAT CAME FIRST IN THAT CONSTITUENCY ON THE FIRST VOTE. Nothing
 *        more. It does not assert that anyone from that party sits in the Bundestag.
 *      · `n[].seats / dseats / lseats` are the SEATS ACTUALLY HELD, taken from the commission's
 *        seat table, never counted off the map.
 *  For 2025 the two disagree by design and the data says so: the district winners add up to 299,
 *  the constituency seats add up to 276.
 *
 *      node scripts/elections/_selftest.mjs de
 * ==========================================================================*/
import { zipEntries, shapefileToGeoJSON, simplifyGeoJSON, mapCoords } from '../lib/elections-geo.mjs';
import { createHash } from 'node:crypto';

export const about = 'Germany · Bundestag, all 21 elections 1949–2025 (Bundeswahlleiterin, dl-de/by-2.0; boundaries 1980–2021 Harvard Dataverse CC0)';

/* ── the upstream files ────────────────────────────────────────────────────────────────────────
   ⚠ These are content-addressed DAM URLs, not directory listings, and the office does not publish
   an index of them. They were read off bundeswahlleiterin.de's own results pages on 2026-09-09;
   if one 404s the build fails loudly rather than shipping a shorter series. */
const KERG_ZIP = 'https://www.bundeswahlleiterin.de/dam/jcr/ce2d2b6a-f211-4355-8eea-355c98cd4e47/btw_kerg.zip';
const SEATS_CSV = 'https://www.bundeswahlleiterin.de/dam/jcr/24d8e745-920d-431a-893a-12805bc7ef40/btw_ab49_datenbank_ergebnisse.csv';
const GEO_2025 = 'https://www.bundeswahlleiterin.de/dam/jcr/556bec9c-be80-4818-a368-fe6596f15f08/btw25_geometrie_wahlkreise_shp_geo.zip';
const DVN_DOI = 'doi:10.7910/DVN/LI9BHM';
const DVN_META = 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=' + DVN_DOI;
const DVN_FILE = 'https://dataverse.harvard.edu/api/access/datafile/';

const SRC_BWL = 'Die Bundeswahlleiterin, Wiesbaden — Ergebnisse der Bundestagswahlen';
const LIC_BWL = 'Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2.0)';
const SRC_GEO_DVN = 'Boundaries: Harvard Dataverse, German Federal Electoral District Boundaries 1980–2025 (' + DVN_DOI + ')';
const LIC_GEO_DVN = 'CC0 1.0';

/* ⚠ SIMPLIFICATION TOLERANCE, IN DEGREES, MEASURED NOT GUESSED. 0.004° is 280 m north–south and
   250 m east–west at 51 °N. Germany's smallest constituency (Berlin-Mitte) is 40 km²; at this
   tolerance its outline keeps every bend a reader can see at the zoom where 299 districts fit on
   one screen, and the thirteen boundary eras come to a size the repository can carry — the
   unsimplified Harvard geometry is 3.6 MB PER ERA because it is a dissolve of 11,000 municipal
   outlines. Raise it and coastal islands start to vanish; lower it and this pack alone outweighs
   every other data file IntMap ships. ⚠ INVALIDATED IF the source geometry ever ships pre-
   generalised (then this would remove real detail twice). */
const TOL = 0.004;
const DECIMALS = 4;   /* 11 m at this latitude — finer than the tolerance, so it costs nothing */

/* ══ EPSG:25832 → WGS84 ════════════════════════════════════════════════════════════════════════
   The Harvard series is projected (ETRS89 / UTM zone 32N). Handing those metres to MapLibre does
   not fail — it draws 299 districts in the Gulf of Guinea. This is the inverse transverse-Mercator
   Krüger series to sixth order, GRS80 ellipsoid, which is what the .prj asks for.
   ⚠ VERIFIED, NOT ASSUMED: reprojecting the Harvard 2025 file and comparing its bounding boxes to
   the commission's own WGS84 2025 file agrees to 1e-13° on the western edge of constituency 1
   (measured 2026-09-09). The residual differences between the two files are real differences in
   how each was built (municipal dissolve vs. surveyed boundary), not projection error.
   ⚠ ETRS89 and WGS84 have drifted about 0.8 m apart since 1989; that is 3,500 times smaller than
   TOL, so no datum shift is applied and none would be visible. */
function utmZone32Inverse() {
  const a = 6378137, f = 1 / 298.257222101;           /* GRS80, as named in the .prj */
  const n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  const A = a / (1 + n) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  const k0 = 0.9996, FE = 500000, FN = 0, lon0 = (32 * 6 - 183) * Math.PI / 180;
  const beta = [
    n / 2 - 2 * n2 / 3 + 37 * n3 / 96 - n4 / 360 - 81 * n5 / 512 + 96199 * n6 / 604800,
    n2 / 48 + n3 / 15 - 437 * n4 / 1440 + 46 * n5 / 105 - 1118711 * n6 / 3870720,
    17 * n3 / 480 - 37 * n4 / 840 - 209 * n5 / 4480 + 5569 * n6 / 90720,
    4397 * n4 / 161280 - 11 * n5 / 504 - 830251 * n6 / 7257600,
    4583 * n5 / 161280 - 108847 * n6 / 3991680,
    20648693 * n6 / 638668800];
  const delta = [
    2 * n - 2 * n2 / 3 - 2 * n3 + 116 * n4 / 45 + 26 * n5 / 45 - 2854 * n6 / 675,
    7 * n2 / 3 - 8 * n3 / 5 - 227 * n4 / 45 + 2704 * n5 / 315 + 2323 * n6 / 945,
    56 * n3 / 15 - 136 * n4 / 35 - 1262 * n5 / 105 + 73814 * n6 / 2835,
    4279 * n4 / 630 - 332 * n5 / 35 - 399572 * n6 / 14175,
    4174 * n5 / 315 - 144838 * n6 / 6237,
    601676 * n6 / 22275];
  return ([E, N]) => {
    const xi = (N - FN) / (k0 * A), eta = (E - FE) / (k0 * A);
    let xi1 = xi, eta1 = eta;
    for (let j = 1; j <= 6; j++) {
      xi1 -= beta[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
      eta1 -= beta[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    }
    const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1));
    let lat = chi;
    for (let j = 1; j <= 6; j++) lat += delta[j - 1] * Math.sin(2 * j * chi);
    return [(lon0 + Math.atan(Math.sinh(eta1) / Math.cos(xi1))) * 180 / Math.PI, lat * 180 / Math.PI];
  };
}

/* ══ SMALL READERS ═════════════════════════════════════════════════════════════════════════════ */

/** Semicolon CSV with quoted fields. ⚠ The seat database has NEWLINES INSIDE quoted header cells
 *  («Mecklenburg-\nVorpommern»), so splitting on \n first and on ; second reads it as 138 columns
 *  of nonsense. This walks the bytes. */
function parseCsv(text, sep = ';') {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') { field += c; continue; }
      if (text[i + 1] === '"') { field += '"'; i++; continue; }
      quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** ⚠ THE ARCHIVE IS NOT ONE ENCODING. Everything the office published up to 2013 is
 *  windows-1252 and everything from 2017 is UTF-8 with a BOM, and nothing in the file says which.
 *  Asking is better than knowing: a strict UTF-8 decode throws on cp1252 umlauts, and cp1252 has
 *  no invalid bytes, so «try UTF-8, fall back» is decidable rather than remembered. */
function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

/** German numbers: 1.234.567 and 12,3. An empty cell, a dash or a blank is ABSENT, not zero
 *  (elections-schema.mjs §results). */
function num(s) {
  const t = String(s == null ? '' : s).replace(/\./g, '').replace(',', '.').trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const MONTHS_DE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august',
  'september', 'oktober', 'november', 'dezember'];

/** «14. August 1949» or «23.02.2025» → 1949-08-14. Throws rather than guessing: an election on the
 *  wrong day sorts into the wrong decade of the reader's timeline. */
function germanDate(s) {
  let m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s || '');
  if (m) return m[3] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
  m = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s+(\d{4})/.exec(s || '');
  if (m) {
    const mi = MONTHS_DE.indexOf(m[2].toLowerCase());
    if (mi >= 0) return m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
  }
  throw new Error('cannot read a polling day out of «' + String(s).slice(0, 80) + '»');
}

/* ══ PARTIES ═══════════════════════════════════════════════════════════════════════════════════
   ⚠ THE PARTY TABLE IS NOT WRITTEN OUT HERE. It is the set of names the two upstream files
   actually use, and it comes to 160-odd entries across seventy-six years, most of which stood once
   and vanished. Writing that list by hand would be the «埋め込み一覧で、実体から導けるもの» that
   `.agents/rules/no-ad-hoc-hardcoding.md` §1 forbids, and it would silently drop the next party to
   contest a constituency. What IS written out is the only thing no upstream carries: colour. */

/** One id per party, derived from the abbreviation the commission prints. The seat database says
 *  «Die Linke» and the 2025 returns say «DIE LINKE»; «ÖDP» and «ödp» are the same party in
 *  different decades of typesetting. Folding case and punctuation makes those one id instead of
 *  two half-parties that each hold half the seats. */
function partySlug(name) {
  const s = String(name)
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return s || 'x';
}

/* The colours German television has used on election night for as long as there has been colour
   television. ⚠ Keyed by SLUG, so the same entry serves «GRÜNE», «Grüne» and «B90/Gr». */
const BROADCAST_COLOURS = {
  cdu: '#1a1a1a',        /* black — CDU */
  csu: '#0080c8',        /* light blue — CSU */
  spd: '#e3000f',        /* red */
  fdp: '#ffcc00',        /* yellow */
  gruene: '#46962b',     /* green */
  b90gr: '#46962b',      /* Bündnis 90/Grüne, listed separately for 1990 when they ran apart */
  dielinke: '#be3075',   /* magenta — PDS, then Die Linke; the commission uses one row for both */
  afd: '#009ee0',        /* cyan-blue */
  bsw: '#7d254f',        /* Bündnis Sahra Wagenknecht */
  ssw: '#003c8f',        /* Südschleswigscher Wählerverband */
};

/** ⚠ THERE IS NO BROADCAST CONVENTION FOR A PARTY THAT DISSOLVED IN 1957, and inventing one
 *  constant per party would be 160 numbers whose origin nobody could state. So every party outside
 *  the table above gets a colour DERIVED from its id: a golden-angle walk around the hue circle at
 *  fixed saturation and lightness, which is deterministic (the same party is the same colour in
 *  every rebuild), collision-resistant, and legible against the map. It says nothing about the
 *  party's politics and is not meant to. */
function derivedColour(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  const hue = (h * 137.508) % 360, sat = 0.42, lig = 0.46;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lig - c / 2;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6];
  return '#' + t.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ══ THE RETURNS ═══════════════════════════════════════════════════════════════════════════════ */

/** kerg2 — the tidy long form the commission has published since 2017. One row per
 *  (area, group, vote), so nothing has to be inferred from column positions. */
function readKerg2(text) {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const hi = rows.findIndex(r => r[0] === 'Wahlart');
  if (hi < 0) throw new Error('kerg2 has no header row');
  const H = rows[hi];
  const col = Object.fromEntries(H.map((h, i) => [h, i]));
  const out = { date: null, districts: new Map() };
  for (const r of rows.slice(hi + 1)) {
    if (r.length < H.length) continue;
    if (!out.date) out.date = germanDate(r[col.Wahltag]);
    if (r[col.Gebietsart] !== 'Wahlkreis') continue;
    const cd = String(Number(r[col.Gebietsnummer])).padStart(3, '0');
    let d = out.districts.get(cd);
    if (!d) out.districts.set(cd, d = { cd, name: r[col.Gebietsname], votes: new Map(), valid: null, declared: null });
    const group = r[col.Gruppenname], stimme = r[col.Stimme], n = num(r[col.Anzahl]);
    /* ⚠ Stimme 1 is the FIRST vote (the person); Stimme 2 is the second (the party list). Only the
       first vote can name a constituency winner, and taking the second by mistake would repaint
       roughly a third of the map. */
    if (stimme !== '1') continue;
    if (r[col.Gruppenart] === 'System-Gruppe') { if (group === 'Gültige') d.valid = n; continue; }
    if (n != null) d.votes.set(group, n);
    /* The commission itself names the winner in `Gewählt`; where it does, that is the record and
       this file does not second-guess it by re-running the arithmetic. */
    const won = (r[col['Gewählt']] || '').trim();
    if (won && won !== '–' && won !== '-') d.declared = won;
  }
  return out;
}

/** kerg — the wide form, one column group per party, used for every election from 1949 to 2013.
 *  ⚠ THE LAYOUT IS NOT THE SAME IN ANY TWO DECADES: 1949 has one vote and one column per party,
 *  1953–2009 have two, 2013 has four (this election and the previous one), and the leading
 *  columns gained and lost fields along the way. So nothing here is positional. The header block
 *  is found by walking back from the first numbered row, the group names are carried rightwards,
 *  and the party columns are «everything after the last column belonging to the group whose name
 *  begins Gültige» — the commission has put the valid-vote total immediately before the parties in
 *  every one of these files since 1949. */
function readKergWide(text) {
  const rows = parseCsv(text);
  const width = Math.max(...rows.map(r => r.length));
  const dataAt = rows.findIndex(r => /^\s*\d+\s*$/.test(r[0] || ''));
  if (dataAt < 1) throw new Error('kerg has no numbered rows');
  /* Header rows = the wide rows immediately above the data; the licence/comment preamble is narrow
     («# (c) Der Bundeswahlleiter…», «Bundestagswahl 2021;»). ⚠ SEVERAL YEARS PUT A SINGLE EMPTY
     CELL BETWEEN THE HEADER AND THE DATA (1980, 1983, 1998, 2002 — measured), which is neither
     header nor preamble; walking back has to step over it or the header block comes out empty. */
  let hStart = dataAt;
  const raw = [];
  while (hStart > 0) {
    const r = rows[hStart - 1];
    const blank = r.every(c => !(c || '').trim());
    if (!blank && r.length < width / 2) break;
    if (!blank) raw.unshift(r);
    hStart--;
  }
  const head = raw.map(r => {
    const out = []; let carry = '';
    for (let i = 0; i < width; i++) { if ((r[i] || '').trim()) carry = r[i].trim(); out.push(carry); }
    return out;
  });
  if (!head.length) throw new Error('kerg has no header block');
  const groups = head[0];
  const kinds = head[1] || new Array(width).fill('');
  const period = head[2] || new Array(width).fill('');

  let lastValid = -1;
  for (let i = 0; i < width; i++) if (/^g(ü|ue)ltige/i.test(groups[i] || '')) lastValid = i;
  if (lastValid < 0) throw new Error('kerg has no «Gültige» column to anchor the party columns on');

  /* Which sub-column of a group is the first vote? Files that label their columns say
     «Erststimmen»; 1949 labels nothing because there was only one vote to cast. */
  const labelled = kinds.some(k => /Erststimmen/i.test(k || ''));
  const isFirstVote = (i) => !labelled || /Erststimmen/i.test(kinds[i] || '');
  /* 2013 repeats every group for the previous election; «Vorperiode» is that, and it is not this
     election's result. Unlabelled files have no previous-period columns at all. */
  const isFinal = (i) => !/Vorperiode/i.test(period[i] || '');

  const firstVoteCol = new Map();   /* group name → column index */
  for (let i = lastValid + 1; i < width; i++) {
    const g = (groups[i] || '').trim();
    if (!g || !isFirstVote(i) || !isFinal(i) || firstVoteCol.has(g)) continue;
    firstVoteCol.set(g, i);
  }
  let validCol = -1;
  for (let i = 0; i <= lastValid; i++) if (/^g(ü|ue)ltige/i.test(groups[i] || '') && isFirstVote(i) && isFinal(i)) { validCol = i; break; }

  /* ⚠ A ROW NUMBERED 900 OR ABOVE IS AN AGGREGATE, NOT A CONSTITUENCY — 901…916 are the Länder and
     999 is the federal total, and every one of them carries a full set of vote columns that would
     otherwise be read as a district and paint nothing. The rule is checked, not trusted: what is
     left has to be 1…N with no gaps. */
  const districts = new Map();
  for (const r of rows.slice(dataAt)) {
    if (!/^\s*\d+\s*$/.test(r[0] || '')) continue;   /* blank spacer rows read as 0 if coerced */
    const nr = Number(r[0]);
    if (nr >= 900) continue;
    const cd = String(nr).padStart(3, '0');
    const d = { cd, name: (r[1] || '').trim(), votes: new Map(), valid: validCol >= 0 ? num(r[validCol]) : null, declared: null };
    for (const [g, i] of firstVoteCol) { const v = num(r[i]); if (v != null && v > 0) d.votes.set(g, v); }
    districts.set(cd, d);
  }
  const nrs = [...districts.keys()].map(Number).sort((a, b) => a - b);
  for (let i = 0; i < nrs.length; i++) {
    if (nrs[i] !== i + 1) throw new Error('constituency numbers are not 1…N (saw ' + nrs[i] + ' at position ' + (i + 1) + ')');
  }
  /* the polling day is in the file's own comment line: «# Wahl zum 1. Deutschen Bundestag (14. August 1949)» */
  let date = null;
  for (const r of rows.slice(0, hStart)) {
    const line = r.join(' ');
    const m = /\(([^)]*\d{4})\)/.exec(line);
    if (m) { try { date = germanDate(m[1]); break; } catch { /* a bracketed year that is not a date */ } }
  }
  return { date, districts };
}

/* ══ BOUNDARIES ════════════════════════════════════════════════════════════════════════════════ */

/** Constituency names as printed differ between the two publishers only in typography — an en dash
 *  for a hyphen, capitals in the 1976 and 1980 returns, doubled spaces. This folds exactly that
 *  much and nothing else, so «STEINBURG - DITHMARSCHEN SÜD» and «Steinburg – Dithmarschen Süd» are
 *  one name and two genuinely different places stay two. */
const foldName = (s) => String(s || '').toLowerCase()
  .replace(/[‐-―−]/g, '-')
  .replace(/[\s.]+/g, ' ').replace(/\s*-\s*/g, '-').trim();

function toFeatureCollection(zipBuf, { reproject, expect, year }) {
  const fc = shapefileToGeoJSON(zipEntries(zipBuf), {});
  if (reproject) mapCoords(fc, reproject);
  const rows = fc.features.map(f => ({
    nr: Number(f.properties.WKR_NR),
    name: String(f.properties.WKR_NAME || '').trim(),
    land: String(f.properties.LAND_NAME || '').trim(),
    geometry: f.geometry,
    cd: null,
  }));
  for (const r of rows) if (!Number.isFinite(r.nr)) throw new Error(year + ': a boundary feature has no usable WKR_NR');

  /* ── the code the polygon claims, checked against the code the returns actually use ─────────
     ⚠ THE BOUNDARY FILE'S OWN NUMBERING IS NOT ALWAYS RIGHT. Measured 2026-09-09: the 2009 set
     numbers Hamburg-Wandsbek and Hamburg-Nord both 22, and Meißen and Leipzig-Land both 155, so
     23 and 156 have no polygon at all — two constituencies would be drawn twice and two would be
     holes in the choropleth, which reads as «nobody won here».
     The repair is not a list of the four affected rows: the returns and the boundary file agree on
     the NAME of every constituency, so a polygon whose number is impossible is placed by its name,
     and a polygon that cannot be placed at all fails the build. */
  const byFolded = new Map();
  for (const [cd, name] of expect) {
    const k = foldName(name);
    if (!byFolded.has(k)) byFolded.set(k, []);
    byFolded.get(k).push(cd);
  }
  const rowsByFolded = new Map();
  for (const r of rows) {
    const k = foldName(r.name);
    rowsByFolded.set(k, (rowsByFolded.get(k) || 0) + 1);
  }
  const taken = new Map();
  /* ⚠ THE NAME DECIDES FIRST, NOT THE NUMBER, and that ordering is the whole repair. In 2009 the
     polygon labelled 22 that is really 23 is «Hamburg-Wandsbek»; taking numbers first hands code
     22 to Wandsbek, and the genuinely-22 polygon («Hamburg-Nord») is then left with nothing to be.
     Only a name that identifies exactly one constituency AND belongs to exactly one polygon is
     allowed to decide, so nothing is placed on an ambiguity. */
  for (const r of rows) {
    const k = foldName(r.name);
    const cands = byFolded.get(k) || [];
    if (cands.length !== 1 || rowsByFolded.get(k) !== 1 || taken.has(cands[0])) continue;
    r.cd = cands[0]; taken.set(cands[0], r);
  }
  /* whatever the names could not place — a constituency renamed between the two files — falls back
     to the number the boundary file states, and then to whatever is left over by name */
  for (const r of rows) {
    if (r.cd) continue;
    const cd = String(r.nr).padStart(3, '0');
    if (!expect.has(cd) || taken.has(cd)) continue;
    r.cd = cd; taken.set(cd, r);
  }
  for (const r of rows) {
    if (r.cd) continue;
    const cands = (byFolded.get(foldName(r.name)) || []).filter(cd => !taken.has(cd));
    if (cands.length !== 1) {
      throw new Error(year + ': boundary «' + r.name + '» is numbered ' + r.nr +
        ', which the returns do not have free, and its name matches ' + cands.length + ' unplaced constituencies');
    }
    r.cd = cands[0]; taken.set(cands[0], r);
  }

  const out = {
    type: 'FeatureCollection',
    features: rows.map(r => ({
      type: 'Feature',
      /* ⚠ `n.native` IS THE SAME STRING AS `n.en` AND THAT IS CORRECT: «Steinburg – Dithmarschen
         Süd» is a place, not a phrase, and no translation of it exists on any ballot paper.
         ⚠ The label is the BOUNDARY file's, not the returns': the returns for 1976, 1980 and 1983
         are typeset in capitals («FLENSBURG - SCHLESWIG») and a map is not a telegram. */
      properties: { cd: r.cd, n: { en: r.name || expect.get(r.cd), native: r.name || expect.get(r.cd) }, land: r.land },
      geometry: r.geometry,
    })),
  };
  simplifyGeoJSON(out, { tolerance: TOL, decimals: DECIMALS });
  out.features.sort((a, b) => a.properties.cd.localeCompare(b.properties.cd));
  return out;
}

/* ══ BUILD ═════════════════════════════════════════════════════════════════════════════════════ */

/* ── the note the reader reads ─────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ AND EACH LANGUAGE BUILDS ITS OWN SENTENCE. The counts do not fall in the same place in a
   Japanese, Korean or German clause as in an English one, so this is nine sentences that share a
   number — not one English sentence with the number swapped out.
   ⚠ BOTH `jp` AND `ja`: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the key
   js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data uses. */
/** ⚠ `constituencies` IS THE NUMBER OF CONSTITUENCIES CONTESTED AND `constituencySeats` THE NUMBER
 *  OF MEMBERS THEY ACTUALLY RETURNED, and since the 2023 reform those are two different numbers
 *  (2025: 299 and 276). Saying so is the difference between a reader who understands the map and a
 *  reader who thinks the arithmetic is broken; when the two agree, the sentence is not written at
 *  all. `hasMap` is false for the elections whose constituency outlines this pack has no file for —
 *  a note that speaks about a colour nobody can see is worse than a shorter note. */
function noteFor(hasMap, total, constituencies, constituencySeats) {
  const short = constituencySeats != null && constituencySeats < constituencies;
  const jp = (hasMap ? '色は第一票（Erststimme）でその選挙区を制した政党です。' : '') +
    '議席は各党の得票率に応じて配分され、勝った選挙区の数では決まりません。そのため選挙区での勝利が' +
    '少ない政党が多くの議席を持つことがあります。この連邦議会は ' + total + ' 議席で、' + constituencies +
    ' の選挙区が争われました。' + (short ? 'そのうち実際に議席となったのは ' + constituencySeats +
      ' 議席だけです。2023 年の改正以降、選挙区で勝っても、その州での自党の第二票に見合う範囲でしか' +
      '議席にならないためです。' : '');
  return {
    en: (hasMap ? 'The colour is the party that won the constituency on the first vote. ' : '') +
      'Seats are apportioned by each party’s share of the vote rather than by the number of ' +
      'constituencies it won, so a party can win few constituencies and still hold many seats. This ' +
      'Bundestag has ' + total + ' seats and ' + constituencies + ' constituencies were contested.' +
      (short ? ' They returned only ' + constituencySeats + ' members: since the 2023 reform a ' +
        'constituency winner takes the seat only as far as their party’s second vote in that Land ' +
        'covers it.' : ''),
    ja: jp, jp,
    de: (hasMap ? 'Die Farbe zeigt die Partei, die den Wahlkreis mit der Erststimme gewonnen hat. ' : '') +
      'Die Sitze werden nach dem Stimmenanteil der Parteien vergeben und nicht nach der Zahl der ' +
      'gewonnenen Wahlkreise, eine Partei kann also wenige Wahlkreise gewinnen und trotzdem viele ' +
      'Sitze halten. Dieser Bundestag hat ' + total + ' Sitze, gewählt wurde in ' + constituencies +
      ' Wahlkreisen.' + (short ? ' Aus ihnen zogen nur ' + constituencySeats + ' Abgeordnete ein: Seit ' +
        'der Reform von 2023 erhält eine Wahlkreisgewinnerin oder ein Wahlkreisgewinner den Sitz nur ' +
        'so weit, wie das Zweitstimmenergebnis der Partei im Land ihn deckt.' : ''),
    ru: (hasMap ? 'Цвет — партия, победившая в округе по первому голосу. ' : '') +
      'Места распределяются по доле голосов за партии, а не по числу выигранных округов, поэтому ' +
      'партия может выиграть немного округов и всё равно иметь много мест. В этом бундестаге ' +
      total + ' мест, выборы прошли в ' + constituencies + ' округах.' + (short ? ' От них прошли ' +
        'только ' + constituencySeats + ' депутатов: после реформы 2023 года победитель округа ' +
        'получает место лишь в той мере, в какой его покрывает результат его партии по вторым ' +
        'голосам в этой земле.' : ''),
    es: (hasMap ? 'El color corresponde al partido que ganó la circunscripción con el primer voto. ' : '') +
      'Los escaños se reparten según la proporción de votos de cada partido y no según el número de ' +
      'circunscripciones ganadas, de modo que un partido puede ganar pocas y aun así tener muchos ' +
      'escaños. Este Bundestag tiene ' + total + ' escaños y se votó en ' + constituencies +
      ' circunscripciones.' + (short ? ' De ellas solo entraron ' + constituencySeats + ' diputados: ' +
        'desde la reforma de 2023 quien gana una circunscripción ocupa el escaño únicamente en la ' +
        'medida en que lo cubre el segundo voto de su partido en ese Land.' : ''),
    fr: (hasMap ? 'La couleur est celle du parti qui a remporté la circonscription au premier vote. ' : '') +
      'Les sièges sont répartis selon la part des voix de chaque parti et non selon le nombre de ' +
      'circonscriptions gagnées : un parti peut donc en gagner peu et détenir malgré tout beaucoup de ' +
      'sièges. Ce Bundestag compte ' + total + ' sièges et le scrutin a porté sur ' + constituencies +
      ' circonscriptions.' + (short ? ' Elles n’ont envoyé que ' + constituencySeats + ' élus : depuis ' +
        'la réforme de 2023, le vainqueur d’une circonscription n’occupe le siège que dans la limite ' +
        'du second vote de son parti dans ce Land.' : ''),
    ko: (hasMap ? '색은 제1투표에서 그 선거구를 차지한 정당입니다. ' : '') +
      '의석은 이긴 선거구 수가 아니라 각 정당의 득표율에 따라 배분되므로, 선거구에서 적게 이긴 정당이 ' +
      '많은 의석을 가질 수 있습니다. 이 연방의회는 ' + total + '석이며 ' + constituencies +
      '개 선거구에서 선거가 치러졌습니다.' + (short ? ' 그중 실제로 의석이 된 것은 ' + constituencySeats +
        '석뿐입니다. 2023년 개정 이후 선거구에서 이기더라도 해당 주에서 그 정당의 제2투표 결과가 ' +
        '뒷받침하는 만큼만 의석이 됩니다.' : ''),
    zh: (hasMap ? '顏色代表以第一票贏得該選區的政黨。' : '') +
      '議席依各政黨的得票比例分配，而不是依贏得的選區數，因此贏得選區不多的政黨仍可能擁有很多議席。' +
      '本屆聯邦議院共 ' + total + ' 席，在 ' + constituencies + ' 個選區進行選舉。' + (short ?
        '其中實際成為議席的只有 ' + constituencySeats + ' 席：2023 年改革後，選區勝出者只有在該邦所屬' +
        '政黨第二票足以支持的範圍內才能取得議席。' : ''),
    'zh-hans': (hasMap ? '颜色代表以第一票赢得该选区的政党。' : '') +
      '议席依各政党的得票比例分配，而不是依赢得的选区数，因此赢得选区不多的政党仍可能拥有很多议席。' +
      '本届联邦议院共 ' + total + ' 席，在 ' + constituencies + ' 个选区进行选举。' + (short ?
        '其中实际成为议席的只有 ' + constituencySeats + ' 席：2023 年改革后，选区胜出者只有在该邦所属' +
        '政党第二票足以支持的范围内才能取得议席。' : ''),
  };
}

export async function build(ctx) {
  /* ⚠ DATAVERSE ANSWERS 303 AND THEN S3 HANGS UP. Measured 2026-09-09: one of the thirteen 3–5 MB
     downloads closed mid-body («other side closed») and took the whole build with it. The shared
     `get` has no retry, so the retry lives here. */
  const get = async (url, opts) => {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try { return await ctx.get(url, opts); }
      catch (e) { last = e; await new Promise(r => setTimeout(r, 500 * (attempt + 1))); }
    }
    throw last;
  };

  /* ── 1. the returns, one CSV per election, discovered from the archive itself ───────────────
     ⚠ NOT A LIST OF YEARS. The archive holds `btw<year>_kerg.csv` and, since 2017, a tidy
     `btw<year>_kerg2.csv` beside it; the years are whatever it contains, so the next election
     appears here by being published, not by being typed in.
     ⚠ `btw2021-w_*` is the 2021 result AS AMENDED by the February 2024 partial re-run in Berlin.
     It is a different fact from «the election held on 26 September 2021», and the commission's own
     seat table (the «ohne Abgeordnete BE» columns, which is the series used below) reports the
     chamber as elected in 2021. The suffixed files are therefore skipped and the plain ones used,
     so that the map, the bar and the seat totals all describe the same day. */
  const archive = zipEntries(await get(KERG_ZIP));
  const byYear = new Map();
  for (const [name, buf] of archive) {
    const m = /^btw(\d{4})(-[a-z]+)?_kerg(2)?\.csv$/i.exec(name);
    if (!m || m[2]) continue;
    const y = Number(m[1]);
    const slot = byYear.get(y) || {};
    slot[m[3] ? 'kerg2' : 'kerg'] = buf;
    byYear.set(y, slot);
  }
  if (!byYear.size) throw new Error('btw_kerg.zip held no recognisable returns');

  /* ── 2. the chamber: seats per party per election ──────────────────────────────────────────
     The three columns wanted are «Sitze ohne Abgeordnete BE» → Gesamt / Wahlkreis / Landesliste,
     found by their own header text rather than by counting to 85. */
  const seatRows = parseCsv(decode(await get(SEATS_CSV)));
  const shi = seatRows.findIndex(r => r[0] === 'Merkmal/Partei');
  if (shi < 0) throw new Error('the seat database has no «Merkmal/Partei» header');
  const carry = (r) => { const o = []; let c = ''; for (let i = 0; i < seatRows[shi].length; i++) { if ((r[i] || '').trim()) c = r[i].trim(); o.push(c); } return o; };
  const area = carry(seatRows[shi]), measure = carry(seatRows[shi + 1]), unit = seatRows[shi + 2] || [];
  const findCol = (m, u) => {
    for (let i = 0; i < area.length; i++) {
      if (area[i] !== 'Deutschland') continue;
      if (measure[i] === m && (unit[i] || '').trim() === u) return i;
    }
    return -1;
  };
  const SEAT_MEASURE = 'Sitze ohne Abgeordnete BE';
  const cSeats = findCol(SEAT_MEASURE, 'Gesamt'), cWk = findCol(SEAT_MEASURE, 'Wahlkreis'), cLl = findCol(SEAT_MEASURE, 'Landesliste');
  /* the national second-vote share, for the parties that hold no seats but shape the story */
  let cPct = -1;
  for (let i = 0; i < area.length; i++) if (area[i] === 'Deutschland' && measure[i] === 'Zweitstimmen' && (unit[i] || '').trim() === '%') { cPct = i; break; }
  let cPct1 = -1;
  for (let i = 0; i < area.length; i++) if (area[i] === 'Deutschland' && measure[i] === 'Erststimmen' && (unit[i] || '').trim() === '%') { cPct1 = i; break; }
  /* the national FIRST-vote count, which is what identifies a party across the two vocabularies */
  let cE = -1;
  for (let i = 0; i < area.length; i++) if (area[i] === 'Deutschland' && measure[i] === 'Erststimmen' && (unit[i] || '').trim() === 'Anzahl') { cE = i; break; }
  if (cSeats < 0 || cWk < 0 || cLl < 0 || cPct < 0) throw new Error('the seat database no longer has the «' + SEAT_MEASURE + '» columns');

  /* «gültige Stimmen/Sitze insgesamt» is the row that carries the size of the chamber */
  const TOTALS_ROW = /^g(ü|ue)ltige Stimmen\/Sitze insgesamt$/i;
  const national = new Map();     /* year → { total, dseats, parties:[{name,seats,dseats,lseats,pct}] } */
  for (const r of seatRows.slice(shi + 3)) {
    const y = Number(r[1]);
    if (!Number.isFinite(y) || !/^\d{4}$/.test((r[1] || '').trim())) continue;
    let e = national.get(y);
    if (!e) national.set(y, e = { total: null, dseats: null, parties: [] });
    if (TOTALS_ROW.test(r[0] || '')) { e.total = num(r[cSeats]); e.dseats = num(r[cWk]); continue; }
    if (/^(Wahlberechtigte|Wählende|ungültige Stimmen)$/i.test((r[0] || '').trim())) continue;
    const seats = num(r[cSeats]);
    const pct = num(r[cPct]);
    const pct1 = cPct1 >= 0 ? num(r[cPct1]) : null;
    if (seats == null && pct == null && pct1 == null) continue;
    /* ⚠ 1949 had ONE vote, so the «Zweitstimmen» share does not exist for it; the first-vote share
       is the national share that year, and it is the same ballot. */
    e.parties.push({
      name: (r[0] || '').trim(), seats, dseats: num(r[cWk]), lseats: num(r[cLl]),
      pct: pct != null ? pct : pct1, evotes: cE >= 0 ? num(r[cE]) : null,
    });
  }

  /* ── 3. boundaries: one file per election that has any, deduplicated by content ─────────────
     The Harvard set publishes one shapefile per election from 1980; the commission publishes 2025
     itself, in WGS84 and from the authoritative source, so that one is taken from the commission.
     ⚠ THE ERA IS NOT THE ELECTION (elections-schema.mjs). Two elections fought on the same
     boundaries must share one file or the reader downloads the same 300 KB twice, so the eras are
     found by hashing the finished geometry — measured, not assumed from the redistricting history. */
  /* the returns are read first, because the boundary numbering is checked against them */
  const returns = new Map();
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    const slot = byYear.get(y);
    const read = slot.kerg2 ? readKerg2(decode(slot.kerg2)) : readKergWide(decode(slot.kerg));
    if (!read.date) throw new Error(y + ': the returns do not state a polling day');
    returns.set(y, read);
  }

  const dvn = await get(DVN_META, { json: true });
  const dvnFiles = new Map();
  for (const f of (dvn.data?.latestVersion?.files || [])) {
    const m = /^GFEDB_(\d{4})\.zip$/i.exec(f.dataFile?.filename || '');
    if (m) dvnFiles.set(Number(m[1]), f.dataFile.id);
  }
  if (!dvnFiles.size) throw new Error(DVN_DOI + ' no longer publishes GFEDB_<year>.zip boundary files');

  const inverse = utmZone32Inverse();
  const geo = {};                 /* file name → FeatureCollection */
  const geoOfYear = new Map();    /* election year → file name */
  const geoSource = new Map();    /* file name → which upstream it came from */
  const seenHash = new Map();     /* content hash → file name */

  /* ⚠ WHICH ELECTION THE COMMISSION'S OWN FILE IS FOR IS NOT TYPED IN HERE — the shapefile names
     itself «btw25_geometrie_wahlkreise…», so the archive states its own election and a future
     round that swaps the URL for the next one does not have to remember to change a year as well. */
  const officialZip = await get(GEO_2025);
  const officialEntries = zipEntries(officialZip);
  let officialYear = null;
  for (const name of officialEntries.keys()) {
    const m = /^btw(\d{2})_/i.exec(name);
    if (m) { officialYear = 2000 + Number(m[1]); break; }
  }
  if (!officialYear) throw new Error('the commission boundary archive does not name its election');

  for (const y of [...new Set([...dvnFiles.keys(), officialYear])].sort((a, b) => a - b)) {
    if (!returns.has(y)) continue;   /* a boundary set for an election the returns do not cover */
    const official = y === officialYear;
    const expect = new Map([...returns.get(y).districts].map(([cd, r]) => [cd, r.name]));
    const fc = official
      ? toFeatureCollection(officialZip, { reproject: null, expect, year: y })
      : toFeatureCollection(await get(DVN_FILE + dvnFiles.get(y)), { reproject: inverse, expect, year: y });
    const hash = createHash('sha1').update(JSON.stringify(fc.features.map(f => [f.properties.cd, f.geometry]))).digest('hex');
    const prior = seenHash.get(hash);
    if (prior) { geoOfYear.set(y, prior); continue; }
    const key = 'de-wk-' + y + '.geo.json';
    seenHash.set(hash, key);
    geo[key] = fc;
    geoOfYear.set(y, key);
    geoSource.set(key, official ? { src: SRC_BWL, lic: LIC_BWL } : { src: SRC_GEO_DVN, lic: LIC_GEO_DVN });
  }

  /* ── 4. put an election together ────────────────────────────────────────────────────────────── */
  const parties = {};
  const usedSlug = new Map();     /* slug → the name first seen for it, for the party table */
  const partyId = (name) => {
    const slug = partySlug(name);
    if (!usedSlug.has(slug)) usedSlug.set(slug, name);
    return 'de:' + slug;
  };

  const elections = [];
  const res = {};
  for (const y of [...returns.keys()].sort((a, b) => a - b)) {
    const read = returns.get(y);
    const nat = national.get(y);
    if (!nat || nat.total == null) throw new Error(y + ': the seat database has no chamber size');

    const geoKey = geoOfYear.get(y) || null;
    const districtCount = read.districts.size;
    if (geoKey && geo[geoKey] && geo[geoKey].features.length !== districtCount) {
      /* a deduplicated era is shared, so check against the file actually referenced */
      throw new Error(y + ': ' + geoKey + ' has ' + geo[geoKey].features.length + ' polygons but the returns have ' + districtCount + ' constituencies');
    }

    /* ── the two publications do not use one party vocabulary, and the record itself says which
       names are the same party ───────────────────────────────────────────────────────────────
       ⚠ THE RETURNS NAME A PARTY AS IT WAS ON THE BALLOT; THE SEAT DATABASE NAMES IT AS THE OFFICE
       NAMES IT NOW. The 1990–2002 returns say «PDS» and the seat table says «Die Linke» for the
       same rows, so without this the map would colour four constituencies with a party the legend
       has never heard of, in a colour the bar does not use — one party appearing as two.
       ⚠ NOT AN ALIAS LIST. The identity is proved: the national first-vote count is published on
       both sides, and two names carrying the SAME seven-figure total in the same election are the
       same party. A rename this misses simply stays two names, which is what it looks like today. */
    const districtTotal = new Map();
    for (const row of read.districts.values()) {
      for (const [name, v] of row.votes) districtTotal.set(name, (districtTotal.get(name) || 0) + v);
    }
    const chamberByVotes = new Map();
    const chamberSlugs = new Set(nat.parties.map(p => partySlug(p.name)));
    for (const p of nat.parties) {
      if (p.evotes == null || p.evotes <= 0) continue;
      if (chamberByVotes.has(p.evotes)) chamberByVotes.set(p.evotes, null);   /* a tie proves nothing */
      else chamberByVotes.set(p.evotes, p.name);
    }
    const alias = new Map();
    for (const [name, total] of districtTotal) {
      if (chamberSlugs.has(partySlug(name))) continue;      /* both sides already agree */
      const other = chamberByVotes.get(total);
      if (other && partySlug(other) !== partySlug(name)) alias.set(name, other);
    }
    const localId = (name) => partyId(alias.get(name) || name);

    const d = {};
    for (const [cd, row] of read.districts) {
      const ranked = [...row.votes.entries()].sort((a, b) => b[1] - a[1]);
      /* ⚠ THE WINNER IS THE COMMISSION'S OWN `Gewählt` WHERE IT PUBLISHES ONE. Where it does not
         (every file before 2017) it is the party with most first votes, which is the same rule the
         returning officer applies — first past the post, one member, no threshold. */
      let winner = null;
      if (row.declared) winner = localId(row.declared);
      else if (ranked.length) winner = localId(ranked[0][0]);
      const c = ranked.map(([name, v]) => ({
        /* ⚠ GERMANY PUBLISHES ITS CONSTITUENCY RETURNS BY PARTY, NOT BY CANDIDATE — there is no
           candidate name anywhere in the open-data series (checked across all 26 members of the
           archive, 2026-09-09). `n` therefore carries the party's own printed abbreviation, which
           is exactly what a German constituency graphic shows beside each first-vote bar. */
        n: name, p: localId(name), v,
      }));
      /* the declared winner must be on the ballot we just listed, or one of the two is wrong */
      if (winner && c.length && !c.some(x => x.p === winner)) {
        throw new Error(y + ' · ' + cd + ': the declared winner ' + row.declared + ' cast no first votes');
      }
      const row2 = { c };
      if (winner) row2.w = winner;
      if (row.valid != null) row2.t = row.valid;
      d[cd] = row2;
    }

    const n = [];
    for (const p of nat.parties) {
      const id = partyId(p.name);
      const entry = { p: id };
      if (p.seats != null) entry.seats = p.seats;
      if (p.dseats != null) entry.dseats = p.dseats;
      if (p.lseats != null) entry.lseats = p.lseats;
      if (p.pct != null) entry.pct = p.pct;
      n.push(entry);
    }
    n.sort((a, b) => (b.seats || 0) - (a.seats || 0) || (b.pct || 0) - (a.pct || 0));

    /* ⚠ THE PARTY SEATS MUST ADD UP TO THE CHAMBER, or one of the two rows is being misread. This
       is the check that would have caught reading the «einschl. Abgeordnete BE» column for one
       election and the «ohne» column for the next. */
    const seatSum = n.reduce((s, r) => s + (r.seats || 0), 0);
    /* the members the constituencies actually returned — see noteFor(): from 2025 this is smaller
       than the number of constituencies, and a reader who is not told that reads a broken sum. */
    const dseatSum = n.reduce((s, r) => s + (r.dseats || 0), 0);
    if (seatSum !== nat.total) throw new Error(y + ': party seats add to ' + seatSum + ' but the chamber is ' + nat.total);

    /* ⚠ EVERY PARTY THE MAP COLOURS A CONSTITUENCY WITH MUST BE A PARTY THE BAR KNOWS ABOUT. This
       is the check that catches the vocabulary drift above going unfixed: a winner the chamber has
       never heard of is a party with a colour nobody can read and a seat count nobody can find.
       ⚠ It deliberately does NOT require the counts to agree. They do agree for every election
       from 1953 to 2021; they cannot in 2025 (299 constituencies, 276 constituency seats — the
       reform), and they do not in 1949, where «Parteilose» is the office's bucket for ALL the
       independents standing in a seat, so it can out-poll the leading party in a constituency
       where no single independent did. Both are facts about the record, not faults in this file. */
    const known = new Set(n.map(r => r.p));
    for (const [cd, row] of Object.entries(d)) {
      if (row.w && !known.has(row.w)) throw new Error(y + ' · ' + cd + ': ' + row.w + ' won the constituency but holds no row in the chamber table');
    }

    const resKey = 'de-' + y + '.res.json';
    res[resKey] = { d, n };

    /* ⚠ `districtSeats` IS THE NUMBER OF PIECES OF GROUND THE MAP CAN COLOUR, and the schema
       checks it against the polygon count. It is NOT «seats won in constituencies»: since the 2023
       reform those are two different numbers (2025: 299 constituencies, 276 constituency seats),
       and the difference is carried in `n[].dseats`, which sums to the smaller one. */
    const attribution = geoKey ? geoSource.get(geoKey) : null;
    elections.push({
      id: 'de-btw-' + y,
      polity: 'de',
      body: {
        en: 'Bundestag', native: 'Deutscher Bundestag', de: 'Deutscher Bundestag',
        ja: '連邦議会（ブンデスターク）', fr: 'Bundestag', es: 'Bundestag', ru: 'Бундестаг',
        ko: '연방의회(분데스탁)', 'zh-Hant': '聯邦議院', 'zh-Hans': '联邦议院',
      },
      date: read.date,
      y,
      geo: geoKey || undefined,
      res: resKey,
      seatsTotal: nat.total,
      districtSeats: districtCount,
      listSeats: nat.total - districtCount,
      note: noteFor(!!geoKey, nat.total, districtCount, dseatSum || null),
      src: SRC_BWL + (attribution && attribution.src !== SRC_BWL ? ' · ' + attribution.src : ''),
      lic: LIC_BWL + (attribution && attribution.lic !== LIC_BWL ? ' · ' + attribution.lic : ''),
    });
  }

  /* ── 5. the party table, built from what was actually referenced ────────────────────────────── */
  for (const [slug, name] of usedSlug) {
    parties['de:' + slug] = {
      n: { en: name, native: name, de: name },
      col: BROADCAST_COLOURS[slug] || derivedColour(slug),
    };
  }

  /* ── 6. where the reader is put when they open Germany ──────────────────────────────────────
     ⚠ NOT A TYPED-IN BOX. It is the extent of the most recent boundary file, so it cannot drift
     away from the geometry it is supposed to frame. */
  const newest = geoOfYear.get(Math.max(...[...geoOfYear.keys()]));
  const box = [[Infinity, Infinity], [-Infinity, -Infinity]];
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      box[0][0] = Math.min(box[0][0], c[0]); box[0][1] = Math.min(box[0][1], c[1]);
      box[1][0] = Math.max(box[1][0], c[0]); box[1][1] = Math.max(box[1][1], c[1]);
    } else c.forEach(walk);
  };
  for (const f of geo[newest].features) walk(f.geometry.coordinates);

  return {
    polities: [{
      id: 'de',
      n: {
        en: 'Germany', native: 'Deutschland', de: 'Deutschland', ja: 'ドイツ', fr: 'Allemagne',
        es: 'Alemania', ru: 'Германия', ko: '독일', 'zh-Hant': '德國', 'zh-Hans': '德国',
      },
      home: box,
    }],
    parties,
    elections,
    geo,
    res,
  };
}
