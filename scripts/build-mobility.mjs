#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHERE PEOPLE ACTUALLY FLY, AND HOW MANY OF THEM  (#R678)
 * ----------------------------------------------------------------------------
 *  The pandemic simulator draws an importation's destination from a weight per ordered pair
 *  (js/pandemic-model.js, `MOB_CUM`). Until this file existed, that weight had no bilateral term
 *  in it at all: it was `attract_j · exp(−d_ij / 3200 km)`, where `attract_j` is country j's
 *  SCHEDULED AIRLINE INFRASTRUCTURE (data/airports.json). Two consequences followed from having
 *  no pair-level fact, and both of them are visible in a run:
 *
 *    · Distance decay is isotropic. It cannot know that France–Senegal, Spain–Argentina,
 *      Portugal–Brazil and the United Kingdom–India carry far more people than their distance
 *      allows, because what puts people on those aircraft is language, empire and diaspora,
 *      none of which is a function of kilometres.
 *    · Infrastructure is not flow. A country's airport count grows with its LAND AREA
 *      (js/pandemic-model.js's AIR_EXP comment measured this on Russia), and the number of
 *      people who actually board an aircraft there does not.
 *
 *  ⚠⚠⚠ WHAT WAS AND WAS NOT AVAILABLE. MEASURED, 2026-09-10, before writing any of this:
 *
 *    · OurAirports (IntMap's existing aviation upstream) publishes NO routes, NO frequencies and
 *      NO passenger numbers. Confirmed again — it is why data/airports.json counts runways.
 *    · OpenFlights publishes a real airport-pair route table, and it is the only openly licensed
 *      one there is. It has been FROZEN SINCE JUNE 2014: openflights.org/data.php says in its own
 *      words that the third party supplying it stopped in June 2014 and the data «is of historical
 *      value only». It carries route EXISTENCE per airline — not frequency, not seats, not
 *      passengers.
 *    · OAG, ICAO TFS and Sabre publish the real seat and passenger matrices. All three are
 *      commercial. There is no open, current bilateral passenger matrix.
 *    · The World Bank publishes, per country and per year, how many people actually arrive from
 *      abroad (ST.INT.ARVL), how many residents leave (ST.INT.DPRT) and how many board an aircraft
 *      (IS.AIR.PSGR). Those are MARGINALS — real observed volumes — but they say nothing about
 *      which PAIR, so they cannot make a matrix on their own.
 *
 *  So the honest construction is layered, and the simulator names each layer on screen:
 *      WHICH PAIR      ← OpenFlights 2014 route counts, where the origin has any (real, but stale)
 *      HOW ATTRACTIVE  ← World Bank observed arrivals, pre-2020 (real, and current)
 *      EVERYTHING ELSE ← the existing distance kernel (a prior, not an observation)
 *
 *  ⚠ ONE MORE LAYER WAS BUILT AND THEN REMOVED, ON THE EVIDENCE. Driving how much each country's
 *  own residents travel from ST.INT.DPRT / IS.AIR.PSGR was implemented, measured against the COVID-19
 *  spread curve, and dropped — it moved the 100th-country day from 100 to 124 and the model's
 *  calibrated rate constant could not pull it back. The reasoning is beside `vol` and in
 *  js/pandemic-model.js's compression note; the point here is that this file ships only columns the
 *  model actually reads.
 *
 *  ⚠ A ZERO IN THE ROUTE TABLE IS NOT A ZERO IN THE WORLD. «No direct flight between these two
 *  countries in 2014» does not mean nobody travels between them — most long pairs are flown with
 *  a connection, and the route table cannot see an itinerary. This is exactly why the model BLENDS
 *  the route share with the distance kernel instead of replacing it (js/pandemic-model.js,
 *  ROUTE_MIX), and why this file must never be described as a passenger matrix.
 *
 *  ⚠ PRE-2020, DELIBERATELY. `mrnev=1` (most recent non-empty value) returns 2020 for 132 of the
 *  tourism rows — MEASURED. 2020 is the year international travel collapsed, so the «most recent»
 *  reading would quietly make the pandemic's own effect the simulator's baseline world. Every
 *  volume here is the latest year at or before PRE_COVID_YEAR, and each country's year is written
 *  into the output so a reader can see how old its figure is.
 *
 *  THE NUMBERS
 *    pairs[A][B] = how many distinct airline routes flew from an airport in A to one in B (2014)
 *    vol[X]      = { arr, arrY }   arrivals from abroad per year, and the year that was observed
 *
 *  ⚠ KEYED BY ISO3, like data/airports.json and data/country-facts.json. OpenFlights identifies
 *  airports by IATA/ICAO, so the country comes from OurAirports' `iso_country` (ISO2) and then
 *  from mledoze/countries' cca2 → cca3 — the SAME two hops data/airports.json already takes, so a
 *  code that resolves there resolves here. Anything that fails to resolve is REPORTED in the
 *  output, never dropped in silence.
 *
 *  USAGE
 *    node scripts/build-mobility.mjs            fetch, derive, write data/mobility.json
 *    node scripts/build-mobility.mjs --check    fetch, derive, compare with the committed file
 *
 *  ⚠ NOT IN `npm test`. It needs the network, like build-airports.mjs and build-country-facts.mjs.
 *  The committed file is validated OFFLINE by tests/r678-pandemic-p1-checks.test.mjs, which also
 *  RUNS the model to check the routes actually reach the outbreak.
 *
 *  SOURCES
 *    · OpenFlights route database (ODbL 1.0, snapshot June 2014, no longer updated) —
 *      https://github.com/jpatokal/openflights  ·  routes.dat
 *    · OurAirports (public domain) — https://davidmegginson.github.io/ourairports-data/airports.csv
 *      `ident`, `iata_code`, `iso_country` only; the IATA/ICAO → country hop.
 *    · World Bank World Development Indicators (CC BY 4.0) — https://api.worldbank.org/v2/
 *      ST.INT.ARVL (international arrivals). See the note beside `vol` below for the two other
 *      columns that were pulled, measured, and deliberately NOT shipped.
 *    · mledoze/countries (ODbL 1.0) — cca2 → cca3 only.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'mobility.json');

const ROUTES = 'https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat';
const AIRPORTS = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const MLEDOZE = 'https://cdn.jsdelivr.net/gh/mledoze/countries@master/countries.json';
const WB = 'https://api.worldbank.org/v2/country/all/indicator/';

/* the same one alias data/country-facts.json and data/airports.json declare */
const ALIAS = { UNK: 'KOS' };

/* The last year before international travel collapsed. 2020's arrivals are a measurement of the
   pandemic, not of the world a pandemic would start in. Expires if a reader ever wants the
   simulator's baseline to be «the world as it is now» rather than «the world before a pandemic». */
const PRE_COVID_YEAR = 2019;

/* How far back a volume may come from before it is dropped as too old to describe today's travel.
   Ten years reaches back to 2010 from PRE_COVID_YEAR, which keeps every country the World Bank has
   ever reported and drops none — MEASURED (the oldest surviving year is 2010, one country). It is
   a guard against a future upstream regression, not a filter that currently removes anything. */
const VOLUME_MAX_AGE = 10;

/* A minimal RFC-4180 reader — the same failure build-airports.mjs avoids: OurAirports quotes names
   containing commas, and a split(',') loses thousands of rows without anybody noticing. */
function csvRows(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function getText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/* One World Bank indicator, as { ISO3: [value, year] }, taking the latest year ≤ PRE_COVID_YEAR.
   ⚠ NOT `mrnev=1`: see the PRE_COVID_YEAR note above. The whole series is requested and filtered
   here, because «most recent» and «most recent before the collapse» are different questions. */
async function wbSeries(code) {
  const url = `${WB}${code}?format=json&per_page=25000&date=${PRE_COVID_YEAR - VOLUME_MAX_AGE}:${PRE_COVID_YEAR}`;
  const j = await getJson(url);
  if (!Array.isArray(j) || !j[1]) throw new Error(`World Bank ${code}: no data page — ${JSON.stringify(j).slice(0, 200)}`);
  const best = Object.create(null);
  for (const row of j[1]) {
    const iso = row && row.countryiso3code;
    if (!iso || iso.length !== 3 || row.value == null) continue;
    const y = Number(row.date);
    if (!Number.isFinite(y)) continue;
    const cur = best[iso];
    if (!cur || y > cur[1]) best[iso] = [Number(row.value), y];
  }
  if (Object.keys(best).length < 100) throw new Error(`World Bank ${code}: only ${Object.keys(best).length} countries — upstream shape changed`);
  return best;
}

async function build() {
  /* ── ISO2 → ISO3, the same hop data/airports.json takes ─────────────────────────────────── */
  const mledoze = await getJson(MLEDOZE);
  const iso2to3 = Object.create(null);
  for (const c of mledoze) {
    if (!c || !c.cca2 || !c.cca3) continue;
    iso2to3[String(c.cca2).toUpperCase()] = ALIAS[c.cca3] || c.cca3;
  }
  if (Object.keys(iso2to3).length < 200) throw new Error('mledoze/countries: fewer than 200 cca2→cca3 pairs — upstream shape changed');

  /* ── airport code → ISO3, from OurAirports ──────────────────────────────────────────────── */
  const rows = csvRows(await getText(AIRPORTS));
  const head = rows[0] || [];
  const cIdent = head.indexOf('ident'), cIata = head.indexOf('iata_code'), cIso = head.indexOf('iso_country');
  if (cIdent < 0 || cIata < 0 || cIso < 0) throw new Error(`OurAirports: expected columns ident/iata_code/iso_country, got ${head.join(',')}`);
  const apIso3 = Object.create(null);
  let apRows = 0;
  for (let r = 1; r < rows.length; r++) {
    const f = rows[r];
    if (!f || f.length <= cIso) continue;
    const iso3 = iso2to3[String(f[cIso] || '').toUpperCase()];
    if (!iso3) continue;
    apRows++;
    const icao = String(f[cIdent] || '').trim().toUpperCase();
    const iata = String(f[cIata] || '').trim().toUpperCase();
    if (icao) apIso3[icao] = iso3;
    if (iata) apIso3[iata] = iso3;
  }
  if (apRows < 50000) throw new Error(`OurAirports: only ${apRows} rows resolved to a country — upstream shape changed`);

  /* ── OpenFlights routes → directed country-pair counts ──────────────────────────────────── */
  const routesText = await getText(ROUTES);
  const pairs = Object.create(null);
  let routeRows = 0, resolved = 0, domestic = 0;
  const unresolvedCodes = new Set();
  for (const line of routesText.split('\n')) {
    if (!line.trim()) continue;
    /* routes.dat is unquoted: airline,airlineId,src,srcId,dst,dstId,codeshare,stops,equipment */
    const f = line.split(',');
    if (f.length < 9) continue;
    routeRows++;
    const a = apIso3[String(f[2] || '').trim().toUpperCase()];
    const b = apIso3[String(f[4] || '').trim().toUpperCase()];
    if (!a) unresolvedCodes.add(String(f[2] || '').trim().toUpperCase());
    if (!b) unresolvedCodes.add(String(f[4] || '').trim().toUpperCase());
    if (!a || !b) continue;
    resolved++;
    /* ⚠ DOMESTIC ROUTES ARE DROPPED. This table exists to weight a destination ABROAD; the model
       never asks it where inside a country an outbreak goes. Counting them would also make a large
       country's row overwhelmingly about itself. */
    if (a === b) { domestic++; continue; }
    (pairs[a] || (pairs[a] = Object.create(null)))[b] = (pairs[a][b] || 0) + 1;
  }
  if (routeRows < 60000) throw new Error(`OpenFlights routes.dat: only ${routeRows} rows — upstream shape changed`);
  if (resolved / routeRows < 0.95) throw new Error(`OpenFlights routes.dat: only ${(resolved / routeRows * 100).toFixed(1)}% of routes resolved to a country pair`);

  const origins = Object.keys(pairs).sort();
  let pairCount = 0, routeTotal = 0;
  const reached = new Set(origins);
  for (const a of origins) for (const b of Object.keys(pairs[a])) { pairCount++; routeTotal += pairs[a][b]; reached.add(b); }

  /* sorted, so the committed file has a stable byte order across rebuilds */
  const pairsOut = Object.create(null);
  for (const a of origins) {
    const inner = Object.create(null);
    for (const b of Object.keys(pairs[a]).sort()) inner[b] = pairs[a][b];
    pairsOut[a] = inner;
  }

  /* ── World Bank observed volumes ────────────────────────────────────────────────────────── */
  const arr = await wbSeries('ST.INT.ARVL');
  const vol = Object.create(null);
  /* ⚠ ARRIVALS ONLY, AND THAT IS A DECISION THIS ROUND MEASURED RATHER THAN AN OVERSIGHT.
     IS.AIR.PSGR (boardings) and ST.INT.DPRT (departures by residents) were pulled, wired into the
     model's `travel[i]` — how much a country's own residents travel — and MEASURED: they moved the
     median day the 50th and 100th country is reached to 92 and 124, against 81 and 100 before and
     an observed COVID-19 curve of 80 and 95, and the calibrated rate constant could not pull them
     back because what they change is the SHAPE of the reachable set. 53% of countries also landed
     on one of the model's two clamps, which were chosen for a compressed proxy ratio while the
     observed ratio spans 0.000 (Benin — a reporting gap, not a fact) to 20.1 (Qatar).
     Making that column usable needs the clamp's meaning rethought and the emission rate
     re-calibrated. Until then it would be shipped and unused, so it is not shipped. See
     DEV-NOTES.md #R678. */
  for (const iso of Object.keys(arr).sort()) {
    vol[iso] = { arr: Math.round(arr[iso][0]), arrY: arr[iso][1] };
  }

  const out = {
    '//': 'Where people fly between countries, and how many of them travel. NOT a passenger matrix: '
      + 'the pair counts are DISTINCT AIRLINE ROUTES from the OpenFlights snapshot of JUNE 2014, which is '
      + 'no longer updated and carries no frequency, seat or passenger figures; the per-country volumes are '
      + 'real observed World Bank counts from the latest year at or before ' + PRE_COVID_YEAR + '. '
      + 'A zero here means «no direct flight in the 2014 table», not «nobody travels». '
      + 'Built by scripts/build-mobility.mjs. See Architecture.md §8.5.',
    built: new Date().toISOString().slice(0, 10),
    sources: [
      'OpenFlights route database (ODbL 1.0) — snapshot June 2014, no longer updated',
      'OurAirports (public domain) — airport code to country',
      'World Bank World Development Indicators (CC BY 4.0) — ST.INT.ARVL',
      'mledoze/countries (ODbL 1.0) — cca2 to cca3'
    ],
    routesSnapshot: '2014-06',
    preCovidYear: PRE_COVID_YEAR,
    routeRows,
    routesResolved: resolved,
    routesDomestic: domestic,
    countryPairs: pairCount,
    routesInternational: routeTotal,
    countriesWithRoutes: origins.length,
    countriesReachable: reached.size,
    countriesWithVolume: Object.keys(vol).length,
    unresolvedAirportCodes: [...unresolvedCodes].filter(Boolean).sort().slice(0, 40),
    pairs: pairsOut,
    vol
  };
  return out;
}

/* `built` is a timestamp, not a fact about the world — a rebuild on a different day must not read
   as a change. The same comparison build-airports.mjs and build-country-facts.mjs make. */
function comparable(o) { const c = JSON.parse(JSON.stringify(o)); delete c.built; return JSON.stringify(c); }

const check = process.argv.includes('--check');
const data = await build();
const text = JSON.stringify(data, null, 1) + '\n';

if (check) {
  if (!fs.existsSync(OUT)) { console.error(`✗ ${path.relative(ROOT, OUT)} does not exist — run without --check`); process.exit(1); }
  const have = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  if (comparable(have) !== comparable(data)) {
    console.error(`✗ ${path.relative(ROOT, OUT)} differs from what the upstreams say today.`);
    console.error(`  committed: ${have.countryPairs} pairs / ${have.countriesWithVolume} countries with volume`);
    console.error(`  upstream:  ${data.countryPairs} pairs / ${data.countriesWithVolume} countries with volume`);
    console.error(`  → node scripts/build-mobility.mjs`);
    process.exit(1);
  }
  console.log(`✓ ${path.relative(ROOT, OUT)} matches upstream (${data.countryPairs} country pairs, ${data.countriesWithVolume} countries with observed volume)`);
} else {
  fs.writeFileSync(OUT, text);
  console.log(`✓ ${path.relative(ROOT, OUT)}  ${(text.length / 1024).toFixed(1)} kB`);
  console.log(`  routes      ${data.routesResolved}/${data.routeRows} resolved · ${data.routesDomestic} domestic dropped · ${data.routesInternational} international`);
  console.log(`  pairs       ${data.countryPairs} directed · ${data.countriesWithRoutes} origins · ${data.countriesReachable} countries appear`);
  console.log(`  volumes     ${data.countriesWithVolume} countries (latest year ≤ ${PRE_COVID_YEAR})`);
  if (data.unresolvedAirportCodes.length) console.log(`  ⚠ unresolved airport codes (first 40): ${data.unresolvedAirportCodes.join(' ')}`);
}
