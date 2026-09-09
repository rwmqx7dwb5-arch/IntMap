/* ============================================================================
 *  IntMap · CANADA — THE HOUSE OF COMMONS   (#R582)
 * ----------------------------------------------------------------------------
 *  「アメリカ大統領選挙以外の選挙レイヤーも作って。衆院選、参院選など。欧米日豪韓中露」
 *
 *  The Senate of Canada is appointed and holds no election, so the House of Commons is the whole
 *  of this country's elected federal politics and this pack is all of it. Every member sits for a
 *  riding, so unlike Japan, Germany or Korea there is no half of the chamber the map cannot draw.
 *
 *  ══ THE LICENCE DECIDED WHICH ELECTIONS EXIST HERE, AND IT IS WORTH BEING EXACT ═════════════
 *  Elections Canada's own site publishes per-candidate returns for every general election since
 *  the 38th (2004). Its terms of use, read 2026-09-10, say the materials may be reproduced «for
 *  non-commercial purposes» and «may not be reproduced for the purposes of commercial
 *  redistribution without prior written permission». IntMap is a public repository that anybody may
 *  fork, so data that cannot be redistributed commercially cannot be committed to it, and «the file
 *  is on a government website» is not a licence.
 *
 *  The Government of Canada re-publishes some of the SAME files on open.canada.ca under the Open
 *  Government Licence – Canada, which does permit commercial redistribution with attribution. What
 *  is there, measured 2026-09-10 over all 54 datasets of the `elections` organisation:
 *
 *    · «Nth General Election: Official Voting Results» (ca-ogl-lgo) — the 42nd, 43rd and 44th only.
 *      Table 12 of each is the per-candidate return, with the district NUMBER in its own column.
 *    · «Poll-by-Poll Results – Nth General Election» (ca-ogl-lgo) — the 38th to the 44th. ⚠ These
 *      have no party column at all: the header is the candidates' personal names. They can say how
 *      many votes a person got in a polling station and cannot say which party won the seat, so
 *      they cannot colour a riding.
 *    · No results dataset of any kind for the 45th (2025). Its boundaries are published; its
 *      returns are on elections.ca alone.
 *
 *  ⇒ THIS PACK IS THE 42ND, 43RD AND 44TH GENERAL ELECTIONS (2015, 2019, 2021). The 38th to 41st
 *  and the 45th are not left out because they are hard; they are left out because the only openly
 *  licensed copy of them cannot name a party. When Elections Canada adds an OGL «Official Voting
 *  Results» dataset for another election, this file finds it without being edited — the list of
 *  elections is a CKAN query, not a list of years.
 *
 *  ⚠ TWO THINGS ARE READ FROM elections.ca AND NEITHER IS REDISTRIBUTED. The polling day of each
 *  election is read from the Chief Electoral Officer's turnout table. A date is a fact, not an
 *  expression, and no byte of that page reaches data/. Everything the layer actually SHIPS — every
 *  vote, every candidate, every party, every polygon — comes from a source whose licence permits
 *  redistribution, and each election says which.
 *
 *  ══ WHAT IS DISCOVERED RATHER THAN WRITTEN DOWN ═════════════════════════════════════════════
 *    · WHICH ELECTIONS EXIST — the OGL datasets of Elections Canada's CKAN organisation whose title
 *      is «… General Election: Official Voting Results». The licence is checked per dataset, not
 *      assumed from the publisher.
 *    · WHERE THE RETURN IS — the resource of that dataset whose URL ends in table_tableau12.csv.
 *      Elections Canada has moved these files three times in twenty years and the number in the
 *      path is an internal event id that nothing predicts.
 *    · WHICH YEAR AN ORDINAL MEANS — from the OGL «Turnout by Age, Gender and Province» table,
 *      which writes «GE 42, 2015» in a column beside the year.
 *    · WHICH POLLING DAY — from Elections Canada's turnout table (see above).
 *    · WHICH BOUNDARIES — by matching the district NUMBERS in the returns against the numbers in
 *      each representation order. An election is fought on the map whose districts it has; a
 *      year → representation-order table would be a second place for the same fact to be wrong.
 *    · WHAT A PARTY IS CALLED — see PARTY OF A CANDIDATE below.
 * ==========================================================================*/
import { zipEntries, shapefileParts, readDbf, readShp, mapCoords, simplifyGeoJSON, mergeFeatures } from '../lib/elections-geo.mjs';
import { createHash } from 'node:crypto';

const CKAN = 'https://open.canada.ca/data/api/3/action/';
const CKAN_ORG = 'elections';                 /* Elections Canada's organisation on open.canada.ca */
const OGL = 'ca-ogl-lgo';                     /* Open Government Licence – Canada */
const EC = 'https://www.elections.ca';
const TURNOUT = EC + '/content.aspx?section=ele&dir=turn&document=index&lang=e';

/* The title of a dataset that is a whole general election's return, and of the one that says which
   year each ordinal means. ⚠ These match TITLES, not ids: a CKAN id is a UUID that says nothing,
   and matching on the id would freeze the pack at the three datasets that exist today. */
const OVR_TITLE = /(\d+)(?:st|nd|rd|th)\s+General Election:\s*Official Voting Results/i;
const TURNOUT_TITLE = /Turnout by Age, Gender and Province/i;
const RETURN_FILE = /table_tableau12\.csv$/i;

export const about = 'Canada — the House of Commons, every general election Elections Canada ' +
  'publishes under the Open Government Licence (the 42nd, 43rd and 44th).';

/* The boundaries of every representation order an election in this range could have been fought on.
   ⚠ NOT KEYED BY YEAR — nothing here says which election uses which; the `fed` numbers decide that
   below, and the sets are fetched lazily so an order no election needs is never downloaded.

   ⚠ THE 2013 ORDER IS THE ONE EXCEPTION TO «EVERYTHING FROM ELECTIONS CANADA». Elections Canada
   publishes the 2003 and 2013 orders only as an Esri file geodatabase and as KMZ, and nothing in
   this repository can read either; it publishes the CURRENT (2023) order as a shapefile as well.
   Statistics Canada publishes the 2013 order as a shapefile in its census cartographic boundary
   series, under the Statistics Canada Open Licence — which, like the OGL, permits reproduction and
   distribution including for commercial purposes, with attribution. So that is what is read, and it
   is credited as what it is rather than as an Elections Canada file.

   ⚠ The 2023 order is listed although no election in this pack was fought on it: the moment an OGL
   return for the 45th appears, discovery finds it and this is the map it needs. The URL is the
   open.canada.ca resource on ftp.maps.canada.ca, NOT the elections.ca copy — the latter was
   measured on 2026-09-09 to end its response at 7 569 408 bytes of a declared 10 301 648 with a
   200 status, which produces a truncated file that is not a zip and says nothing about why. */
const BOUNDARIES = [
  { id: 'ro2013', url: 'https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/files-fichiers/2016/lfed000b16a_e.zip',
    src: 'Statistics Canada, Federal Electoral Districts (2013 Representation Order), Cartographic Boundary File, 2016 Census',
    lic: 'Statistics Canada Open Licence' },
  { id: 'ro2023', url: 'https://ftp.maps.canada.ca/pub/elections_elections/Electoral-districts_Circonscription-electorale/federal_electoral_districts_boundaries_2023/FED_CA_2023_EN-SHP.zip',
    src: 'Elections Canada, Federal Electoral Districts (2023 Representation Order)',
    lic: 'Open Government Licence – Canada' },
];

/* ── simplification ────────────────────────────────────────────────────────────────────────────
   Canada's districts are the most unequal in area of any country in this layer — Nunavut is
   1.9 million km² and Toronto Centre is 6 km² — so the tolerance has to be small enough for the
   smallest. Measured on the 338-district 2013 order, 2026-09-10: 0.004° → 4.2 MB, 0.010° → 2.0 MB,
   0.020° → 1.2 MB. 0.010° is ≈ 0.5 km at Windsor and 0.2 km at Resolute, which still resolves every
   downtown Toronto riding. ⚠ simplifyGeoJSON throws if a district collapses, so raising this fails
   loudly rather than quietly deleting a seat. */
const TOL = 0.010;
const DECIMALS = 4;

/* ⚠ A GENERAL ELECTION IS ONE THAT FILLS THE WHOLE HOUSE. Elections Canada's CKAN titles say
   «General Election», but a return that arrived truncated would still be titled that, so the seat
   count is checked too. The smallest House ever elected was 181 seats (1867); the largest
   by-election event in the record fills five. Any cut in between separates them and nothing exists
   in the range 6…180. */
const MIN_GENERAL_SEATS = 200;

/* ── the party table ───────────────────────────────────────────────────────────────────────────
   Keyed by the English party label as it is printed on the returns, lower-cased.

   ⚠ ONE PARTY, TWO LABELS. Elections Canada wrote the New Democrats as «N.D.P.» through 2011 and
   as «NDP-New Democratic Party» from 2015, and the People's Party as «People's Party» in 2019 and
   «People's Party - PPC» in 2021. It wrote candidates with no party as «Independent» in some
   elections and «No Affiliation» in others, and those two are different things in law — a candidate
   may decline to have any affiliation printed, or may be endorsed by nobody — even though every
   broadcaster draws them the same grey. The labels are joined where it is one party under two
   spellings and kept apart where the law keeps them apart. Any label NOT in this table still
   becomes a party: it takes a slug of its own English name (see partyId below). */
const ALIASES = {
  'n.d.p.': 'ndp-new democratic party',
  "people's party - ppc": "people's party",
  'rhinoceros': 'parti rhinocéros party',
  'ml': 'marxist-leninist',
};

/* ⚠ THE CURATED TABLE IS THE PARTIES THAT HAVE TAKEN A SEAT, AND IT IS CHECKED AGAINST THE DATA.
   These six are the only affiliations that have won a riding in the elections this pack holds, and
   build() throws if a seventh ever does, because the alternative is a riding painted the colour of
   nothing. Every other party on the ballot — 37 of them across the three elections — is real, is
   counted, and appears in the national bar under a deliberately unsaturated generated hue that
   cannot be mistaken for a brand; inventing a hex for the Rhinoceros Party would look exactly as
   authoritative as the Liberal red.
   ⚠ THE COLOURS ARE THE ONES CANADIAN ELECTION-NIGHT BROADCASTS USE, which is why the Bloc is the
   pale blue a viewer of Radio-Canada expects and not a shade of the Conservative navy. Observed
   2026-09-10 against CBC's and Radio-Canada's own results pages. */
const PARTY_TABLE = {
  'ca:lib': { col: '#d71920', n: {
    en: 'Liberal Party of Canada', native: 'Liberal Party of Canada / Parti libéral du Canada',
    fr: 'Parti libéral du Canada', ja: 'カナダ自由党', de: 'Liberale Partei Kanadas',
    ru: 'Либеральная партия Канады', es: 'Partido Liberal de Canadá',
    'zh-Hant': '加拿大自由黨', 'zh-Hans': '加拿大自由党', ko: '캐나다 자유당' } },
  'ca:con': { col: '#1a4782', n: {
    en: 'Conservative Party of Canada', native: 'Conservative Party of Canada / Parti conservateur du Canada',
    fr: 'Parti conservateur du Canada', ja: 'カナダ保守党', de: 'Konservative Partei Kanadas',
    ru: 'Консервативная партия Канады', es: 'Partido Conservador de Canadá',
    'zh-Hant': '加拿大保守黨', 'zh-Hans': '加拿大保守党', ko: '캐나다 보수당' } },
  'ca:ndp': { col: '#f37021', n: {
    en: 'New Democratic Party', native: 'New Democratic Party / Nouveau Parti démocratique',
    fr: 'Nouveau Parti démocratique', ja: '新民主党', de: 'Neue Demokratische Partei',
    ru: 'Новая демократическая партия', es: 'Nuevo Partido Democrático',
    'zh-Hant': '新民主黨', 'zh-Hans': '新民主党', ko: '신민주당' } },
  'ca:bq': { col: '#33b2cc', n: {
    en: 'Bloc Québécois', native: 'Bloc Québécois', fr: 'Bloc Québécois', ja: 'ケベック連合',
    de: 'Bloc Québécois', ru: 'Квебекский блок', es: 'Bloque Quebequés',
    'zh-Hant': '魁北克政團', 'zh-Hans': '魁北克政团', ko: '퀘벡 블록' } },
  'ca:grn': { col: '#3d9b35', n: {
    en: 'Green Party of Canada', native: 'Green Party of Canada / Parti vert du Canada',
    fr: 'Parti vert du Canada', ja: 'カナダ緑の党', de: 'Grüne Partei Kanadas',
    ru: 'Зелёная партия Канады', es: 'Partido Verde de Canadá',
    'zh-Hant': '加拿大綠黨', 'zh-Hans': '加拿大绿党', ko: '캐나다 녹색당' } },
  'ca:ind': { col: '#8a8f98', n: {
    en: 'Independent', native: 'Independent / Indépendant', fr: 'Indépendant', ja: '無所属',
    de: 'Unabhängig', ru: 'Независимый', es: 'Independiente',
    'zh-Hant': '無黨籍', 'zh-Hans': '无党籍', ko: '무소속' } },
  'ca:noaff': { col: '#8a8f98', n: {
    en: 'No affiliation', native: 'No Affiliation / Aucune appartenance', fr: 'Aucune appartenance',
    ja: '所属政党なし', de: 'Ohne Parteizugehörigkeit', ru: 'Без партийной принадлежности',
    es: 'Sin afiliación', 'zh-Hant': '無政黨聯繫', 'zh-Hans': '无政党联系', ko: '정당 소속 없음' } },
};

/** The label the returns print → the id in PARTY_TABLE, for the parties that have one. Everything
 *  else gets `ca:` plus a slug of its own English label, which is stable because the label is. */
const CURATED = {
  'liberal': 'ca:lib',
  'conservative': 'ca:con',
  'ndp-new democratic party': 'ca:ndp',
  'bloc québécois': 'ca:bq',
  'green party': 'ca:grn',
  'independent': 'ca:ind',
  'no affiliation': 'ca:noaff',
};

const BODY = {
  en: 'House of Commons', native: 'House of Commons / Chambre des communes',
  fr: 'Chambre des communes', ja: 'カナダ庶民院', de: 'Unterhaus',
  ru: 'Палата общин', es: 'Cámara de los Comunes',
  'zh-Hant': '加拿大下議院', 'zh-Hans': '加拿大下议院', ko: '캐나다 하원',
};

/* ── text ──────────────────────────────────────────────────────────────────────────────────────
   ⚠ ELECTIONS CANADA CHANGED ENCODING MID-SERIES. The older CSVs are Windows-1252 and the newer
   ones are UTF-8 with a byte-order mark, and neither says which it is. Guessing by year would be a
   table of years; asking the bytes is not — a valid UTF-8 file never decodes to a replacement
   character, so one appearing means the file was not UTF-8. */
function decodeText(buf) {
  let s = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (s.includes('�')) s = new TextDecoder('windows-1252', { fatal: false }).decode(buf);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ocirc: 'ô', icirc: 'î', acirc: 'â', ecirc: 'ê', ucirc: 'û', euml: 'ë', iuml: 'ï', uuml: 'ü', oacute: 'ó' };
function unentity(s) {
  return String(s)
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, k) => (Object.prototype.hasOwnProperty.call(ENTITIES, k.toLowerCase()) ? ENTITIES[k.toLowerCase()] : m));
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
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
/* The column headings are bilingual and have been re-worded twice, so a column is found by what it
   says rather than by an exact string: «Votes Obtained/Votes obtenus» and «Electoral District
   Number/Numéro de circonscription» are both stable in their English half. */
const col = (row, re) => { const k = Object.keys(row).find(k => re.test(k)); return k || null; };

/** A colour for a party nobody colours — deterministic, deliberately unsaturated so it cannot be
 *  mistaken for a party's own brand, and always reported by the caller. Same construction as the
 *  Australian and Korean packs, so an uncoloured party looks the same in every country. */
function derivedColour(id) {
  const h = createHash('sha256').update(id).digest();
  const hue = (h[0] * 360) / 256, sat = 0.30 + (h[1] / 256) * 0.16, lig = 0.46 + (h[2] / 256) * 0.14;
  const c = (1 - Math.abs(2 * lig - 1)) * sat, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = lig - c / 2;
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

/* ── LAMBERT CONFORMAL CONIC, INVERTED ─────────────────────────────────────────────────────────
   ⚠ CANADIAN BOUNDARY FILES ARE NOT IN DEGREES. Statistics Canada's 2016 file and Elections
   Canada's 2023 file are both in a Lambert conformal conic projection, in metres — the first
   coordinate of the 2023 file is (8 927 789, 2 139 459). Handing those to a map does not fail; it
   draws Canada somewhere south of Ghana. So the projection is read from the .prj that ships beside
   the shapes, every parameter of it, and a file whose .prj declares a projection this cannot invert
   stops the build instead of being drawn wrong.
   Snyder, «Map Projections — A Working Manual», USGS PP 1395, §15 (two standard parallels). */
function projectionFrom(prjText) {
  if (!prjText || !/PROJCS/i.test(prjText)) return null;        /* geographic already */
  if (!/Lambert_Conformal_Conic/i.test(prjText)) {
    throw new Error('boundary file uses a projection this pack cannot invert: ' + prjText.slice(0, 120));
  }
  const p = (name) => {
    const m = prjText.match(new RegExp('PARAMETER\\s*\\[\\s*"' + name + '"\\s*,\\s*(-?[\\d.eE+]+)', 'i'));
    if (!m) throw new Error('.prj has no ' + name);
    return parseFloat(m[1]);
  };
  const sph = prjText.match(/SPHEROID\s*\[\s*"[^"]*"\s*,\s*([\d.eE+]+)\s*,\s*([\d.eE+]+)/i);
  if (!sph) throw new Error('.prj has no SPHEROID');
  const a = parseFloat(sph[1]), invF = parseFloat(sph[2]);
  const f = 1 / invF, e = Math.sqrt(2 * f - f * f);
  const D = Math.PI / 180;
  const lat0 = p('Latitude_Of_Origin') * D, lon0 = p('Central_Meridian') * D;
  const lat1 = p('Standard_Parallel_1') * D, lat2 = p('Standard_Parallel_2') * D;
  const FE = p('False_Easting'), FN = p('False_Northing');

  const m = (φ) => Math.cos(φ) / Math.sqrt(1 - e * e * Math.sin(φ) ** 2);
  const t = (φ) => Math.tan(Math.PI / 4 - φ / 2) / ((1 - e * Math.sin(φ)) / (1 + e * Math.sin(φ))) ** (e / 2);
  const m1 = m(lat1), m2 = m(lat2), t1 = t(lat1), t2 = t(lat2), t0 = t(lat0);
  const n = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
  const F = m1 / (n * t1 ** n);
  const ρ0 = a * F * t0 ** n;

  return ([E, N]) => {
    const dx = E - FE, dy = ρ0 - (N - FN);
    const ρ = Math.sign(n) * Math.hypot(dx, dy);
    const tp = (ρ / (a * F)) ** (1 / n);
    const θ = Math.atan2(Math.sign(n) * dx, Math.sign(n) * dy);
    const λ = θ / n + lon0;
    let φ = Math.PI / 2 - 2 * Math.atan(tp);
    for (let i = 0; i < 12; i++) {                              /* Snyder 7-9; converges in ~4 */
      const s = Math.sin(φ);
      const next = Math.PI / 2 - 2 * Math.atan(tp * ((1 - e * s) / (1 + e * s)) ** (e / 2));
      if (Math.abs(next - φ) < 1e-12) { φ = next; break; }
      φ = next;
    }
    return [λ / D, φ / D];
  };
}

/* ── one representation order ──────────────────────────────────────────────────────────────────
   The two publishers name their columns differently (FED_NUM / ED_NAMEE / ED_NAMEF against
   FEDUID / FEDENAME / FEDFNAME), so the fields are found by what they HOLD rather than by a name.
   ⚠ A CANADIAN RIDING'S NUMBER IS FIVE DIGITS — two for the province and three for the seat within
   it — and has been since the 1996 order. That shape is what identifies the column; it is the only
   thing about a Canadian boundary file that both publishers agree on.
   ⚠ AND THE NUMBER IS NOT UNIQUE PER RECORD. Elections Canada's 2023 file has 352 records for 343
   ridings, because a riding split by water is shipped as one record per island group. Requiring the
   column to be unique therefore finds NO column in that file and would fail on a file that is
   perfectly correct, so the parts are unioned into one feature instead — which is what the riding
   is. Statistics Canada's file happens to be one record per riding and passes through unchanged. */
function boundarySet(buf) {
  const entries = zipEntries(buf);
  const parts = shapefileParts(entries, '');
  if (!parts.shp || !parts.dbf) throw new Error('boundary archive has no shapefile');
  /* ⚠ Statistics Canada ships no .cpg and its files are Latin-1: «Québec» read as UTF-8 comes back
     with a replacement character. Same rule as the CSVs — ask the bytes, not the year. */
  let rows = readDbf(parts.dbf, 'utf8');
  if (JSON.stringify(rows.slice(0, 400)).includes('�')) rows = readDbf(parts.dbf, 'windows-1252');
  const geoms = readShp(parts.shp);
  if (geoms.length !== rows.length) throw new Error('shp/dbf disagree: ' + geoms.length + ' vs ' + rows.length);

  const keys = Object.keys(rows[0] || {});
  const fiveDigit = keys.filter(k => rows.every(r => /^\d{5}$/.test(String(r[k] == null ? '' : r[k]))));
  if (!fiveDigit.length) throw new Error('no five-digit district-number column in ' + keys.join(','));
  /* if more than one column is five digits throughout, the district number is the one that
     distinguishes the most ridings — and it has to do so uniquely among the candidates */
  const distinct = (k) => new Set(rows.map(r => String(r[k]))).size;
  const best = fiveDigit.map(k => [k, distinct(k)]).sort((a, b) => b[1] - a[1]);
  if (best.length > 1 && best[0][1] === best[1][1]) {
    throw new Error('two columns are equally good district numbers: ' + best[0][0] + ', ' + best[1][0]);
  }
  const idKey = best[0][0];
  if (best[0][1] < MIN_GENERAL_SEATS) throw new Error('«' + idKey + '» holds only ' + best[0][1] + ' distinct districts');
  const enKey = keys.find(k => /ENAME|NAMEE/i.test(k)) || keys.find(k => /NAME/i.test(k));
  const frKey = keys.find(k => /FNAME|NAMEF/i.test(k)) || enKey;

  const byCode = new Map();
  for (let i = 0; i < rows.length; i++) {
    if (!geoms[i]) continue;
    const cd = String(rows[i][idKey]);
    if (!byCode.has(cd)) byCode.set(cd, { row: rows[i], parts: [] });
    byCode.get(cd).parts.push({ type: 'Feature', properties: rows[i], geometry: geoms[i] });
  }
  const fc = { type: 'FeatureCollection', features: [] };
  for (const [cd, { row, parts: ps }] of byCode) {
    fc.features.push({
      type: 'Feature',
      properties: { cd, n: { en: row[enKey], fr: row[frKey], native: row[enKey] } },
      geometry: ps.length === 1 ? ps[0].geometry : mergeFeatures(ps),
    });
  }
  const proj = projectionFrom(parts.prj ? parts.prj.toString('latin1') : null);
  if (proj) mapCoords(fc, proj);
  return fc;
}

/* ── the party of a candidate ──────────────────────────────────────────────────────────────────
   ⚠ THE RETURNS DO NOT HAVE A PARTY COLUMN. They have one field per candidacy reading
   «Judy Vanta NDP-New Democratic Party/NPD-Nouveau Parti démocratique» — the person, then the party
   in English, then a slash, then the party in French. Splitting on the last slash gives the French
   name whole, but nothing in the string says where the person stops and the English party starts.
   It is recoverable without a list of party names because A PARTY REPEATS AND A PERSON DOES NOT:
   pool every candidacy of every election at once, group them by their (unambiguous) French label,
   and the English party name is the longest run of words that ALL of that group's candidacies end
   with. Measured 2026-09-10 over 5 948 candidacies in three elections: «Libéral» → «Liberal» from
   1 014 of them, «NPD-Nouveau Parti démocratique» → «NDP-New Democratic Party» from 1 014,
   «Conservateur» → «Conservative» from 1 013, «Parti populaire» → «People's Party» from 315.
   ⚠ AND IT FAILS FOR A PARTY THAT RAN ONE OR TWO CANDIDATES EVER, because then the longest common
   run is the whole field including the person's name. Such a label is marked unreliable and its
   candidacies keep their field verbatim rather than being cut in a place nothing supports — and
   since no party that has ever won a Canadian seat ran fewer than three candidates, build() checks
   exactly that before one of them is allowed to colour a riding. Measured: 6 such labels, 7
   candidacies between them, none of which came near winning. */
const MIN_FOR_LABEL = 3;

function partyLexicon(pools) {
  const byFr = new Map();
  for (const field of pools) {
    const i = field.lastIndexOf('/');
    if (i < 0) continue;
    const fr = field.slice(i + 1).trim();
    const pre = field.slice(0, i).replace(/\s*\*+\s*/g, ' ').trim();   /* ** marks the sitting member */
    if (!byFr.has(fr)) byFr.set(fr, []);
    byFr.get(fr).push(pre);
  }
  const out = new Map();
  for (const [fr, list] of byFr) {
    if (list.length < MIN_FOR_LABEL) { out.set(fr, { en: fr, fr, reliable: false }); continue; }
    const words = list.map(s => s.split(/\s+/));
    let k = 0;
    for (let n = 1; ; n++) {
      if (words.some(w => w.length <= n)) break;                       /* never eat a whole name */
      const tail = words[0].slice(-n).join(' ');
      if (!words.every(w => w.slice(-n).join(' ') === tail)) break;
      k = n;
    }
    out.set(fr, { en: k ? words[0].slice(-k).join(' ') : fr, fr, reliable: k > 0 });
  }
  return out;
}

function splitCandidate(field, lex) {
  const i = field.lastIndexOf('/');
  if (i < 0) return { name: field.trim(), label: null };
  const fr = field.slice(i + 1).trim();
  const pre = field.slice(0, i).replace(/\s*\*+\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const e = lex.get(fr);
  if (!e) return { name: pre, label: null };
  if (!e.reliable) return { name: pre, label: e, reliable: false };
  const cut = pre.length - e.en.length;
  const name = cut > 0 ? pre.slice(0, cut).trim() : pre;
  return { name: name || pre, label: e, reliable: true };
}

/* ── discovery ─────────────────────────────────────────────────────────────────────────────── */

/** Every dataset of Elections Canada's CKAN organisation. Paged, because CKAN caps `rows`. */
async function ckanDatasets(ctx) {
  const all = [];
  for (let start = 0; ;) {
    const page = await ctx.get(CKAN + 'package_search?rows=100&start=' + start +
      '&q=' + encodeURIComponent('organization:' + CKAN_ORG), { json: true });
    const r = page.result;
    all.push(...r.results);
    if (all.length >= r.count || !r.results.length) break;
    start = all.length;
  }
  return all;
}

const titleOf = (p) => String((p.title_translated && p.title_translated.en) || p.title || '');

/** ⚠ A CKAN RESOURCE URL IS NOT ALWAYS ABSOLUTE. Measured 2026-09-10: the «Official Voting Results»
 *  datasets carry full https:// URLs, and the turnout-by-age dataset carries «/data/dataset/…»
 *  relative to the portal. `fetch` does not resolve those — it throws ERR_INVALID_URL — so the
 *  portal's own origin is what a bare path is relative to. */
const PORTAL = 'https://open.canada.ca';
const resUrl = (r) => {
  const u = String((r && r.url) || '');
  return /^https?:\/\//i.test(u) ? u : PORTAL + (u.startsWith('/') ? '' : '/') + u;
};

/** ⚠ WHICH YEAR «GE 42» MEANS IS NOT ARITHMETIC. Parliaments do not run to a fixed term and two
 *  general elections have fallen in one calendar year before, so the ordinal is joined to a year
 *  through Elections Canada's own OGL turnout-by-age table, which prints «GE 42, 2015» beside the
 *  year in every row. Nothing here is typed. */
async function ordinalYears(ctx, datasets) {
  const pkg = datasets.find(p => TURNOUT_TITLE.test(titleOf(p)));
  if (!pkg) throw new Error('ca: no «Turnout by Age…» dataset to read election years from');
  if (pkg.license_id !== OGL) throw new Error('ca: the turnout-by-age dataset is no longer ' + OGL);
  const csv = pkg.resources.find(r => /\.csv$/i.test(r.url || ''));
  if (!csv) throw new Error('ca: the turnout-by-age dataset has no CSV');
  const rows = parseCSV(decodeText(await ctx.get(resUrl(csv))));
  const yearCol = col(rows[0], /^YEAR$/i), nameCol = col(rows[0], /^ELECTION_E$/i);
  if (!yearCol || !nameCol) throw new Error('ca: the turnout-by-age table lost its YEAR/ELECTION_E columns');
  const out = new Map();
  for (const r of rows) {
    const m = String(r[nameCol]).match(/GE\s*(\d+)/i);
    const y = Number(r[yearCol]);
    if (!m || !Number.isFinite(y)) continue;
    const n = Number(m[1]);
    if (out.has(n) && out.get(n) !== y) throw new Error('ca: GE ' + n + ' is dated both ' + out.get(n) + ' and ' + y);
    out.set(n, y);
  }
  return out;
}

/** Every polling day Elections Canada has ever held, read from its own turnout table. ⚠ Read, not
 *  redistributed — see the licence note at the top of this file. */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
async function pollingDays(ctx) {
  const html = decodeText(await ctx.get(TURNOUT));
  const days = new Map();
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => unentity(c[1].replace(/<[^>]*>/g, '')).trim());
    if (!cells.length) continue;
    /* the last date in the cell is polling day: the nineteenth-century rows are a range of weeks */
    const m = [...cells[0].matchAll(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/g)].pop();
    if (!m) continue;
    const mo = MONTHS.indexOf(m[2].toLowerCase());
    if (mo < 0) continue;
    const y = +m[3];
    const iso = y + '-' + String(mo + 1).padStart(2, '0') + '-' + String(+m[1]).padStart(2, '0');
    /* ⚠ two general elections in one calendar year has happened; if it ever happens inside the range
       this pack covers, the second would silently overwrite the first. It fails instead. */
    if (days.has(y)) throw new Error('two general elections recorded in ' + y + ' — the year is not a key');
    days.set(y, iso);
  }
  if (days.size < 40) throw new Error('the turnout table yielded only ' + days.size + ' polling days');
  return days;
}

/** The OGL «Official Voting Results» datasets, with their table 12 read. */
async function findElections(ctx, datasets) {
  const out = [], skipped = [];
  for (const p of datasets) {
    const m = titleOf(p).match(OVR_TITLE);
    if (!m) continue;
    /* ⚠ THE LICENCE IS CHECKED PER DATASET, NOT ASSUMED FROM THE PUBLISHER. This one test is what
       keeps a non-commercially-licensed return out of a public repository. */
    if (p.license_id !== OGL) { skipped.push('GE ' + m[1] + ': licence is ' + p.license_id); continue; }
    const res = p.resources.find(r => RETURN_FILE.test(r.url || ''));
    if (!res) { skipped.push('GE ' + m[1] + ': the dataset has no table 12'); continue; }
    const rows = parseCSV(decodeText(await ctx.get(resUrl(res))));
    if (!rows.length) { skipped.push('GE ' + m[1] + ': table 12 is empty'); continue; }
    const idCol = col(rows[0], /Number\//);
    if (!idCol) { skipped.push('GE ' + m[1] + ': table 12 has no district-number column'); continue; }
    const seats = new Set(rows.map(r => String(r[idCol]).trim())).size;
    if (seats < MIN_GENERAL_SEATS) { skipped.push('GE ' + m[1] + ': only ' + seats + ' districts'); continue; }
    out.push({ ge: Number(m[1]), rows, idCol, seats, src: resUrl(res), dataset: p });
  }
  out.sort((a, b) => a.ge - b.ge);
  return { elections: out, skipped };
}

/* ── the home box, from the polygons rather than from memory ──────────────────────────────────── */
function homeBox(fcs) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < w) w = c[0];
      if (c[0] > e) e = c[0];
      if (c[1] < s) s = c[1];
      if (c[1] > n) n = c[1];
    } else for (const k of c) walk(k);
  };
  for (const fc of fcs) for (const f of fc.features) if (f.geometry) walk(f.geometry.coordinates);
  const r = (v) => Math.round(v * 100) / 100;
  return [[r(w), r(s)], [r(e), r(n)]];
}

/* ── the note the reader reads ─────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ EACH LANGUAGE BUILDS ITS OWN SENTENCE, because the numbers do not fall in the same place in a
   Japanese, Korean or German clause as in an English one.
   ⚠ BOTH `jp` AND `ja`: 'jp' is the app's own code for Japanese (js/lang-registry.js) and the key
   js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data uses. */
function noteFor(seats, order) {
  const jp = seats + ' の選挙区がそれぞれ 1 名を選び、名簿で選ばれる議員はいません。' +
    order + ' 年区割りの選挙区で行われました。色は最多得票の候補者の政党です。';
  return {
    en: 'Each of the ' + seats + ' ridings elects one member and nobody is elected from a list. ' +
      'Fought on the ' + order + ' representation order; the colour is the party of the candidate with the most votes.',
    ja: jp, jp,
    de: 'Jeder der ' + seats + ' Wahlkreise wählt ein Mitglied, und niemand wird über eine Liste ' +
      'gewählt. Gewählt wurde nach der Wahlkreiseinteilung von ' + order + '; die Farbe zeigt die ' +
      'Partei der Kandidatin oder des Kandidaten mit den meisten Stimmen.',
    ru: 'Каждый из ' + seats + ' округов избирает одного члена, и никто не проходит по списку. ' +
      'Выборы прошли по нарезке ' + order + ' года; цвет — партия кандидата, набравшего больше всего голосов.',
    es: 'Cada una de las ' + seats + ' circunscripciones elige a un miembro y nadie es elegido por ' +
      'lista. Se disputaron con la delimitación de ' + order + '; el color es el partido del ' +
      'candidato con más votos.',
    fr: 'Chacune des ' + seats + ' circonscriptions élit un député et personne n’est élu sur une ' +
      'liste. Scrutin tenu selon le décret de représentation de ' + order + ' ; la couleur est celle ' +
      'du parti du candidat ayant obtenu le plus de voix.',
    ko: seats + '개 선거구가 각각 1명을 선출하며 명부로 선출되는 의원은 없습니다. ' + order +
      '년 선거구 획정에 따라 치러졌고, 색은 최다 득표 후보의 정당입니다.',
    zh: seats + ' 個選區各選出一名議員，沒有任何議員由名單產生。依 ' + order +
      ' 年選區劃分進行；顏色代表得票最多候選人的政黨。',
    'zh-hans': seats + ' 个选区各选出一名议员，没有任何议员由名单产生。依 ' + order +
      ' 年选区划分进行；颜色代表得票最多候选人的政党。',
  };
}

/* ══ build ═════════════════════════════════════════════════════════════════════════════════════ */

export async function build(ctx) {
  const out = { polities: [], parties: {}, elections: [], geo: {}, res: {} };
  const notes = [];

  const datasets = await ckanDatasets(ctx);
  const years = await ordinalYears(ctx, datasets);
  const days = await pollingDays(ctx);
  const { elections, skipped } = await findElections(ctx, datasets);
  if (!elections.length) throw new Error('ca: no openly licensed general-election return was found');
  notes.push(...skipped);

  /* the lexicon is built once, from every candidacy of every election at once — see partyLexicon */
  const pool = [];
  for (const e of elections) {
    const c = col(e.rows[0], /^Candidate\//);
    if (!c) throw new Error('GE ' + e.ge + ': the returns have no candidate column');
    for (const r of e.rows) pool.push(r[c]);
  }
  const lex = partyLexicon(pool);

  /* ── the parties, named once for the whole pack ───────────────────────────────────────────── */
  const generated = new Set();
  const partyId = (label) => {
    if (!label) return null;
    const key = label.en.toLowerCase();
    const canon = ALIASES[key] || key;
    /* ⚠ THE TRIM COMES AFTER THE CUT, NOT BEFORE IT. «Forces et Démocratie - Allier les forces de
       nos régions» is 47 characters of slug, and trimming first then cutting leaves a party id
       ending in a hyphen — which ID_RE in elections-schema.mjs rejects, so the whole pack would
       fail on a party that did nothing but have a long name. */
    const id = CURATED[canon] || ('ca:' + canon.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, ''));
    if (!out.parties[id]) {
      const curated = PARTY_TABLE[id];
      if (!curated) generated.add(label.en);
      out.parties[id] = curated
        ? { n: curated.n, col: curated.col }
        /* ⚠ NO NAME IS INVENTED for a party the table does not carry: the reader is shown the two
           names the returns themselves print, in the two languages they are printed in. */
        : { n: { en: label.en, fr: label.fr, native: label.en + ' / ' + label.fr }, col: derivedColour(id) };
    }
    return id;
  };

  /* ── the representation orders, fetched only when an election turns out to need one ───────── */
  const orders = BOUNDARIES.map(b => ({ ...b, fc: null, codes: null }));
  const orderFor = async (codes) => {
    for (const o of orders) {
      if (!o.fc) { o.fc = boundarySet(await ctx.get(o.url)); o.codes = new Set(o.fc.features.map(f => f.properties.cd)); }
      if (o.codes.size === codes.size && [...codes].every(c => o.codes.has(c))) return o;
    }
    return null;
  };

  const usedOrder = new Map();
  const geoms = [];

  for (const e of elections) {
    const year = years.get(e.ge);
    if (!year) { notes.push('GE ' + e.ge + ': no year for that ordinal in the turnout table'); continue; }
    const date = days.get(year);
    if (!date) { notes.push('GE ' + e.ge + ': no polling day recorded for ' + year); continue; }
    /* ⚠ WHERE THE PORTAL ALSO CARRIES THE DATE, THE TWO MUST AGREE. CKAN records a coverage period
       for some of these datasets and not others; where it does, it is an independent statement of
       the same fact, and two sources that disagree mean one of them is being read wrong. */
    const cov = String(e.dataset.time_period_coverage_start || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(cov) && cov !== date) {
      throw new Error('GE ' + e.ge + ': the turnout table says ' + date + ' and the portal says ' + cov);
    }

    const candCol = col(e.rows[0], /^Candidate\//);
    const voteCol = col(e.rows[0], /Votes Obtained\//);
    if (!candCol || !voteCol) throw new Error('GE ' + e.ge + ': the returns have no candidate or vote column');

    const byDistrict = new Map();
    for (const r of e.rows) {
      const cd = String(r[e.idCol]).trim();
      if (!/^\d{5}$/.test(cd)) throw new Error('GE ' + e.ge + ': «' + cd + '» is not a district number');
      if (!byDistrict.has(cd)) byDistrict.set(cd, []);
      byDistrict.get(cd).push(r);
    }

    /* ⚠ WHICH MAP THIS ELECTION WAS FOUGHT ON IS A QUESTION ABOUT ITS DISTRICTS. The order whose
       district numbers are exactly this election's is the one; anything less than exact would put a
       2011 result on a 2015 riding of the same number, which is a different piece of ground. */
    const codes = new Set(byDistrict.keys());
    const order = await orderFor(codes);
    if (!order) {
      const near = orders.filter(o => o.codes).map(o => o.id + ':' + [...codes].filter(c => o.codes.has(c)).length + '/' + o.codes.size).join(' ');
      throw new Error('GE ' + e.ge + ': its ' + codes.size + ' districts match no representation order exactly (' + near + ')');
    }
    const geoId = 'ca-' + order.id + '.geo.json';
    if (!usedOrder.has(order.id)) {
      const fc = simplifyGeoJSON(order.fc, { tolerance: TOL, decimals: DECIMALS });
      out.geo[geoId] = fc;
      geoms.push(fc);
      usedOrder.set(order.id, geoId);
    }

    const res = { d: {}, n: [] };
    const seats = new Map(), votes = new Map();
    let cast = 0;
    for (const [cd, rs] of byDistrict) {
      const cands = rs.map(r => {
        const { name, label, reliable } = splitCandidate(r[candCol], lex);
        const v = r[voteCol] === '' ? null : Number(String(r[voteCol]).replace(/[\s,]/g, ''));
        return { n: name, p: partyId(label), reliable: reliable !== false, v: Number.isFinite(v) ? v : null };
      }).sort((a, b) => (b.v || 0) - (a.v || 0));

      const row = {};
      const win = cands[0];
      /* ⚠ a party whose English name could not be told from a candidate's own name may not colour
         a riding — see MIN_FOR_LABEL. None ever has; this makes sure none silently does. */
      if (win && win.p && !win.reliable) {
        throw new Error('GE ' + e.ge + ' ' + cd + ': the winner\'s party label «' + win.p + '» is not reliably separable');
      }
      if (win && win.p && !PARTY_TABLE[win.p]) {
        throw new Error('GE ' + e.ge + ' ' + cd + ': ' + win.p + ' won a riding and has no entry in PARTY_TABLE');
      }
      if (win && win.p) { row.w = win.p; seats.set(win.p, (seats.get(win.p) || 0) + 1); }
      row.c = cands.map(c => {
        const o = { n: c.n };
        if (c.p) o.p = c.p;
        if (c.v != null) o.v = c.v;
        return o;
      });
      /* ⚠ the total is the valid ballots this riding actually cast, summed from the candidacies
         rather than taken from a percentage column — a percentage rounded to one decimal cannot be
         turned back into a count, and #R543 measured what happens when a missing number is read as
         a zero instead of as missing. */
      const t = cands.reduce((s, c) => s + (c.v || 0), 0);
      if (t > 0) row.t = t;
      cast += t;
      for (const c of cands) if (c.p) votes.set(c.p, (votes.get(c.p) || 0) + (c.v || 0));
      res.d[cd] = row;
    }

    for (const [p, s] of [...seats].sort((a, b) => b[1] - a[1])) {
      const r = { p, seats: s, dseats: s };
      if (cast > 0 && votes.has(p)) r.pct = Math.round(votes.get(p) / cast * 1000) / 10;
      res.n.push(r);
    }
    for (const [p, v] of votes) {
      if (seats.has(p) || !v) continue;
      res.n.push({ p, seats: 0, dseats: 0, pct: Math.round(v / cast * 1000) / 10 });
    }

    const id = 'ca-commons-' + year;
    const resId = id + '.res.json';
    out.res[resId] = res;
    const n = Object.keys(res.d).length;
    const orderYear = order.id.replace('ro', '');
    out.elections.push({
      id, polity: 'ca', date, y: year, body: BODY, geo: geoId, res: resId,
      /* every member of the House of Commons sits for a riding, so there is no list half */
      seatsTotal: n, districtSeats: n, listSeats: 0,
      src: 'Elections Canada, «' + titleOf(e.dataset) + '», Table 12, via open.canada.ca · ' + order.src,
      lic: 'Results: Open Government Licence – Canada. Boundaries: ' + order.lic + '.',
      note: noteFor(n, orderYear),
    });
  }

  if (!out.elections.length) throw new Error('ca: every openly licensed return was skipped');

  /* a party that appears in no election is a name on a list nobody can reach */
  const reachable = new Set();
  for (const r of Object.values(out.res)) {
    for (const row of Object.values(r.d)) { if (row.w) reachable.add(row.w); for (const c of row.c || []) if (c.p) reachable.add(c.p); }
    for (const row of r.n) reachable.add(row.p);
  }
  for (const pid of Object.keys(out.parties)) if (!reachable.has(pid)) delete out.parties[pid];
  if (generated.size) notes.push('no broadcast colour, generated hue: ' + [...generated].sort().join(', '));
  if (notes.length) console.log('    ca · ' + notes.join(' · '));

  out.polities.push({
    id: 'ca',
    n: {
      en: 'Canada', native: 'Canada', fr: 'Canada', ja: 'カナダ', de: 'Kanada',
      ru: 'Канада', es: 'Canadá', 'zh-Hant': '加拿大', 'zh-Hans': '加拿大', ko: '캐나다',
    },
    home: homeBox(geoms),
  });
  return out;
}
