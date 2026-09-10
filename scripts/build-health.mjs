#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WHAT EACH COUNTRY CAN ACTUALLY DO ABOUT AN EPIDEMIC  (#R678)
 * ----------------------------------------------------------------------------
 *  js/pandemic-model.js has kept FOUR capacities apart since #R666 — medical capacity (`health`),
 *  travel connectivity (`connectivity`), policy response (`response`) and vaccine delivery
 *  (`delivery`) — and said so in a comment, because they are different things and a model that
 *  spells them as one number can never be improved without touching every formula that used it.
 *
 *  All four were nevertheless the SAME NUMBER: GDP per head ÷ 55 000, or HDI, or 0.5. That was
 *  honest and it was written down, but it is a proxy standing in four places, and a reader who
 *  moves the world's response is entitled to have moved something that was observed.
 *
 *  This file observes three of them. MEASURED, 2026-09-10, choosing per field the indicator that
 *  is about the thing the field actually drives in the model — not the one that is easiest to get:
 *
 *  ┌ field      ┌ what it drives in js/pandemic-model.js ────────── ┌ indicator ─────────────────┐
 *  │ health     │ hospital overload multiplier and baseline case    │ WHO UHC service coverage    │
 *  │            │ fatality (`overload`, `ifrEff`)                   │ index, SDG 3.8.1 — 195      │
 *  │ response   │ how fast a government tightens its border, and    │ WHO IHR SPAR C07 «Health    │
 *  │            │ whether it can run a vaccine programme at all     │ emergency management» — 194 │
 *  │ delivery   │ the share of the susceptible reached per day once │ World Bank / WUENIC DTP3    │
 *  │            │ a vaccine exists (`vaxRate · delivery`)           │ coverage — 236              │
 *  └────────────┴──────────────────────────────────────────────────┴─────────────────────────────┘
 *
 *  ⚠ DTP3 IS THE RIGHT QUESTION FOR `delivery`, AND IT IS NOT A GUESS. «What share of this
 *  country's one-year-olds actually received three doses of a vaccine that already exists, was
 *  already paid for and is already scheduled» is exactly the capability `delivery` models — the
 *  last mile, not the money. It is why a high-income country with a weak routine programme and a
 *  low-income country with a strong one come out the right way round here and did not under GDP.
 *
 *  ⚠ `connectivity` IS NOT HERE, and it is still the GDP proxy. It belongs to travel, and travel
 *  is data/mobility.json — a different upstream, refreshed on a different cadence, answering a
 *  different question. That file's own header records which of its columns were measured and NOT
 *  shipped, and why.
 *
 *  MCV1, SEPARATELY, IS NOT A CAPACITY — IT IS AN INITIAL CONDITION.
 *  The measles preset's `baselineImmunity` was 0.84 applied to every country and every age: the
 *  WORLD's first-dose measles coverage, used as if it were each country's. Measles is the one
 *  disease in the preset list whose real-world immunity IS a measured vaccination coverage, so it
 *  is the one where a per-country figure is available rather than assumed. `mcv1` is that figure.
 *  ⚠ It is still childhood coverage read as whole-population immunity — the model has no age
 *  structure — and the simulator must go on saying so. What changes is that South Sudan and
 *  Portugal stop starting a measles outbreak from the same place, which is the entire point of
 *  running measles on a world map.
 *
 *  ⚠⚠ THERE IS NO PER-COUNTRY OBSERVATION OF COVID-19 IMMUNITY, AND THIS FILE DOES NOT INVENT ONE.
 *  Hybrid immunity after 2020 is not a vaccination coverage; no source publishes «share of country
 *  X's population currently protected against infection». The covid preset's 0.9 therefore stays a
 *  stated global assumption (Architecture.md §8.5 already says so). Building a per-country column
 *  out of dose counts would look like the measles column and would not be an observation.
 *
 *  USAGE
 *    node scripts/build-health.mjs            fetch, derive, write data/health.json
 *    node scripts/build-health.mjs --check    fetch, derive, compare with the committed file
 *
 *  ⚠ NOT IN `npm test`. It needs the network. The committed file is validated OFFLINE by
 *  tests/r678-pandemic-p1-checks.test.mjs.
 *
 *  SOURCES
 *    · WHO Global Health Observatory (CC BY-NC-SA 3.0 IGO) — https://ghoapi.azureedge.net/api/
 *      UHC_INDEX_REPORTED (UHC service coverage index, SDG 3.8.1)
 *      IHRSPAR2_C07 (IHR State Party Self-Assessment, capacity 7: health emergency management)
 *    · World Bank World Development Indicators (CC BY 4.0) — https://api.worldbank.org/v2/
 *      SH.IMM.IDPT (DTP3), SH.IMM.MEAS (MCV1) — both WHO/UNICEF WUENIC estimates.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'data', 'health.json');

const GHO = 'https://ghoapi.azureedge.net/api/';
const WB = 'https://api.worldbank.org/v2/country/all/indicator/';

/* How far back a reading may come from before it is dropped. These four indicators are annual and
   currently land on 2023–2024 for every country that reports at all — MEASURED. The window exists
   so that an upstream that quietly stops publishing shows up as a missing country (which the model
   handles, by falling back to the development proxy for that country) rather than as a figure from
   a decade ago presented as today's capacity. */
const MAX_AGE_YEARS = 6;
const THIS_YEAR = new Date().getUTCFullYear();

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/* One WHO GHO indicator, as { ISO3: [value, year] } — the latest year per country.
   GHO returns every year of every dimension in one document; COUNTRY rows are the ones keyed by
   ISO3, and the aggregates (regions, income groups) are dropped by SpatialDimType. */
async function ghoSeries(code) {
  const j = await getJson(GHO + code);
  const rows = (j && j.value) || [];
  if (!rows.length) throw new Error(`WHO GHO ${code}: empty document — upstream shape changed`);
  const best = Object.create(null);
  for (const r of rows) {
    if (r.SpatialDimType !== 'COUNTRY') continue;
    const iso = r.SpatialDim, y = Number(r.TimeDim), v = r.NumericValue;
    if (!iso || iso.length !== 3 || v == null || !Number.isFinite(y)) continue;
    if (THIS_YEAR - y > MAX_AGE_YEARS) continue;
    const cur = best[iso];
    if (!cur || y > cur[1]) best[iso] = [v, y];
  }
  const n = Object.keys(best).length;
  if (n < 150) throw new Error(`WHO GHO ${code}: only ${n} countries within ${MAX_AGE_YEARS} years — upstream shape changed`);
  return best;
}

/* One World Bank indicator, as { ISO3: [value, year] } — the latest year per country. */
async function wbSeries(code) {
  const j = await getJson(`${WB}${code}?format=json&per_page=25000&date=${THIS_YEAR - MAX_AGE_YEARS}:${THIS_YEAR}`);
  if (!Array.isArray(j) || !j[1]) throw new Error(`World Bank ${code}: no data page — ${JSON.stringify(j).slice(0, 200)}`);
  const best = Object.create(null);
  for (const r of j[1]) {
    const iso = r && r.countryiso3code;
    if (!iso || iso.length !== 3 || r.value == null) continue;
    const y = Number(r.date);
    if (!Number.isFinite(y)) continue;
    const cur = best[iso];
    if (!cur || y > cur[1]) best[iso] = [Number(r.value), y];
  }
  const n = Object.keys(best).length;
  if (n < 150) throw new Error(`World Bank ${code}: only ${n} countries — upstream shape changed`);
  return best;
}

const [uhc, spar, dtp3, mcv1] = await Promise.all([
  ghoSeries('UHC_INDEX_REPORTED'),
  ghoSeries('IHRSPAR2_C07'),
  wbSeries('SH.IMM.IDPT'),
  wbSeries('SH.IMM.MEAS')
]);

const countries = Object.create(null);
const isoAll = [...new Set([...Object.keys(uhc), ...Object.keys(spar), ...Object.keys(dtp3), ...Object.keys(mcv1)])].sort();
for (const iso of isoAll) {
  const c = Object.create(null);
  /* Values keep the units their sources publish — index points and percent, both 0-100. The model
     turns them into its own 0-1 capacities, because how a coverage index becomes a fatality
     multiplier is modelling and belongs where the modelling is. */
  if (uhc[iso]) { c.uhc = Math.round(uhc[iso][0] * 10) / 10; c.uhcY = uhc[iso][1]; }
  if (spar[iso]) { c.spar = Math.round(spar[iso][0] * 10) / 10; c.sparY = spar[iso][1]; }
  if (dtp3[iso]) { c.dtp3 = Math.round(dtp3[iso][0] * 10) / 10; c.dtp3Y = dtp3[iso][1]; }
  if (mcv1[iso]) { c.mcv1 = Math.round(mcv1[iso][0] * 10) / 10; c.mcv1Y = mcv1[iso][1]; }
  if (Object.keys(c).length) countries[iso] = c;
}

const count = k => isoAll.filter(i => countries[i] && countries[i][k] != null).length;
const mean = k => { const v = isoAll.map(i => countries[i] && countries[i][k]).filter(x => x != null); return Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10; };

const data = {
  '//': 'Per-country epidemic capacity for the pandemic simulator. `uhc` is the WHO UHC service '
    + 'coverage index (SDG 3.8.1, 0-100). `spar` is IHR SPAR capacity 7, health emergency management '
    + '(0-100). `dtp3` and `mcv1` are WHO/UNICEF WUENIC immunisation coverage (percent of one-year-olds). '
    + '⚠ `mcv1` is CHILDHOOD coverage used as a whole-population measles immunity, because the model has '
    + 'no age structure — the simulator says so on screen. There is NO per-country observation of '
    + 'COVID-19 immunity and none is invented here. Built by scripts/build-health.mjs. See Architecture.md §8.5.',
  built: new Date().toISOString().slice(0, 10),
  sources: [
    'WHO Global Health Observatory (CC BY-NC-SA 3.0 IGO) — UHC service coverage index (SDG 3.8.1)',
    'WHO Global Health Observatory (CC BY-NC-SA 3.0 IGO) — IHR SPAR capacity 7, health emergency management',
    'World Bank World Development Indicators (CC BY 4.0) — SH.IMM.IDPT and SH.IMM.MEAS (WHO/UNICEF WUENIC)'
  ],
  fields: {
    uhc: 'WHO UHC service coverage index (SDG 3.8.1), 0-100 — drives medical capacity',
    spar: 'WHO IHR SPAR capacity 7, health emergency management, 0-100 — drives policy response',
    dtp3: 'DTP3 immunisation coverage, % of one-year-olds — drives vaccine delivery',
    mcv1: 'First-dose measles immunisation coverage, % of one-year-olds — the measles preset\'s initial immunity'
  },
  counts: { uhc: count('uhc'), spar: count('spar'), dtp3: count('dtp3'), mcv1: count('mcv1'), any: isoAll.length },
  means: { uhc: mean('uhc'), spar: mean('spar'), dtp3: mean('dtp3'), mcv1: mean('mcv1') },
  countries
};

function comparable(o) { const c = JSON.parse(JSON.stringify(o)); delete c.built; return JSON.stringify(c); }

const text = JSON.stringify(data, null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(OUT)) { console.error(`✗ ${path.relative(ROOT, OUT)} does not exist — run without --check`); process.exit(1); }
  const have = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  if (comparable(have) !== comparable(data)) {
    console.error(`✗ ${path.relative(ROOT, OUT)} differs from what the upstreams say today.`);
    console.error(`  committed: ${JSON.stringify(have.counts)}`);
    console.error(`  upstream:  ${JSON.stringify(data.counts)}`);
    console.error(`  → node scripts/build-health.mjs`);
    process.exit(1);
  }
  console.log(`✓ ${path.relative(ROOT, OUT)} matches upstream (${JSON.stringify(data.counts)})`);
} else {
  fs.writeFileSync(OUT, text);
  console.log(`✓ ${path.relative(ROOT, OUT)}  ${(text.length / 1024).toFixed(1)} kB`);
  console.log(`  counts ${JSON.stringify(data.counts)}`);
  console.log(`  means  ${JSON.stringify(data.means)}`);
}
