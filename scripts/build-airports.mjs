#!/usr/bin/env node
/* ============================================================================
 *  IntMap · AIR CONNECTIVITY PER COUNTRY, SHIPPED  (#R666)
 * ----------------------------------------------------------------------------
 *  The pandemic simulator carried an outbreak between countries by drawing the destination
 *  UNIFORMLY (js/pandemic-model.js, `Math.floor(rnd()*N)`): Tuvalu and India were equally likely to
 *  receive the world's next importation, and distance only decided whether the try was accepted.
 *  The audit's PHASE 2 asks for the destination itself to be weighted — by population, by land
 *  adjacency and by air connectivity.
 *
 *  Population and land borders were already in the repository (`countryStats[code].pop` at run time,
 *  `data/country-facts.json`'s `borders` — 163 countries, 322 undirected edges, symmetric). Air
 *  connectivity was the one material that was NOT: everything aviation in IntMap is live ADS-B
 *  (supabase/functions/aviation-feed) or a run-time CSV read for runway geometry
 *  (js/map-extras.js), and neither is a fact that can be shipped. This file makes the missing one.
 *
 *  ⚠⚠⚠ WHAT THIS IS, AND WHAT IT IS NOT. OurAirports publishes, per airport, a SIZE CLASS and
 *  whether it has scheduled service. It does NOT publish routes, flight frequencies or passenger
 *  numbers, and no source in this repository does. So the number built here is «how much scheduled
 *  airline infrastructure this country has», which is a real, dated, attributable measure of air
 *  connectivity — and it is NOT a traffic matrix. The simulator must go on saying so;
 *  `Architecture.md` §8.5 and the simulator's own on-screen disclaimer both do.
 *
 *  THE NUMBER
 *    cap  = (large airports with scheduled service) + 0.25 × (medium airports with scheduled service)
 *  Large airports are the ones international traffic actually uses; medium ones carry it too, at
 *  roughly a quarter of the throughput per airport — the 0.25 is a WEIGHT, not a measurement, and it
 *  lives here rather than inside the model so that a better one is one line in one file. Airports
 *  with no scheduled service are excluded entirely: a bush strip is not connectivity. Heliports,
 *  seaplane bases, balloonports and closed fields are excluded by `type`.
 *
 *  ⚠ KEYED BY ISO3, because everything downstream is — `countryStats` resolves ISO_A3_EH → ISO_A3 →
 *  ADM0_A3 → SOV_A3, and `data/country-facts.json` is ISO3. OurAirports is ISO2, so the mapping
 *  comes from mledoze/countries (the same upstream `data/country-facts.json` is built from), and
 *  every ISO2 that fails to map is REPORTED in the output rather than dropped in silence.
 *
 *  USAGE
 *    node scripts/build-airports.mjs            fetch, derive, write data/airports.json
 *    node scripts/build-airports.mjs --check    fetch, derive, compare with the committed file
 *
 *  ⚠ NOT IN `npm test`. It needs the network. The committed file is validated OFFLINE by
 *  tests/r666-checks.test.mjs, and that the weighting actually reaches the outbreak is measured in
 *  the same file by RUNNING the model.
 *
 *  SOURCES
 *    · OurAirports (public domain) — https://davidmegginson.github.io/ourairports-data/airports.csv
 *      `type`, `iso_country`, `scheduled_service`. Already IntMap's runway upstream
 *      (docs/AVIATION-DATA-SOURCES.md).
 *    · mledoze/countries (ODbL 1.0) — cca2 → cca3 only.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'airports.json');

const AIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const MLEDOZE = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json';

/* the same one alias data/country-facts.json declares — Natural Earth's KOS is mledoze's UNK */
const ALIAS = { UNK: 'KOS' };

/* How much a medium airport with scheduled service counts against a large one. A WEIGHT, stated
   here so a better one is a one-line change. Expires the moment a source with real seat or
   passenger counts is available to this project. */
const MEDIUM_WEIGHT = 0.25;

/* A minimal RFC-4180 reader. OurAirports quotes names containing commas and doubles inner quotes;
   a split(',') loses thousands of rows and nobody notices, which is the failure this avoids. */
function parseCsv(csv) {
  const out = []; let i = 0, f = '', row = [], q = false;
  while (i < csv.length) {
    const c = csv[i];
    if (q) {
      if (c === '"') { if (csv[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\n') { row.push(f); f = ''; out.push(row); row = []; i++; continue; }
    if (c === '\r') { i++; continue; }
    f += c; i++;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  return out;
}

async function grabText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  return await r.text();
}

const check = process.argv.includes('--check');

const [csv, mled] = await Promise.all([grabText(AIRPORTS), grabText(MLEDOZE).then(JSON.parse)]);

const a2to3 = new Map();
for (const c of mled) { if (c && c.cca2 && c.cca3) a2to3.set(c.cca2, ALIAS[c.cca3] || c.cca3); }

const rows = parseCsv(csv);
const head = rows[0];
const iType = head.indexOf('type'), iCty = head.indexOf('iso_country'), iSch = head.indexOf('scheduled_service');
if (iType < 0 || iCty < 0 || iSch < 0) throw new Error('OurAirports changed its columns: ' + head.join(','));

const per = new Map();     /* ISO3 → {lg, md} */
const unmatched = new Map();
let considered = 0;
for (let k = 1; k < rows.length; k++) {
  const r = rows[k];
  if (r.length < head.length - 2) continue;
  const t = r[iType];
  if (t !== 'large_airport' && t !== 'medium_airport') continue;
  if (r[iSch] !== 'yes') continue;
  considered++;
  const a2 = r[iCty];
  const c3 = a2to3.get(a2);
  if (!c3) { unmatched.set(a2, (unmatched.get(a2) || 0) + 1); continue; }
  const o = per.get(c3) || { lg: 0, md: 0 };
  if (t === 'large_airport') o.lg++; else o.md++;
  per.set(c3, o);
}

const countries = {};
for (const [c3, o] of [...per.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
  countries[c3] = { lg: o.lg, md: o.md, cap: +(o.lg + MEDIUM_WEIGHT * o.md).toFixed(2) };
}

const capTotal = Object.values(countries).reduce((s, o) => s + o.cap, 0);
const built = {
  '//': 'Built by scripts/build-airports.mjs — do not edit by hand. Scheduled-service airline infrastructure per country. NOT routes, frequencies or passenger numbers; no source in this project has those.',
  built: new Date().toISOString().slice(0, 10),
  sources: [
    { name: 'OurAirports', url: AIRPORTS, license: 'Public domain', fields: 'type, iso_country, scheduled_service' },
    { name: 'mledoze/countries', url: MLEDOZE, license: 'ODbL 1.0', fields: 'cca2 to cca3 only' },
  ],
  formula: 'cap = large_airport(scheduled) + ' + MEDIUM_WEIGHT + ' x medium_airport(scheduled)',
  mediumWeight: MEDIUM_WEIGHT,
  airportsCounted: considered,
  capTotal: +capTotal.toFixed(2),
  unmatchedIso2: [...unmatched.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => a + ':' + n),
  countries,
};
const out = JSON.stringify(built, null, 1) + '\n';

if (check) {
  const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null;
  if (!have) { console.error('no committed file at ' + OUT); process.exit(1); }
  let diff = 0;
  const keys = new Set([...Object.keys(have.countries), ...Object.keys(built.countries)]);
  for (const k of [...keys].sort()) {
    const a = have.countries[k], b = built.countries[k];
    if (!a || !b || a.lg !== b.lg || a.md !== b.md) { diff++; console.log('  ' + k + ' committed=' + JSON.stringify(a) + ' upstream=' + JSON.stringify(b)); }
  }
  console.log(diff ? diff + ' of ' + keys.size + ' countries differ from upstream' : 'committed file matches upstream (' + keys.size + ' countries)');
  process.exit(diff ? 1 : 0);
}

fs.writeFileSync(OUT, out);
console.log('wrote ' + path.relative(ROOT, OUT));
console.log('  ' + Object.keys(countries).length + ' countries · ' + considered + ' scheduled-service airports · cap total ' + capTotal.toFixed(1));
console.log('  unmatched ISO2: ' + (built.unmatchedIso2.length ? built.unmatchedIso2.join(' ') : 'none'));
