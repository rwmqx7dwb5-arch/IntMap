#!/usr/bin/env node
/* ============================================================================
 *  IntMap · MADDISON PROJECT — carrying the historical series back to 1850   (#R349)
 * ----------------------------------------------------------------------------
 *  「1850年までさかのぼれるように。（1900までと完全に同様に。）」 The clock's floor moved to 1850
 *  (js/chronos.js), and 「完全に同様に」 means the GDP and population a country card shows at 1875 must
 *  come from the same place it comes from at 1905 — not be missing because the bundle happened to
 *  start where the old floor did.
 *
 *  ══ WHAT WAS ACTUALLY WRONG ═════════════════════════════════════════════════════════════════
 *  data/maddison.json held 1900–2018 and nothing earlier. That was never a limit of the SOURCE: the
 *  Maddison Project Database 2020 (Bolt & van Zanden 2020) carries most countries from 1820 and some
 *  from far earlier. The bundle was cut at 1900 because that is where the clock stopped. Extending
 *  the clock without extending this file would have produced a 1875 that renders era borders and era
 *  names and then reports 「データなし」 for every number — the exact shape of 「1900までと完全に同様
 *  に」 failing.
 *
 *  ══ THE SOURCE, AND WHY THIS MIRROR ═════════════════════════════════════════════════════════
 *  MPD2020's own release is an .xlsx behind a signed-URL dataverse endpoint. Our World in Data
 *  publishes the same release as CSV in owid/owid-datasets, and that CSV was VERIFIED to be the same
 *  numbers this bundle already carried: of the 168 codes committed here, 153 reproduce their entire
 *  1900–2018 series from it cell for cell, and the other 15 differ only by ±1 in the last digit of a
 *  rounded population (Belgium 1967 is 9 556.5 thousand — this file floored it, the mirror rounds it
 *  up). That is a rounding artefact of the same figures, not a different vintage.
 *
 *  ══ THE ONE RULE THIS SCRIPT OBEYS ══════════════════════════════════════════════════════════
 *  ⚠ IT EXTENDS, IT DOES NOT REWRITE. Every year ≥ MIN_KEEP already in data/maddison.json is copied
 *  through UNTOUCHED, including those 15 off-by-one cells. Re-rounding them would have been a silent
 *  change to 15 numbers nobody asked about, in a round about reaching 1850. The script still CHECKS
 *  each of them against the mirror and fails if any disagrees by more than the rounding tolerance —
 *  so «unchanged» is asserted, not assumed.
 *
 *  Shape (unchanged): { ISO3|SUN|YUG|CSK : { year : [ gdpPerCapita2011intl, populationThousands ] } }
 *
 *      node scripts/build-maddison.mjs                  # rewrite data/maddison.json (network)
 *      node scripts/build-maddison.mjs --check          # verify the committed file (network)
 *      node scripts/build-maddison.mjs --offline-check  # structure only, no network (npm test)
 * ==========================================================================*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'maddison.json');

/* The floor is the clock's floor (js/chronos.js YMIN). Years below it cannot be reached, so carrying
   them would be bytes on a lazy-loaded file that no reader can ever ask for. */
const FLOOR = 1850;
/* Everything from here up is whatever the committed file already said. */
const MIN_KEEP = 1900;

const SRC = 'https://raw.githubusercontent.com/owid/owid-datasets/master/datasets/'
  + 'Maddison%20Project%20Database%202020%20(Bolt%20and%20van%20Zanden%20(2020))/'
  + 'Maddison%20Project%20Database%202020%20(Bolt%20and%20van%20Zanden%20(2020)).csv';

/* ISO3 (plus the three former states MPD carries as first-class entities) → the CSV's `Entity`.
   ⚠ THIS TABLE WAS DERIVED, NOT TYPED. 153 of the 168 rows were found by matching each committed
   series against every entity in the CSV and taking the one that reproduced it exactly; the
   remaining 15 are the 15 leftover entity names, each paired with the one code whose series differs
   from it only by the rounding noted in the header. The build re-proves every pairing on every run
   (see `verifyKept`), so a mirror that renamed an entity fails loudly instead of dropping a country. */
const ENTITY = {
  AFG:'Afghanistan', AGO:'Angola', ALB:'Albania', ARE:'United Arab Emirates', ARG:'Argentina', ARM:'Armenia',
  AUS:'Australia', AUT:'Austria', AZE:'Azerbaijan', BDI:'Burundi', BEL:'Belgium', BEN:'Benin', BFA:'Burkina Faso',
  BGD:'Bangladesh', BGR:'Bulgaria', BHR:'Bahrain', BIH:'Bosnia and Herzegovina', BLR:'Belarus', BOL:'Bolivia',
  BRA:'Brazil', BRB:'Barbados', BWA:'Botswana', CAF:'Central African Republic', CAN:'Canada', CHE:'Switzerland',
  CHL:'Chile', CHN:'China', CIV:"Cote d'Ivoire", CMR:'Cameroon', COD:'Democratic Republic of Congo', COG:'Congo',
  COL:'Colombia', COM:'Comoros', CPV:'Cape Verde', CRI:'Costa Rica', CSK:'Czechoslovakia', CUB:'Cuba',
  CYP:'Cyprus', CZE:'Czechia', DEU:'Germany', DJI:'Djibouti', DMA:'Dominica', DNK:'Denmark',
  DOM:'Dominican Republic', DZA:'Algeria', ECU:'Ecuador', EGY:'Egypt', ESP:'Spain', EST:'Estonia', ETH:'Ethiopia',
  FIN:'Finland', FRA:'France', GAB:'Gabon', GBR:'United Kingdom', GEO:'Georgia', GHA:'Ghana', GIN:'Guinea',
  GMB:'Gambia', GNB:'Guinea-Bissau', GNQ:'Equatorial Guinea', GRC:'Greece', GTM:'Guatemala', HKG:'Hong Kong',
  HND:'Honduras', HRV:'Croatia', HTI:'Haiti', HUN:'Hungary', IDN:'Indonesia', IND:'India', IRL:'Ireland',
  IRN:'Iran', IRQ:'Iraq', ISL:'Iceland', ISR:'Israel', ITA:'Italy', JAM:'Jamaica', JOR:'Jordan', JPN:'Japan',
  KAZ:'Kazakhstan', KEN:'Kenya', KGZ:'Kyrgyzstan', KHM:'Cambodia', KOR:'South Korea', KWT:'Kuwait', LAO:'Laos',
  LBN:'Lebanon', LBR:'Liberia', LBY:'Libya', LCA:'Saint Lucia', LKA:'Sri Lanka', LSO:'Lesotho', LTU:'Lithuania',
  LUX:'Luxembourg', LVA:'Latvia', MAR:'Morocco', MDA:'Moldova', MDG:'Madagascar', MEX:'Mexico',
  MKD:'North Macedonia', MLI:'Mali', MLT:'Malta', MMR:'Myanmar', MNE:'Montenegro', MNG:'Mongolia',
  MOZ:'Mozambique', MRT:'Mauritania', MUS:'Mauritius', MWI:'Malawi', MYS:'Malaysia', NAM:'Namibia', NER:'Niger',
  NGA:'Nigeria', NIC:'Nicaragua', NLD:'Netherlands', NOR:'Norway', NPL:'Nepal', NZL:'New Zealand', OMN:'Oman',
  PAK:'Pakistan', PAN:'Panama', PER:'Peru', PHL:'Philippines', POL:'Poland', PRI:'Puerto Rico', PRK:'North Korea',
  PRT:'Portugal', PRY:'Paraguay', PSE:'Palestine', QAT:'Qatar', ROU:'Romania', RUS:'Russia', RWA:'Rwanda',
  SAU:'Saudi Arabia', SEN:'Senegal', SGP:'Singapore', SLE:'Sierra Leone', SLV:'El Salvador', SRB:'Serbia',
  STP:'Sao Tome and Principe', SUN:'Former USSR', SVK:'Slovakia', SVN:'Slovenia', SWE:'Sweden', SWZ:'Eswatini',
  SYC:'Seychelles', SYR:'Syria', TCD:'Chad', TGO:'Togo', THA:'Thailand', TJK:'Tajikistan', TKM:'Turkmenistan',
  TTO:'Trinidad and Tobago', TUN:'Tunisia', TUR:'Turkey', TWN:'Taiwan', TZA:'Tanzania', UGA:'Uganda',
  UKR:'Ukraine', URY:'Uruguay', USA:'United States', UZB:'Uzbekistan', VEN:'Venezuela', VNM:'Vietnam', YEM:'Yemen',
  YUG:'Former Yugoslavia', ZAF:'South Africa', ZMB:'Zambia', ZWE:'Zimbabwe',
};

const args = new Set(process.argv.slice(2));
const fail = (m) => { console.error('build-maddison: ' + m); process.exit(1); };

/* ── the committed file ─────────────────────────────────────────────────────────────────────── */
function readCommitted() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')); }
  catch (e) { return fail('cannot read data/maddison.json — ' + e.message); }
}

/* ── structure, provable without the network ────────────────────────────────────────────────── */
function checkStructure(j) {
  const codes = Object.keys(j);
  if (codes.length !== Object.keys(ENTITY).length) fail('expected ' + Object.keys(ENTITY).length + ' codes, found ' + codes.length);
  let lo = Infinity, hi = -Infinity, cells = 0, pre = 0;
  for (const c of codes) {
    if (!/^[A-Z]{3}$/.test(c)) fail('bad code ' + c);
    if (!ENTITY[c]) fail('code ' + c + ' has no entity mapping');
    for (const y of Object.keys(j[c])) {
      const n = +y;
      if (!Number.isInteger(n) || n < FLOOR || n > 2100) fail(c + ' has out-of-range year ' + y);
      const v = j[c][y];
      if (!Array.isArray(v) || v.length !== 2) fail(c + ' ' + y + ' is not a [gdppc, pop] pair');
      if (v[0] == null && v[1] == null) fail(c + ' ' + y + ' is an empty pair — an absent year is absent, not null');
      if (n < lo) lo = n; if (n > hi) hi = n;
      cells++; if (n < MIN_KEEP) pre++;
    }
  }
  if (lo > FLOOR) fail('nothing reaches the floor: earliest year is ' + lo + ', floor is ' + FLOOR);
  if (!pre) fail('no pre-' + MIN_KEEP + ' data at all — the extension did not happen');
  return { codes: codes.length, lo, hi, cells, pre };
}

/* ── the mirror ─────────────────────────────────────────────────────────────────────────────── */
async function fetchSeries() {
  const r = await fetch(SRC);
  if (!r.ok) fail('MPD2020 mirror returned HTTP ' + r.status);
  const text = await r.text();
  const rows = text.split(/\r?\n/);
  const head = rows[0].split(',');
  if (head[0] !== 'Entity' || head[1] !== 'Year' || head[2] !== 'GDP per capita' || head[3] !== 'Population')
    fail('the mirror changed shape — header is "' + rows[0] + '"');
  const byEntity = new Map();
  for (let i = 1; i < rows.length; i++) {
    const line = rows[i]; if (!line) continue;
    const m = line.match(/^("[^"]*"|[^,]*),(\d+),([^,]*),([^,]*),/);
    if (!m) continue;
    const ent = m[1].replace(/^"|"$/g, '');
    const year = +m[2];
    const gdppc = m[3] === '' ? null : Math.round(+m[3]);
    const pop = m[4] === '' ? null : Math.round(+m[4] / 1000);
    if (gdppc == null && pop == null) continue;
    let e = byEntity.get(ent); if (!e) byEntity.set(ent, e = {});
    e[year] = [gdppc, pop];
  }
  return byEntity;
}

/* every kept cell must still be the mirror's number, to within the ±1 rounding the header explains */
function verifyKept(committed, byEntity) {
  let checked = 0, tol = 0;
  for (const [code, ent] of Object.entries(ENTITY)) {
    const mine = committed[code]; if (!mine) fail('committed file has no ' + code);
    const theirs = byEntity.get(ent);
    if (!theirs) fail('the mirror no longer has an entity named "' + ent + '" (for ' + code + ')');
    for (const y of Object.keys(mine)) {
      if (+y < MIN_KEEP) continue;
      const a = mine[y], b = theirs[y];
      if (!b) fail(code + ' ' + y + ': committed here but absent from the mirror');
      for (let k = 0; k < 2; k++) {
        if (a[k] == null && b[k] == null) continue;
        if (a[k] == null || b[k] == null) fail(code + ' ' + y + ' field ' + k + ': one side is absent');
        const d = Math.abs(a[k] - b[k]);
        if (d > 1) fail(code + ' ' + y + ' field ' + k + ': committed ' + a[k] + ', mirror ' + b[k]);
        if (d === 1) tol++;
      }
      checked++;
    }
  }
  return { checked, tol };
}

function build(committed, byEntity) {
  const out = {};
  for (const [code, ent] of Object.entries(ENTITY)) {
    const theirs = byEntity.get(ent) || {};
    const rec = {};
    for (let y = FLOOR; y < MIN_KEEP; y++) if (theirs[y]) rec[y] = theirs[y];
    for (const y of Object.keys(committed[code] || {}).sort((a, b) => a - b)) rec[y] = committed[code][y];
    out[code] = rec;
  }
  return out;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const committed = readCommitted();
  if (args.has('--offline-check')) {
    const s = checkStructure(committed);
    console.log('maddison: ' + s.codes + ' codes · ' + s.lo + '–' + s.hi + ' · ' + s.cells
      + ' cells (' + s.pre + ' before ' + MIN_KEEP + ') — structure ok');
    return;
  }
  const byEntity = await fetchSeries();
  const v = verifyKept(committed, byEntity);
  const built = build(committed, byEntity);
  if (args.has('--check')) {
    if (!same(built, committed)) fail('data/maddison.json is not what this script produces — run it without --check');
    const s = checkStructure(committed);
    console.log('maddison --check: ' + s.codes + ' codes · ' + s.lo + '–' + s.hi + ' · ' + s.cells
      + ' cells (' + s.pre + ' before ' + MIN_KEEP + ') · ' + v.checked + ' kept cells re-verified ('
      + v.tol + ' within the ±1 rounding) — ok');
    return;
  }
  const s = checkStructure(built);
  writeFileSync(OUT, JSON.stringify(built));
  console.log('maddison: wrote data/maddison.json — ' + s.codes + ' codes · ' + s.lo + '–' + s.hi
    + ' · ' + s.cells + ' cells (' + s.pre + ' new, before ' + MIN_KEEP + ') · '
    + v.checked + ' existing cells re-verified against MPD2020');
})();
