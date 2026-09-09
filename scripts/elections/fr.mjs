/* ============================================================================
 *  IntMap · FRANCE — THE ASSEMBLÉE NATIONALE, 2012–2024   (#R582)
 * ----------------------------------------------------------------------------
 *  Four elections — 2012, 2017, 2022, 2024 — all fought on the SAME map. France redrew its
 *  circonscriptions once, in 2010, and has not touched them since, so all four elections share one
 *  geometry file. That is the other half of what the era/election split in
 *  scripts/lib/elections-schema.mjs is for: Britain needs two files for five elections, France needs
 *  one file for four.
 *
 *  ══ TWO ROUNDS, AND WHY BOTH ARE DOWNLOADED ═════════════════════════════════════════════════
 *  A deputy is elected outright in the first round on an absolute majority of votes cast and at
 *  least a quarter of the register; everywhere else there is a run-off a week later. So the
 *  second-round file is NOT the result — it is missing exactly the seats that were decided early:
 *  76 of them in 2024, 5 in 2022, 4 in 2017, 36 in 2012 (measured). Both rounds are read and each
 *  circonscription is described by the round that actually decided it, which is the only reading
 *  under which all 577 seats have a winner.
 *
 *  ══ THE 18 SEATS THIS MAP CANNOT DRAW ═══════════════════════════════════════════════════════
 *  The Assemblée has 577 members and the contour file has 559 polygons. The missing 18 are not a
 *  rounding error and they are not proportional seats — every one of them is an ordinary
 *  single-member constituency. Measured 2026-09-09 by counting the departments in the contour file
 *  against the departments in the results:
 *      · 11  Français établis hors de France (ZZ01–ZZ11) — constituencies for French citizens
 *            resident abroad. They have no ground in France at all; one of them is the whole of
 *            North America. No contour file can hold them.
 *      ·  7  the collectivités the contour file does not reach, because it is built by dissolving
 *            POLLING-DISTRICT outlines and that source covers metropolitan France, Guadeloupe,
 *            Martinique, Guyane, La Réunion, Mayotte and Saint-Pierre-et-Miquelon and stops:
 *              Nouvelle-Calédonie 2, Polynésie française 3, Wallis-et-Futuna 1,
 *              Saint-Martin/Saint-Barthélemy 1.
 *  ⚠ `listSeats: 18` IS THEREFORE A LIE IN ITS NAME AND THE TRUTH IN ITS ARITHMETIC, and it is the
 *  least wrong option the contract allows. `districtSeats` must equal the number of polygons or the
 *  build fails; the three numbers must be each other's arithmetic or the build fails; and
 *  `seatsTotal` is what the seat bar is read against — put 559 there and a party with 281 seats is
 *  shown holding a majority of a chamber that needs 289. So the chamber size stays true, the map's
 *  own count stays true, and the remainder lands in the only field left. `note` below says in words
 *  what those 18 are, and the day a contour file covers the Pacific collectivités, 7 of them move
 *  across on their own — nothing here names them.
 *
 *      node scripts/elections/_selftest.mjs fr
 * ==========================================================================*/
import { read as readWorkbook, utils as xlsxUtils } from 'xlsx';
import { simplifyGeoJSON } from '../lib/elections-geo.mjs';

export const about =
  'Assemblée nationale elections 2012, 2017, 2022 and 2024, all on the 2010 redistricting, which is ' +
  'why they share one geometry file. Both rounds of each election are read and every circonscription ' +
  'is described by the round that decided it. The map holds 559 of the 577 seats: 11 constituencies ' +
  'for French citizens abroad have no ground in France, and 7 more (Nouvelle-Calédonie 2, Polynésie ' +
  'française 3, Wallis-et-Futuna 1, Saint-Martin/Saint-Barthélemy 1) lie outside the published ' +
  'contour file, which is built from polling-district outlines for metropolitan France and the DROM ' +
  'only. Results from the Ministère de l\'Intérieur via data.gouv.fr; parties are the Ministry\'s own ' +
  'nuance codes.';

/* ⚠ URLs ARE RESOLVED THROUGH THE API AND FETCHED THROUGH THE SHORT REDIRECT, AND BOTH HALVES OF
   THAT ARE FORCED. data.gouv.fr's direct download URLs carry an upload timestamp
   («…/20240710-171413/resultats-definitifs-par-circonscriptions-legislatives.csv») that changes
   whenever the publisher re-uploads — two of them had already moved between being measured and
   being used, 404 both times. And the build's HTTP cache keys a response by the first 135 BYTES of
   its URL, which for those URLs lands INSIDE the timestamp: two resources of the same dataset
   collide and the second is answered with the first one's body. The stable per-resource redirect
   `…/fr/datasets/r/<uuid>` is 75 characters, so neither problem exists. */
const API = 'https://www.data.gouv.fr/api/1/datasets/';
const RESOURCE = 'https://www.data.gouv.fr/fr/datasets/r/';

/** data.gouv licence identifiers, rendered for the attribution line. Anything not listed here is
 *  printed as its raw identifier rather than guessed at. */
const LICENCES = {
  'lov2': 'Licence Ouverte / Open Licence 2.0',
  'fr-lo': 'Licence Ouverte / Open Licence 1.0',
  'notspecified': 'no licence declared on data.gouv.fr for this dataset (the Ministère de l\'Intérieur ' +
    'publishes its election results under the Licence Ouverte)',
};

/* ── the one boundary era ──────────────────────────────────────────────────────────────────────
   «p20» and «p10» are the publisher's two simplifications of the same contours; p20 is the LESS
   simplified of the two (10.2 MB against 5.4 MB), so it is the one taken and the thinning is done
   here where the tolerance is written down. */
const GEO_DATASET = 'contours-geographiques-des-circonscriptions-legislatives';
const GEO_FILE = /circonscriptions-legislatives-p20\.geojson$/;
const GEO_ID = 'fr-2010';

/* ⚠ TOLERANCE IS IN DEGREES AND THIS ONE IS FRANCE'S. 0.0015° is about 167 m north–south and 110 m
   east–west at 46° N — invisible at the zoom where all 559 circonscriptions are on screen, and the
   source is itself a simplification of polling-district outlines rather than a survey. Measured
   2026-09-09: 10.2 MB raw → 2.3 MB here, against 3.2 MB at 0.001 and 1.8 MB at 0.002 (the Breton
   and Mediterranean coasts go angular). It stops being right if the layer ever draws one
   circonscription full-screen. */
const TOLERANCE = 0.0015;
const DECIMALS = 4;   /* 1e-4° ≈ 11 m — an order finer than the tolerance, so rounding never leads */

/* ── the four elections ────────────────────────────────────────────────────────────────────────
   `date` is the polling day of the SECOND round, i.e. the day the Assemblée was complete.
   Each round names the data.gouv dataset it comes from and a pattern for the resource inside it;
   the URL is never written down (see above). 2012 is one workbook holding both rounds as two
   sheets, which is why the round also carries a sheet pattern.
   ⚠ The dataset slugs are the only identifiers here. Everything else — the columns, how many
   candidates a row has, which parties exist, which seats were decided in the first round — is read
   out of the files. */
const ELECTIONS = [
  { y: 2012, date: '2012-06-17', rounds: [
    { t: 1, ds: 'elections-legislatives-2012-resultats-572077', file: /\.xls$/i, sheet: /circo.*t\s*1/i },
    { t: 2, ds: 'elections-legislatives-2012-resultats-572077', file: /\.xls$/i, sheet: /circo.*t\s*2/i },
  ] },
  { y: 2017, date: '2017-06-18', rounds: [
    { t: 1, ds: 'elections-legislatives-des-11-et-18-juin-2017-resultats-du-1er-tour', file: /\.xlsx$/i, sheet: /circo/i },
    { t: 2, ds: 'elections-legislatives-des-11-et-18-juin-2017-resultats-du-2nd-tour', file: /\.xlsx$/i, sheet: /circo/i },
  ] },
  { y: 2022, date: '2022-06-19', rounds: [
    { t: 1, ds: 'elections-legislatives-des-12-et-19-juin-2022-resultats-definitifs-du-premier-tour',
      file: /cirlg-t1-france-entiere\.txt$/i, enc: 'latin1' },
    { t: 2, ds: 'elections-legislatives-des-12-et-19-juin-2022-resultats-definitifs-du-second-tour',
      file: /cirlg-t2-france-entiere\.txt$/i, enc: 'latin1' },
  ] },
  { y: 2024, date: '2024-07-07', rounds: [
    { t: 1, ds: 'elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-1er-tour',
      file: /resultats-definitifs-par-circonscriptions-legislatives\.csv$/i, enc: 'utf-8' },
    { t: 2, ds: 'elections-legislatives-des-30-juin-et-7-juillet-2024-resultats-definitifs-du-2nd-tour',
      file: /resultats-definitifs-par-circonscription\.csv$/i, enc: 'utf-8' },
  ] },
];

/* ── the nuances ───────────────────────────────────────────────────────────────────────────────
   ⚠ FRANCE HAS NO «PARTY» COLUMN. What every official result file carries is the candidate's
   NUANCE — the political-tendency code the Ministère de l'Intérieur assigns, from a grille it
   publishes anew for each election. That is deliberately not the same thing as the party a
   candidate belongs to: it is the Ministry's classification of where they stand, and it is what the
   whole French statistical record of elections is expressed in. So the nuance IS the party for this
   layer, and the codes below are the four grilles used by these four elections — 2012 (17 codes),
   2017 (17), 2022 (16) and 2024 (22), 36 distinct across all four. Every code observed in the data
   is in this table and a code that is not stops the build (see collectParties), because a candidate
   with an unrecognised nuance would otherwise be silently unlabelled.
   The colours are the political-family colours French broadcasters use on election night; where a
   grille renames a family between elections (FN → RN, REM → ENS, UMP → LR) the colour follows the
   family rather than the code. `ja` is filled in only where the party has an established Japanese
   name — a nuance like «Divers centre» is a category, not a party, and inventing a translation for
   it would be inventing a fact. */
const NUANCES = {
  /* left */
  EXG:  { fr: 'Extrême gauche',                             en: 'Far left',                       col: '#8c0d2f' },
  DXG:  { fr: 'Divers extrême gauche',                      en: 'Other far left',                 col: '#8c0d2f' },
  COM:  { fr: 'Parti communiste français',                  en: 'French Communist Party',         col: '#d81f26', ja: 'フランス共産党' },
  FG:   { fr: 'Front de gauche',                            en: 'Left Front',                     col: '#c9152a', ja: '左翼戦線' },
  FI:   { fr: 'La France insoumise',                        en: 'France Unbowed',                 col: '#cc2443', ja: '不服従のフランス' },
  NUP:  { fr: 'Nouvelle union populaire écologique et sociale', en: 'New Ecological and Social People\'s Union', col: '#cc2443', ja: '新人民戦線・環境社会連合' },
  UG:   { fr: 'Union de la gauche',                         en: 'Union of the left',              col: '#d43d5f' },
  SOC:  { fr: 'Parti socialiste',                           en: 'Socialist Party',                col: '#f0648c', ja: '社会党' },
  RDG:  { fr: 'Parti radical de gauche',                    en: 'Radical Party of the Left',      col: '#f2a7bd', ja: '左翼急進党' },
  DVG:  { fr: 'Divers gauche',                              en: 'Other left',                     col: '#f4a6b0' },
  VEC:  { fr: 'Les Écologistes — EELV',                     en: 'The Ecologists — EELV',          col: '#00a95c', ja: 'ヨーロッパ・エコロジー＝緑の党' },
  ECO:  { fr: 'Écologistes',                                en: 'Ecologists',                     col: '#5fbf7a' },
  /* centre */
  MDM:  { fr: 'Mouvement démocrate',                        en: 'Democratic Movement',            col: '#ff8c00', ja: '民主運動' },
  CEN:  { fr: 'Le Centre pour la France',                   en: 'The Centre for France',          col: '#ff8c00' },
  ALLI: { fr: 'Alliance centriste',                         en: 'Centrist Alliance',              col: '#f7b267' },
  PRV:  { fr: 'Parti radical valoisien',                    en: 'Radical Party',                  col: '#f0c060' },
  NCE:  { fr: 'Nouveau Centre',                             en: 'New Centre',                     col: '#74c0e3' },
  REM:  { fr: 'La République en marche',                    en: 'La République En Marche',        col: '#f2c300', ja: '共和国前進' },
  ENS:  { fr: 'Ensemble ! (majorité présidentielle)',       en: 'Ensemble (presidential majority)', col: '#f2c300', ja: 'アンサンブル' },
  HOR:  { fr: 'Horizons',                                   en: 'Horizons',                       col: '#6ec6f1', ja: 'オリゾン' },
  UDI:  { fr: 'Union des démocrates et indépendants',       en: 'Union of Democrats and Independents', col: '#00c4b0', ja: '民主独立連合' },
  DVC:  { fr: 'Divers centre',                              en: 'Other centre',                   col: '#f6b26b' },
  /* right */
  UMP:  { fr: 'Union pour un mouvement populaire',          en: 'Union for a Popular Movement',   col: '#1b56a4', ja: '国民運動連合' },
  LR:   { fr: 'Les Républicains',                           en: 'The Republicans',                col: '#1b56a4', ja: '共和党' },
  DVD:  { fr: 'Divers droite',                              en: 'Other right',                    col: '#6a9fd8' },
  DLF:  { fr: 'Debout la France',                           en: 'Debout la France',               col: '#23408f' },
  DSV:  { fr: 'Droite souverainiste',                       en: 'Sovereignist right',             col: '#3f5aa6' },
  /* far right */
  FN:   { fr: 'Front national',                             en: 'National Front',                 col: '#1b2d63', ja: '国民戦線' },
  RN:   { fr: 'Rassemblement national',                     en: 'National Rally',                 col: '#1b2d63', ja: '国民連合' },
  UXD:  { fr: 'Union de l\'extrême droite',                 en: 'Union of the far right',         col: '#28407a' },
  REC:  { fr: 'Reconquête !',                               en: 'Reconquête',                     col: '#4d3f8f', ja: '再征服' },
  EXD:  { fr: 'Extrême droite',                             en: 'Far right',                      col: '#5b3a29' },
  DXD:  { fr: 'Divers extrême droite',                      en: 'Other far right',                col: '#5b3a29' },
  /* neither */
  REG:  { fr: 'Régionaliste',                               en: 'Regionalist',                    col: '#b58b00' },
  DIV:  { fr: 'Divers',                                     en: 'Other',                          col: '#9aa0a6' },
  AUT:  { fr: 'Autres',                                     en: 'Others',                         col: '#9aa0a6' },
};

/* ══ generic readers ═══════════════════════════════════════════════════════════════════════════ */

/** Semicolon-separated text, quote-aware. The 2024 exports are UTF-8 with quoted headers; the 2022
 *  ones are latin-1 with none, and the same reader handles both because a quote is only special at
 *  the start of a field. */
function delimited(buf, encoding) {
  const text = new TextDecoder(encoding, { fatal: false }).decode(buf).replace(/^﻿/, '');
  const rows = [];
  let row = [], cur = '', quoted = false, fresh = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += c;
    } else if (c === '"' && fresh) { quoted = true; fresh = false; }
    else if (c === ';') { row.push(cur); cur = ''; fresh = true; }
    else if (c === '\n') { row.push(cur); cur = ''; rows.push(row); row = []; fresh = true; }
    else if (c !== '\r') { cur += c; fresh = false; }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.length > 1);
}

/** One sheet of a workbook, as rows of raw cell values. .xls (2012) and .xlsx (2017) alike. */
function sheet(buf, matcher) {
  const wb = readWorkbook(buf, { type: 'buffer' });
  const name = wb.SheetNames.find(n => matcher.test(n));
  if (!name) throw new Error('no sheet matching ' + matcher + ' in [' + wb.SheetNames.join(', ') + ']');
  return xlsxUtils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, blankrows: false });
}

/* ══ the shape every French result file has ════════════════════════════════════════════════════
   Four export formats, one structure: a fixed head of columns describing the circonscription, then
   the same short block of columns repeated once per candidate. What differs between them is only
   how the header announces the repeat:
     · 2012 — the block is 7 columns starting at «Sexe» and the header repeats it in full;
     · 2017 — 9 columns starting at «N°Panneau», header repeats it in full;
     · 2022 — 9 columns starting at «N°Panneau», header declares it ONCE and the rows repeat it;
     · 2024 — 9 columns, header numbers them («Nuance candidat 1», «Nuance candidat 2», …).
   ⚠ SO NONE OF THE THREE NUMBERS — where the head ends, how wide a block is, how many candidates a
   row has — IS WRITTEN DOWN. They are read off the header, and a row is walked until it runs out of
   candidates. A file that changes shape produces an error here rather than a plausible wrong map. */
const label = (v) => String(v == null ? '' : v).trim();
/** «Nuance candidat 3» and «Nuance» are the same column; the numbering is the export's, not a name. */
const baseLabel = (v) => label(v).replace(/\s+\d+$/, '').replace(/\s+candidat$/i, '');

function readRound(rows, where) {
  const headRow = rows.findIndex(r => r.some(c => /^Code (du )?d[ée]partement$/i.test(label(c))));
  if (headRow < 0) throw new Error(where + ': no header row (no «Code du département» column)');
  const head = rows[headRow].map(baseLabel);

  const find = (re) => {
    const i = head.findIndex(h => re.test(h));
    if (i < 0) throw new Error(where + ': no column matching ' + re + ' in [' + head.join('|') + ']');
    return i;
  };
  const iDept = find(/^Code (du )?d[ée]partement$/i);
  const iDeptName = find(/^Libell[ée] (du )?d[ée]partement$/i);
  const iCirco = find(/^Code (de la )?circonscription( l[ée]gislative)?$/i);
  const iCast = find(/^Exprim[ée]s$/i);

  /* where the repeating block starts: the panel-number column if the export has one, otherwise the
     candidate's sex, which is the first candidate column in the 2012 grille */
  let starts = head.map((h, i) => (/panneau/i.test(h) ? i : -1)).filter(i => i >= 0);
  if (!starts.length) starts = head.map((h, i) => (/^sexe$/i.test(h) ? i : -1)).filter(i => i >= 0);
  if (!starts.length) throw new Error(where + ': the header declares no candidate block');
  const lead = starts[0];
  /* two or more starts means the header spells the block out; exactly one means it declares the
     block once and leaves the rows to repeat it, so the block is the rest of the header */
  const width = starts.length > 1 ? starts[1] - starts[0] : head.length - lead;
  if (width < 4) throw new Error(where + ': candidate block is only ' + width + ' columns wide');

  const offset = (re) => {
    const i = head.slice(lead, lead + width).findIndex(h => re.test(h));
    return i < 0 ? null : i;
  };
  const oNuance = offset(/^Nuance$/i);
  const oName = offset(/^Nom$/i);
  const oFirst = offset(/^Pr[ée]nom$/i);
  const oVotes = offset(/^Voix$/i);
  /* the «this candidate was elected» flag is «Sièges» in 2017 and 2022, «Elu» in 2024, and does not
     exist at all in 2012 — which is why the winner is decided by votes and only CHECKED by the flag */
  const oElect = offset(/^(Si[èe]ges|Elu)$/i);
  if (oNuance == null || oName == null || oVotes == null) {
    throw new Error(where + ': candidate block has no Nuance/Nom/Voix (' +
      head.slice(lead, lead + width).join('|') + ')');
  }

  const out = [];
  for (const r of rows.slice(headRow + 1)) {
    if (r.length <= lead) continue;
    const deptCode = label(r[iDept]);
    if (!deptCode) continue;
    const candidates = [];
    for (let b = lead; b < r.length; b += width) {
      const nuance = label(r[b + oNuance]);
      const family = label(r[b + oName]);
      if (!nuance && !family) continue;   /* trailing empties: this row had fewer candidates */
      const votes = Number(label(r[b + oVotes]).replace(/\s/g, ''));
      candidates.push({
        nuance,
        name: [oFirst == null ? '' : label(r[b + oFirst]), family].filter(Boolean).join(' ').trim(),
        votes: Number.isFinite(votes) ? votes : null,
        elected: oElect == null ? null : label(r[b + oElect]) !== '',
      });
    }
    if (!candidates.length) continue;
    out.push({
      deptCode,
      deptName: label(r[iDeptName]),
      circo: label(r[iCirco]),
      cast: Number(label(r[iCast]).replace(/\s/g, '')),
      candidates,
      hasFlag: oElect != null,
    });
  }
  if (!out.length) throw new Error(where + ': the header was found but no rows followed it');
  return out;
}

/* ── joining a result row to a polygon ─────────────────────────────────────────────────────────
   ⚠ THE CIRCONSCRIPTION CODE IS NOT THE SAME STRING IN THE TWO FILES and it is not even the same
   string between the two rounds of one election. Measured 2026-09-09: the contour file writes
   «0104» and «ZA01»; the 2024 first round writes «104» for the same seat and «97101» where the
   contour file says «ZA01»; the 2024 second round writes «0104»; 2012 and 2017 write plain «4».
   What every one of them agrees on is that THE LAST TWO CHARACTERS ARE THE NUMBER WITHIN THE
   DEPARTMENT — and where the code is shorter than three characters it IS that number. That is the
   rule below, and it is checked: every department's numbers must come out as exactly 1…n. */
function circoNumber(code) {
  const s = String(code).trim();
  const n = (s.length > 2 && /\d\d$/.test(s)) ? Number(s.slice(-2)) : Number(s);
  return Number.isFinite(n) ? n : null;
}

/** «01» and «1» and «1.0» are one department; «2A», «971» and «ZZ» are themselves. */
const deptCode = (v) => {
  const s = label(v).replace(/\.0$/, '');
  return /^\d+$/.test(s) ? s.padStart(2, '0') : s.toUpperCase();
};
/** Accents and case move between exports («AIN» in 2012, «Ain» in 2017), so labels are compared
 *  with both stripped. */
const deptKey = (v) => label(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ══ geometry ══════════════════════════════════════════════════════════════════════════════════ */
async function resource(ctx, dataset, pattern) {
  const meta = await ctx.get(API + dataset + '/', { json: true });
  const hits = (meta.resources || []).filter(r => pattern.test(String(r.url || '')));
  if (hits.length !== 1) {
    throw new Error(dataset + ': ' + hits.length + ' resources match ' + pattern + ' (' +
      (meta.resources || []).map(r => String(r.title || r.url).split('/').pop()).join(', ') + ')');
  }
  return { id: hits[0].id, title: meta.title, licence: meta.license };
}

const ORDINAL = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

async function fetchGeo(ctx) {
  const r = await resource(ctx, GEO_DATASET, GEO_FILE);
  const fc = await ctx.get(RESOURCE + r.id, { json: true });
  if (!fc || !Array.isArray(fc.features) || !fc.features.length) {
    throw new Error('the contour file came back with no features');
  }
  const out = {
    type: 'FeatureCollection',
    features: fc.features.map(f => {
      const p = f.properties || {};
      const num = circoNumber(p.codeCirconscription);
      if (num == null) throw new Error('a contour has no usable circonscription code: ' + JSON.stringify(p));
      return {
        type: 'Feature',
        properties: {
          cd: label(p.codeCirconscription),
          n: {
            en: label(p.nomDepartement) + ' ' + ORDINAL(num) + ' constituency',
            native: label(p.nomDepartement) + ' — ' + label(p.nomCirconscription),
            fr: label(p.nomDepartement) + ' — ' + label(p.nomCirconscription),
          },
          /* kept for the join, stripped again before the file is written */
          _dept: deptCode(p.codeDepartement),
          _deptKey: deptKey(p.nomDepartement),
          _num: num,
        },
        geometry: f.geometry,
      };
    }),
  };
  return { fc: out, meta: r };
}

/* ══ build ═════════════════════════════════════════════════════════════════════════════════════ */
/* ── the note the reader reads ─────────────────────────────────────────────────────────────────
   ⚠ A NOTE IS A NAME TABLE, NOT A STRING: it is prose shown in the legend, so it obeys AGENTS.md
   §3.5 and exists in all nine languages. `src` and `lic` do not — an attribution line is the
   publisher's own wording and a licence is a legal condition, and translating either misquotes it.
   ⚠ AND EACH LANGUAGE BUILDS ITS OWN SENTENCE. The three counts do not fall in the same place in a
   Japanese, Korean or German sentence as in an English one, so this is nine sentences that happen
   to share three numbers — not one English sentence with the numbers swapped out.
   ⚠ BOTH `jp` AND `ja`: the app's own code for Japanese is 'jp' (js/lang-registry.js) and that is
   the key js/elections.js looks up in a name table; 'ja' is the BCP-47 tag the rest of this data
   uses. Carrying both costs one string and reaches the reader whichever the runtime asks for. */
function noteFor(total, drawn, offMap) {
  const jp = '議員 ' + total + ' 人はすべて小選挙区の二回投票で選ばれます。地図が描くのはそのうち ' + drawn +
    ' 選挙区で、残る ' + offMap + ' はフランス本土に土地を持たない在外フランス人選挙区と、公開されている' +
    '輪郭ファイルが覆っていない海外準県です。議席数には数えられていますが、地図上で色を塗ることはできません。';
  return {
    en: 'All ' + total + ' deputies are elected in single-member constituencies over two rounds. ' +
      'The map draws ' + drawn + ' of them; the remaining ' + offMap + ' are the constituencies for ' +
      'French citizens resident abroad, which have no ground in France, and the overseas ' +
      'collectivités the published contour file does not cover. They are counted in the seat ' +
      'totals and cannot be coloured.',
    ja: jp, jp,
    de: 'Alle ' + total + ' Abgeordneten werden in Einerwahlkreisen in zwei Wahlgängen gewählt. Die ' +
      'Karte zeichnet ' + drawn + ' davon; die übrigen ' + offMap + ' sind die Wahlkreise der im ' +
      'Ausland lebenden Französinnen und Franzosen, die in Frankreich kein Gebiet haben, sowie die ' +
      'überseeischen Gebietskörperschaften, die die veröffentlichte Umrissdatei nicht abdeckt. Sie ' +
      'zählen zu den Sitzzahlen und lassen sich nicht einfärben.',
    ru: 'Все ' + total + ' депутатов избираются в одномандатных округах в два тура. Карта показывает ' +
      drawn + ' из них; остальные ' + offMap + ' — это округа граждан Франции, живущих за рубежом, у ' +
      'которых нет территории во Франции, и заморские сообщества, не охваченные опубликованным файлом ' +
      'контуров. Они учтены в общем числе мест, но закрасить их невозможно.',
    es: 'Los ' + total + ' diputados se eligen en circunscripciones uninominales a dos vueltas. El mapa ' +
      'dibuja ' + drawn + ' de ellas; las ' + offMap + ' restantes son las circunscripciones de los ' +
      'franceses residentes en el extranjero, que no tienen territorio en Francia, y las colectividades ' +
      'de ultramar que el archivo de contornos publicado no cubre. Se cuentan en los totales de ' +
      'escaños y no se pueden colorear.',
    fr: 'Les ' + total + ' députés sont tous élus au scrutin uninominal majoritaire à deux tours. La ' +
      'carte en dessine ' + drawn + ' ; les ' + offMap + ' autres sont les circonscriptions des Français ' +
      'établis hors de France, qui n’ont pas de territoire en France, et les collectivités d’outre-mer ' +
      'que le fichier de contours publié ne couvre pas. Elles sont comptées dans les totaux de sièges ' +
      'mais ne peuvent pas être coloriées.',
    ko: '의원 ' + total + '명은 모두 소선거구제 결선투표로 선출됩니다. 지도에 그려진 것은 그중 ' + drawn +
      '개 선거구이며, 나머지 ' + offMap + '개는 프랑스 본토에 영역이 없는 재외국민 선거구와 공개된 경계 ' +
      '파일이 포함하지 않는 해외 집합체입니다. 의석 수에는 포함되지만 지도에 색을 칠할 수는 없습니다.',
    zh: '全部 ' + total + ' 名議員均由單一選區兩輪投票選出。地圖只繪出其中 ' + drawn + ' 個選區；其餘 ' +
      offMap + ' 個是在法國本土沒有地域的海外法國公民選區，以及已公布的輪廓檔案未涵蓋的海外行政區。' +
      '它們計入議席總數，但無法在地圖上上色。',
    'zh-hans': '全部 ' + total + ' 名议员均由单一选区两轮投票选出。地图只绘出其中 ' + drawn + ' 个选区；其余 ' +
      offMap + ' 个是在法国本土没有地域的海外法国公民选区，以及已公布的轮廓文件未涵盖的海外行政区。' +
      '它们计入议席总数，但无法在地图上上色。',
  };
}

export async function build(ctx) {
  const { fc, meta: geoMeta } = await fetchGeo(ctx);

  /* two ways into the same polygon. The department CODE is what 2012, 2017 and 2022 share with the
     contour file; 2024 switched the overseas departments to their INSEE numbers (971 for what the
     contour file calls ZA), and there the department NAME is what the two have in common. Both are
     tried, and when both answer they must agree — that is the check that keeps «matched by name»
     from quietly matching the wrong thing. */
  const byCode = new Map(), byName = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    const k1 = p._dept + '#' + p._num, k2 = p._deptKey + '#' + p._num;
    if (byCode.has(k1)) throw new Error('two contours claim department ' + p._dept + ' circonscription ' + p._num);
    byCode.set(k1, p.cd);
    byName.set(k2, p.cd);
  }
  /* every department in the file must number its circonscriptions 1…n, or circoNumber() is reading
     some other part of the code */
  const perDept = new Map();
  for (const f of fc.features) {
    const p = f.properties;
    if (!perDept.has(p._dept)) perDept.set(p._dept, []);
    perDept.get(p._dept).push(p._num);
  }
  for (const [dept, nums] of perDept) {
    const want = nums.map((_, i) => i + 1).join(',');
    if (nums.slice().sort((a, b) => a - b).join(',') !== want) {
      throw new Error('department ' + dept + ' has circonscriptions [' + nums.sort((a, b) => a - b).join(',') +
        '] rather than 1…' + nums.length);
    }
  }

  const geoCodes = new Set(fc.features.map(f => f.properties.cd));

  const parties = {}, elections = [], res = {};
  const usedNuances = new Set();

  for (const e of ELECTIONS) {
    const rounds = [];
    for (const r of e.rounds) {
      const meta = await resource(ctx, r.ds, r.file);
      const buf = await ctx.get(RESOURCE + meta.id);
      const where = e.y + ' round ' + r.t;
      const rows = r.sheet ? sheet(buf, r.sheet) : delimited(buf, r.enc || 'utf-8');
      rounds.push({ t: r.t, meta, rows: readRound(rows, where) });
      /* ⚠ EVERY NUANCE IN EVERY ROUND, not just the ones that survived to the decisive round. A code
         that only ever appears among first-round losers still reaches the reader: it is in the
         national vote-share bar. Measured 2026-09-09, DXD (divers extrême droite) is exactly that in
         2022 — it won nothing and was in no run-off. */
      for (const row of rounds[rounds.length - 1].rows) {
        for (const c of row.candidates) {
          if (!c.nuance) continue;
          if (!NUANCES[c.nuance]) {
            throw new Error(where + ' ' + row.deptCode + '/' + row.circo + ': nuance «' + c.nuance +
              '» is not in the ministry grille recorded in NUANCES — add it rather than let a ' +
              'candidate go unlabelled');
          }
          usedNuances.add(c.nuance);
        }
      }
    }
    const [first, second] = rounds;

    /* ⚠ THE SEAT IS DESCRIBED BY THE ROUND THAT DECIDED IT. Everything in the second-round file was
       decided there; everything absent from it was won outright in the first. */
    /* ⚠ the key is the NORMALISED department code: the 2024 first round writes Ain as «1» and its
       second round writes «01», so the raw strings would make one seat look like two */
    const seatKey = (row) => deptCode(row.deptCode) + '#' + circoNumber(row.circo);
    const decisive = new Map();   /* seatKey → the row of the round that decided it */
    for (const row of first.rows) decisive.set(seatKey(row), row);
    for (const row of second.rows) decisive.set(seatKey(row), row);
    if (decisive.size !== first.rows.length) {
      throw new Error(e.y + ': the two rounds describe ' + decisive.size + ' seats between them but the ' +
        'first round has ' + first.rows.length);
    }

    const d = {};
    const seats = new Map();
    let offMap = 0;
    for (const [key, row] of decisive) {
      const num = circoNumber(row.circo);
      if (num == null) throw new Error(e.y + ' ' + key + ': unreadable circonscription code «' + row.circo + '»');

      const ranked = row.candidates.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0));
      const winner = ranked[0];
      if (!winner || !winner.nuance) throw new Error(e.y + ' ' + key + ': no candidate with a nuance');
      /* where the file states who was elected, its statement and the arithmetic must be the same
         candidate; where it does not (2012), the arithmetic stands alone and says so */
      /* ⚠ 2012 IS THE ONE FILE WITH NO «who was elected» COLUMN, so there the arithmetic stands
         alone — and arithmetic cannot break a tie. French law gives a tied seat to the elder
         candidate, which no column in these files records, so a tie stops the build rather than
         being settled by whichever row happened to sort first. */
      if (!row.hasFlag && ranked.length > 1 && (ranked[0].votes || 0) === (ranked[1].votes || 0)) {
        throw new Error(e.y + ' ' + key + ': ' + ranked[0].name + ' and ' + ranked[1].name +
          ' are tied and this file does not say who was elected');
      }
      if (row.hasFlag) {
        const flagged = row.candidates.filter(c => c.elected);
        if (flagged.length !== 1) {
          throw new Error(e.y + ' ' + key + ': ' + flagged.length + ' candidates are marked elected');
        }
        if (flagged[0].name !== winner.name) {
          throw new Error(e.y + ' ' + key + ': the file elects ' + flagged[0].name +
            ' but ' + winner.name + ' has more votes');
        }
      }
      const wid = 'fr:' + winner.nuance.toLowerCase();
      seats.set(wid, (seats.get(wid) || 0) + 1);

      /* the polygon, if this seat has one at all */
      const byCodeHit = byCode.get(deptCode(row.deptCode) + '#' + num);
      const byNameHit = byName.get(deptKey(row.deptName) + '#' + num);
      if (byCodeHit && byNameHit && byCodeHit !== byNameHit) {
        throw new Error(e.y + ' ' + key + ': department code says ' + byCodeHit +
          ' and department name says ' + byNameHit);
      }
      const cd = byCodeHit || byNameHit;
      if (!cd) { offMap++; continue; }
      if (!geoCodes.has(cd)) throw new Error(e.y + ' ' + key + ': matched ' + cd + ', which is not a polygon');

      const rec = {
        w: wid,
        c: ranked.filter(c => c.nuance || c.name).map(c => {
          const out = { n: c.name || c.nuance };
          if (c.nuance) out.p = 'fr:' + c.nuance.toLowerCase();
          if (c.votes != null) out.v = c.votes;   /* ⚠ absent is absent, never zero */
          return out;
        }),
      };
      if (Number.isFinite(row.cast)) rec.t = row.cast;
      d[cd] = rec;
    }

    /* ⚠ THE NATIONAL BAR IS COUNTED OVER ALL 577 SEATS — including the 18 the map cannot draw. A bar
       counted only over the polygons would drop eleven seats' worth of Français de l'étranger and
       seven overseas seats, and those have decided the shape of a majority before. */
    const total = [...seats.values()].reduce((a, b) => a + b, 0);
    const drawn = Object.keys(d).length;
    if (drawn + offMap !== total) {
      throw new Error(e.y + ': ' + drawn + ' drawn + ' + offMap + ' off-map ≠ ' + total + ' seats');
    }
    if (drawn !== geoCodes.size) {
      throw new Error(e.y + ': ' + drawn + ' of the ' + geoCodes.size + ' polygons have a result');
    }

    /* national first-round vote share: in a two-round election the first round is the one in which
       every party stood everywhere, so it is the only round whose shares mean anything nationally */
    const firstVotes = new Map();
    let firstTotal = 0;
    for (const row of first.rows) {
      for (const c of row.candidates) {
        if (!c.nuance || c.votes == null) continue;
        const id = 'fr:' + c.nuance.toLowerCase();
        firstVotes.set(id, (firstVotes.get(id) || 0) + c.votes);
        firstTotal += c.votes;
      }
    }
    const n = [...new Set([...seats.keys(), ...firstVotes.keys()])]
      .map(id => {
        const row = { p: id, seats: seats.get(id) || 0, dseats: seats.get(id) || 0 };
        if (firstTotal) row.pct = Math.round((firstVotes.get(id) || 0) / firstTotal * 1e4) / 1e2;
        return row;
      })
      .sort((a, b) => (b.seats - a.seats) || ((b.pct || 0) - (a.pct || 0)));

    const id = 'fr-an-' + e.y;
    res[id + '.res.json'] = { d, n };

    const sources = rounds.map(r => r.meta.title).join('; ');
    const licences = [...new Set([geoMeta.licence, ...rounds.map(r => r.meta.licence)])]
      .map(l => LICENCES[l] || String(l));
    elections.push({
      id,
      polity: 'fr',
      body: { en: 'National Assembly', native: 'Assemblée nationale', ja: '国民議会' },
      date: e.date,
      y: e.y,
      geo: GEO_ID + '.geo.json',
      res: id + '.res.json',
      seatsTotal: total,
      districtSeats: drawn,
      listSeats: offMap,
      note: noteFor(total, drawn, offMap),
      src: 'Results: Ministère de l\'Intérieur — ' + sources + ' (data.gouv.fr). ' +
        'Boundaries: « ' + geoMeta.title + ' » (data.gouv.fr), dissolved from polling-district outlines.',
      lic: licences.join(' / '),
    });
  }

  /* only the nuances that actually occur reach the index — the four grilles overlap and a code from
     2012 that nobody used again would otherwise sit in every reader's download for ever */
  for (const code of [...usedNuances].sort()) {
    const nu = NUANCES[code];
    const n = { en: nu.en, native: nu.fr, fr: nu.fr };
    if (nu.ja) n.ja = nu.ja;
    parties['fr:' + code.toLowerCase()] = { n, col: nu.col };
  }

  /* the join keys were carried on the features only to get here */
  for (const f of fc.features) {
    delete f.properties._dept;
    delete f.properties._deptKey;
    delete f.properties._num;
  }
  simplifyGeoJSON(fc, { tolerance: TOLERANCE, decimals: DECIMALS });

  return {
    polities: [{
      id: 'fr',
      n: { en: 'France', native: 'France', ja: 'フランス' },
      /* metropolitan France: where 539 of the 559 polygons are. The overseas ones are drawn wherever
         they are, but a home box that contained them would be most of the planet. */
      home: [[-5.3, 41.3], [9.7, 51.2]],
    }],
    parties,
    elections,
    geo: { [GEO_ID + '.geo.json']: fc },
    res,
  };
}
