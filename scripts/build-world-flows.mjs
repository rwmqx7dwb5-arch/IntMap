#!/usr/bin/env node
/* ============================================================================
 *  IntMap · WORLD FLOWS — where the people born in one country live   (wave4-mobility)
 * ----------------------------------------------------------------------------
 *  IntMap shows where aircraft and ships ARE (the aviation feed, the AIS snapshot) and where cables and railways RUN.
 *  It could not answer the question a reader asks of a country once the dots are on the map: who is it connected to,
 *  how strongly, and how has that changed? The card js/world-flows.js answers it for people, goods, data and flights,
 *  and this file builds the one record of those no bundle in the repository carried:
 *
 *    PEOPLE — the UN DESA Population Division's International Migrant Stock 2024: how many people born in country A
 *    live in country B, at mid-year 1990, 1995, …, 2020 and 2024 (Table 1, both sexes). A STOCK, not a flow per year:
 *    «so many people born in Mexico live in the United States at mid-2024» is what a number says — not how many moved
 *    that year — and the card says so.
 *
 *  The other three are NOT rebuilt here — each is read where it already lives (one fact, one owner): goods from the
 *  Trade flows layer (js/world-packs.js, CEPII BACI through OEC — the card opens that layer on the country rather than
 *  drawing trade a second way), data cables from data/subcables-meta.json (the submarine cable record the map draws) and
 *  flights from data/mobility.json (OpenFlights' 2014 route table, the pandemic simulator's).
 *
 *  ⚠ WHAT A COUNTRY IS. DESA identifies countries and areas by UN M49 number. The anchor an arc is drawn to and the
 *  names the card writes are Natural Earth's (data/ne-countries, public domain — the shapes the map already draws):
 *  LABEL_X/LABEL_Y, NAME_EN, NAME_JA, ISO_A2_EH, joined on ISO_N3_EH (= M49 for countries). Where a number is shared by
 *  a country and its dependencies (France and Clipperton, Australia and its external territories) the feature whose
 *  ADM0_A3 equals its ISO_A3_EH is the country — derived from the record, not listed. Every Natural Earth country is a
 *  place of the table (so the cable record's alpha-2 and the route table's alpha-3 resolve to the same rows).
 *  ⚠ A NUMBER NATURAL EARTH DOES NOT HAVE IS KEPT, NOT DROPPED. «Channel Islands» (830), Réunion (638), Mayotte (175) …
 *  carry real people; they stay in the table and in every total under DESA's own name, keyed `N:<M49>`, with NO anchor
 *  (`x: null`), and the card counts them as «not on the map». The build prints every one.
 *  ⚠ A MISSING VALUE IS NOT A ZERO. DESA writes «..» or leaves a cell empty where it has no estimate; that is `null` here
 *  and «no estimate» on screen, never 0.
 *
 *  OUTPUT — data/world-flows.json: { gov, v, places:[{c, a2, en, ja, x, y}], migration: { years, unit, rows:[[dest, origin,
 *  v1990 … v2024]], totalIn, totalOut, unplaced } } — `totalIn` / `totalOut` are the totals DESA states for each place
 *  (every origin / destination, «other» and «unknown» included), keyed by place index.
 *
 *  USAGE
 *    node scripts/build-world-flows.mjs                     download the workbook, derive, write
 *    node scripts/build-world-flows.mjs --ims <file.xlsx>   the same from a local copy
 *    node scripts/build-world-flows.mjs --check [--ims …]   derive and compare with the committed file (exit 1 on a difference)
 *  ⚠ NOT IN `npm test` — it needs the network (the workbook is 6.0 MB, measured 2026-10-13). tests/wave4-mobility-checks.test.mjs
 *  validates the committed file offline.
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { measureQuality } from '../js/data-governance.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT = 'data/world-flows.json';
const IMS_URL = 'https://www.un.org/development/desa/pd/sites/www.un.org.development.desa.pd/files/undesa_pd_2024_ims_stock_by_sex_destination_and_origin.xlsx';
const NE_FILE = join(ROOT, 'data', 'ne-countries', 'ne_10m_admin_0_countries.json.gz');

/* ⚠ 出自は値である（js/data-governance.js の read() と npm run check:datagov が読む）。上流が述べることだけを書く。 */
export const GOVERNANCE = {
  'data/world-flows.json': {
    upstreams: [
      { publisher: 'United Nations, Department of Economic and Social Affairs, Population Division', url: IMS_URL,
        licence: 'CC BY 3.0 IGO', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/igo/', attribution: true, creditRequired: true,
        asOf: '2024-07-01', fields: 'Table 1 — international migrant stock at mid-year, both sexes, by destination and origin, 1990–2024',
        paidBy: 'UN DESA Population Division — International Migrant Stock 2024 (CC BY 3.0 IGO)' },
      { publisher: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'public domain', attribution: false,
        fields: 'ISO_N3_EH, ISO_A3_EH, ISO_A2_EH, ADM0_A3, NAME_EN, NAME_JA, LABEL_X, LABEL_Y — read from data/ne-countries (the shapes the map draws)' },
    ],
    /* the instant the newest stock describes (DESA: «at mid-year»), and the row that pays the one credit the file owes (Natural
       Earth requires none) */
    asOf: '2024-07-01',
    paidBy: 'UN DESA Population Division — International Migrant Stock 2024 (CC BY 3.0 IGO)',
    /* the shortest cadence among the upstreams whose material the bundle carries: Natural Earth's (P1Y) is shorter than
       DESA's editions, so the bundle is due for a look yearly — when DESA has published nothing new, a rebuild is a no-op */
    cadence: 'P1Y',
    cadenceBasis: {
      observed: 'read 2026-10-13 on un.org/development/desa/pd/content/international-migrant-stock: editions 2015, 2017, 2019, 2020 and 2024 (one every one to four years); Natural Earth: scripts/lib/upstream-cadence.mjs NATURAL_EARTH (at most one release a year)',
      expires: 'if DESA starts publishing migrant stock more than once a year',
      canon: 'scripts/build-world-flows.mjs GOVERNANCE',
    },
    schema: 'scripts/build-world-flows.mjs (places · migration) — read by js/world-flows-core.js; tests/wave4-mobility-checks.test.mjs',
    builtBy: 'scripts/build-world-flows.mjs',
  },
};

/* ══ THE PLACES — Natural Earth's countries, as the map draws them ═══════════════════════════════════════════ */
export function neCountries(file = NE_FILE) {
  const d = JSON.parse(gunzipSync(readFileSync(file)));
  const props = (d.features || []).map((f) => f.p || f.properties || {});
  const byN3 = new Map(), byA3 = new Map();
  for (const p of props) {
    const a3 = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
    const n3 = p.ISO_N3_EH && p.ISO_N3_EH !== '-99' ? +p.ISO_N3_EH : null;
    /* a code shared by a country and its dependencies: the feature that IS the country (ADM0_A3 === ISO_A3_EH) */
    const home = p.ADM0_A3 === a3;
    const a2 = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : null;
    const rec = { c: a3, a2, en: p.NAME_EN || p.NAME || p.ADMIN, ja: p.NAME_JA || null, x: +(+p.LABEL_X).toFixed(3), y: +(+p.LABEL_Y).toFixed(3) };
    if (n3 != null && (!byN3.has(n3) || home)) byN3.set(n3, rec);
    if (!byA3.has(a3) || home) byA3.set(a3, rec);
    if (!byA3.has(p.ADM0_A3)) byA3.set(p.ADM0_A3, rec);
  }
  /* every country once — the record its own code names — in code order (the order the place table starts with) */
  const all = [...new Set(byA3.values())].sort((a, b) => (a.c < b.c ? -1 : a.c > b.c ? 1 : 0));
  return { byN3, byA3, all };
}

/** the place table the bundle ships: every Natural Earth country first (so the flows read from other bundles — cables by
    ISO alpha-2, flights by alpha-3 — resolve to the same rows), then each upstream code Natural Earth does not have, in the
    order met. A row's index is what every pair refers to. */
export function placeTable(ne) {
  const rows = [], at = new Map();
  const put = (key, rec) => {
    if (at.has(key)) return at.get(key);
    at.set(key, rows.length); rows.push(rec); return rows.length - 1;
  };
  for (const r of (ne && ne.all) || []) put(r.c, r);
  return { rows, put };
}

/* ══ PEOPLE — UN DESA International Migrant Stock 2024, Table 1 ═══════════════════════════════════════════════ */
/** M49 codes of countries and areas are < 900; 900 is WORLD and every larger code a region or group DESA aggregates */
const WORLD = 900;
const isArea = (code) => Number.isInteger(code) && code > 0 && code < WORLD;
/* DESA marks a name with a trailing «*» to point at a footnote (the sheet's «Migrant notes»); the mark is not the name */
const clean = (name) => String(name || '').trim().replace(/\*+$/, '').trim();
const cell = (v) => (v == null || v === '' || v === '..' || v === '-' || !isFinite(+v) ? null : Math.round(+v));
/* the «Migrant notes» sheet carries some names as UTF-8 bytes read as Latin-1 («RÃ©union»); a cell that decodes cleanly as
   UTF-8 from those bytes is put back, one that does not is kept exactly as written */
const mended = (t) => {
  const x = String(t);
  if (!/[ÃÂ][\u0080-\u00bf]/.test(x)) return x;
  const y = Buffer.from(x, 'latin1').toString('utf8');
  return y.includes('\ufffd') ? x : y;
};
/** DESA's numbered notes («Migrant notes»): number → the sentence, as written */
function readNotes(wb, X) {
  const ws = wb.Sheets['Migrant notes'];
  const out = {};
  if (!ws) return out;
  for (const r of X.utils.sheet_to_json(ws, { header: 1, defval: null })) {
    const v = (r || []).filter((c) => c != null && c !== '');
    if (v.length >= 2 && Number.isInteger(v[0]) && typeof v[1] === 'string') out[v[0]] = mended(v[1]).replace(/\s+/g, ' ').trim();
  }
  return out;
}
export function readMigration(xlsxBuf, ne, T) {
  const require = createRequire(import.meta.url);
  const X = require('xlsx');
  const wb = X.read(xlsxBuf, { type: 'buffer' });
  const ws = wb.Sheets['Table 1'];
  if (!ws) throw new Error('IMS 2024: no «Table 1» sheet');
  const rows = X.utils.sheet_to_json(ws, { header: 1, defval: null });
  const hi = rows.findIndex((r) => r && r.includes('Location code of destination') && r.includes('Location code of origin'));
  if (hi < 0) throw new Error('IMS 2024: the header row of Table 1 was not found');
  const H = rows[hi];
  const cDest = H.indexOf('Location code of destination'), cOrig = H.indexOf('Location code of origin');
  /* per destination: the note it points at and the type of data its estimates were derived from (B / C / R / I — the codes
     the notes sheet defines; I = no data, imputed) */
  const cCov = H.indexOf('Coverage'), cType = H.indexOf('Data type');
  const nDest = H.findIndex((h) => /area of destination/i.test(String(h))), nOrig = H.findIndex((h) => /area of origin/i.test(String(h)));
  /* the first run of year columns is «both sexes combined» (the sheet's own band above the header says so) */
  const firstYear = H.findIndex((h, i) => i > cOrig && Number.isInteger(h));
  const years = [];
  for (let i = firstYear; Number.isInteger(H[i]) && (!years.length || H[i] > years[years.length - 1]); i++) years.push(H[i]);
  const unplaced = new Map(), pairs = [], inTot = new Map(), outTot = new Map(), basis = new Map();
  const idx = (code, name) => {
    const r = ne.byN3.get(code);
    if (r) return T.put(r.c, r);
    unplaced.set(code, clean(name));
    return T.put('N:' + code, { c: 'N:' + code, a2: null, en: clean(name), ja: null, x: null, y: null });
  };
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue;
    const d = +row[cDest], o = +row[cOrig];
    if (!Number.isInteger(d) || !Number.isInteger(o)) continue;
    const vals = years.map((_, k) => cell(row[firstYear + k]));
    if (isArea(d) && o === WORLD) {
      const i = idx(d, row[nDest]);
      inTot.set(i, vals);
      const n = cCov >= 0 && Number.isInteger(row[cCov]) ? row[cCov] : null, t = cType >= 0 && row[cType] ? String(row[cType]).trim().split(/\s+/) : [];
      if (n != null || t.length) basis.set(i, { note: n, type: t });
      continue;
    }
    if (d === WORLD && isArea(o)) { outTot.set(idx(o, row[nOrig]), vals); continue; }
    if (!isArea(d) || !isArea(o)) continue;
    if (vals.every((v) => v == null || v === 0)) continue;   /* a pair DESA estimates at nothing in every year carries no fact to draw */
    pairs.push([idx(d, row[nDest]), idx(o, row[nOrig]), ...vals]);
  }
  return { years, pairs, inTot, outTot, unplaced, basis, notes: readNotes(wb, X) };
}

/** the quality facets, measured over the pairs with the vocabulary's own measurer: a pair is one (destination, origin); a stock
    is a count, so below 0 is out of range; an empty DESA cell is counted as missing (it is null in the file, never 0) */
export function measurePairs(years, pairs) {
  const fields = { dest: {}, origin: {} };
  for (const y of years) fields['v' + y] = { min: 0 };
  const rows = pairs.map((r) => { const o = { dest: r[0], origin: r[1] }; years.forEach((y, k) => { o['v' + y] = r[2 + k]; }); return o; });
  return measureQuality(rows, { fields, key: ['dest', 'origin'] });
}

/** build(xlsxBuffer, generatedAt) → the bundle, as an object (the build and --check both call it) */
export function build(ims, generatedAt, neFile = NE_FILE) {
  const ne = neCountries(neFile);
  const T = placeTable(ne);
  const mig = readMigration(ims, ne, T);
  const toObj = (m) => { const o = {}; for (const [k, v] of m) o[k] = v; return o; };
  const gov = GOVERNANCE[OUT];
  return {
    report: mig,
    bundle: {
      gov: { upstreams: gov.upstreams, asOf: gov.asOf, paidBy: gov.paidBy, cadence: gov.cadence, builtBy: gov.builtBy, schema: gov.schema,
        generatedAt, quality: measurePairs(mig.years, mig.pairs) },
      v: 1,
      places: T.rows,
      migration: {
        years: mig.years, unit: 'people', rows: mig.pairs,
        totalIn: toObj(mig.inTot), totalOut: toObj(mig.outTot),
        unplaced: [...mig.unplaced].map(([m49, name]) => ({ m49, name })),
        /* what each destination's estimates stand on: DESA's note number and its type-of-data codes, and the notes themselves */
        basis: toObj(mig.basis), notes: mig.notes,
      },
    },
  };
}
async function main() {
  const i = process.argv.indexOf('--ims');
  let ims;
  if (i >= 0) ims = readFileSync(process.argv[i + 1]);
  else {
    const r = await fetch(IMS_URL);
    /* a 404 or a maintenance page is not a workbook: stop, and keep the committed file */
    if (!r.ok) throw new Error('world-flows: ' + IMS_URL + ' answered ' + r.status);
    ims = Buffer.from(await r.arrayBuffer());
  }
  const p = join(ROOT, OUT);
  const check = process.argv.includes('--check');
  /* the write date is the only field a rebuild changes on its own: --check compares with the committed file's date */
  const was = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
  const generatedAt = check && was && was.gov ? was.gov.generatedAt : new Date().toISOString().slice(0, 10);
  const { bundle, report } = build(ims, generatedAt);
  const text = JSON.stringify(bundle) + '\n';
  console.log('world-flows: ' + report.pairs.length.toLocaleString() + ' destination-origin pairs, years ' + report.years.join(', ') + ', ' + bundle.places.length + ' places');
  console.log('  not on the map (no Natural Earth feature): ' + [...report.unplaced].map(([c, n]) => n + ' (' + c + ')').join(', '));
  if (check) {
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) { console.error('world-flows: ' + OUT + ' differs from the upstream - run node scripts/build-world-flows.mjs'); process.exit(1); }
    console.log('world-flows: ' + OUT + ' matches the upstream');
    return;
  }
  writeFileSync(p, text);
  console.log('world-flows: wrote ' + OUT + ' (' + (text.length / 1024).toFixed(0) + ' KB)');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
