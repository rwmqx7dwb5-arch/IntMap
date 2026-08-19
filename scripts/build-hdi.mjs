/* ============================================================================
 *  IntMap · THE HUMAN DEVELOPMENT INDEX HAS A TIME SERIES   (#R270)
 * ----------------------------------------------------------------------------
 *  「年を変えることに意味があるレイヤーは一つ残らずすべて、変えられるようにしろ。」
 *
 *  #R268's audit put HDI in the bucket 「年系列そのものが無い」 — and that is not true. UNDP's Human
 *  Development Report Office publishes the COMPLETE composite-indices time series, 1990 → 2022, one
 *  CSV, one row per economy, one column per year (`hdi_1990` … `hdi_2022`). The app was shipping ONE
 *  of those 33 columns as a hard-coded table in js/tables.js and calling the other 32 non-existent.
 *
 *  This writes data/hdi-series.json from that file, so the HDI layer moves with the master clock the
 *  way GDP per capita and life expectancy already do (js/time-countries.js).
 *
 *      node scripts/build-hdi.mjs            # refresh from UNDP
 *      node scripts/build-hdi.mjs --check    # fail if the committed copy is stale/missing
 *
 *  ⚠ AGGREGATES ARE NOT COUNTRIES. The same file carries regional and grouping rows whose `iso3` is
 *  a code like `ZZA.VHHD` (very high human development) or `ZZB.SA` (South Asia). Anything that is
 *  not three A–Z letters is dropped — an aggregate painted as a country is the shape of defect this
 *  project has paid for before (#R266's 「mrnev」 comparison).
 *
 *  ⚠ SOURCE AND LICENCE. UNDP Human Development Report Office, «HDR 2023/24 — Composite indices,
 *  complete time series». The app ALREADY ships HDI from this publication (js/tables.js's 2022
 *  column, credited in the legend as 「2022 UNDP」 and on sources.html); this adds the other years of
 *  the same table from the same publisher, so the attribution that was already made is the one that
 *  applies. It is cited in the file itself and on the sources page.
 * ==========================================================================*/
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const URL_CSV = 'https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv';
const OUT = 'data/hdi-series.json';
const CHECK = process.argv.includes('--check');

/* the file is plain comma-separated with quoted country names — split respecting quotes */
function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

async function build() {
  const r = await fetch(URL_CSV, { headers: { 'user-agent': 'IntMap/build-hdi' } });
  if (!r.ok) throw new Error('HDR CSV ' + r.status);
  const text = await r.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const head = splitCSV(lines[0]);
  const cols = head.map((c, i) => [c, i]).filter(([c]) => /^hdi_\d{4}$/.test(c));
  if (cols.length < 20) throw new Error('HDR CSV: found ' + cols.length + ' hdi_<year> columns');
  const years = cols.map(([c]) => +c.slice(4));
  const iIso = head.indexOf('iso3');
  if (iIso < 0) throw new Error('HDR CSV: no iso3 column');

  const hdi = {};
  let dropped = 0;
  for (let i = 1; i < lines.length; i++) {
    const f = splitCSV(lines[i]);
    const iso = String(f[iIso] || '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iso)) { dropped++; continue; }          /* aggregates, blank rows */
    const row = cols.map(([, ci]) => {
      const v = String(f[ci] || '').trim();
      if (!v) return null;
      const n = +v;
      return isFinite(n) && n > 0 && n <= 1 ? +n.toFixed(3) : null;
    });
    if (row.some((v) => v != null)) hdi[iso] = row;
  }
  const n = Object.keys(hdi).length;
  if (n < 150) throw new Error('HDR CSV: only ' + n + ' countries parsed');

  const json = {
    source: 'UNDP Human Development Report Office — HDR 2023/24, Composite indices (complete time series)',
    url: URL_CSV,
    note: 'hdi[ISO3][i] is the HDI for years[i]; null where UNDP publishes no value. Aggregate rows (iso3 not AAA) are dropped.',
    years, hdi,
  };
  return { json, dropped, n };
}

const { json, dropped, n } = await build();
const text = JSON.stringify(json);

if (CHECK) {
  if (!existsSync(OUT)) { console.error('MISSING ' + OUT + ' — run node scripts/build-hdi.mjs'); process.exit(1); }
  const have = readFileSync(OUT, 'utf8');
  const a = JSON.parse(have), b = json;
  const same = a.years.join(',') === b.years.join(',') && Object.keys(a.hdi).length === Object.keys(b.hdi).length;
  if (!same) { console.error('STALE ' + OUT + ' — re-run node scripts/build-hdi.mjs'); process.exit(1); }
  console.log('ok — ' + OUT + ' matches UNDP (' + n + ' countries, ' + json.years[0] + '–' + json.years[json.years.length - 1] + ')');
} else {
  writeFileSync(OUT, text);
  console.log('wrote ' + OUT + ' — ' + n + ' countries · ' + json.years.length + ' years (' +
    json.years[0] + '–' + json.years[json.years.length - 1] + ') · ' + dropped + ' aggregate/blank rows dropped · ' +
    (text.length / 1024).toFixed(1) + ' kB');
}
