/* ============================================================================
 *  IntMap · POWER PLANTS — WRI Global Power Plant Database 1.3.0 → data/power-plants.json (a shipped TABLE)
 * ----------------------------------------------------------------------------
 *  node scripts/logistics/power.mjs --csv global_power_plant_database.csv [--write]
 *    --csv    the CSV inside https://wri-dataportal-prod.s3.amazonaws.com/manual/global_power_plant_database_v_1_3.zip
 *             (CC BY 4.0; 34,936 plants; WRI, Global Energy Observatory, Google, KTH, Enipedia; June 2021)
 *
 *  Every plant the database lists, every fuel, with the fields it states — written as a TABLE the file
 *  describes itself (`rowTables`, read by scripts/data-tables.mjs), so Atlas can ask it anything through
 *  data.query and hand the rows on to data.gis / compute.run.
 *
 *  ⚠ WHY IT IS THE WHOLE DATABASE. Until 2026-11-25 this file held 1,028 plants: the coal / oil / gas /
 *    petcoke plants within 30 km of a port, each tied to its three nearest ports — the database cut down
 *    to the shape of ONE question («this port stops: what generating capacity stands at it»), readable
 *    only through the capability built for that question. Proximity to a port is a spatial query any
 *    reader can run on the full table (data.query `near` / `spatial nearer_than`); baking it in threw
 *    away 33,908 plants for every other question. dev-notes/2026-11-25-generic-capabilities.md.
 *  ⚠ WHAT IT DOES NOT CLAIM. The operator (`owner`) is the database's CURRENT statement, not a history.
 *    Generation figures are the database's: reported where a national source gave one, estimated by WRI's
 *    model otherwise, and the two are separate columns. The database does not claim to list every plant.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WRI_GPPD } from '../lib/upstream-cadence.mjs';
import { agreeOrRefuse } from '../lib/gov-stamp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'data', 'power-plants.json');
const arg = (n) => { const i = process.argv.indexOf(n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const TODAY = new Date().toISOString().slice(0, 10);

/* the row layout: one array per plant, in this order (the table declaration below names each position) */
export const FIELDS = ['id', 'name', 'cc', 'lng', 'lat', 'fuel', 'otherFuels', 'mw', 'commissioned', 'owner', 'capacityYear', 'genGwh2019', 'estGenGwh2017'];

/* what the file says about its own rows — scripts/data-tables.mjs indexes it, js/atlas-query.js serves it */
export const TABLES = [{
  id: 'power-plants',
  title: { en: 'Power plants (Global Power Plant Database 1.3.0)', jp: '発電所（Global Power Plant Database 1.3.0）' },
  rows: 'plants', fields: FIELDS, key: 'id', name: 'name', lng: 'lng', lat: 'lat',
  columns: [
    { key: 'country', from: 'cc', type: 'text', label: { en: 'Country (ISO 3166-1 alpha-3)', jp: '国（ISO 3166-1 alpha-3）' } },
    { key: 'fuel', from: 'fuel', type: 'text', label: { en: 'Primary fuel', jp: '主燃料' } },
    { key: 'otherFuels', from: 'otherFuels', type: 'text', label: { en: 'Other fuels', jp: 'その他の燃料' } },
    { key: 'capacityMw', from: 'mw', type: 'number', unit: 'MW', label: { en: 'Installed capacity', jp: '設備容量' } },
    { key: 'commissioned', from: 'commissioned', type: 'number', label: { en: 'Commissioning year', jp: '運転開始年' } },
    { key: 'owner', from: 'owner', type: 'text', label: { en: 'Owner (as the database states it now)', jp: '所有者（データベースの現在の記載）' } },
    { key: 'capacityYear', from: 'capacityYear', type: 'number', label: { en: 'Year of the capacity figure', jp: '容量の数値の年' } },
    { key: 'genGwh2019', from: 'genGwh2019', type: 'number', unit: 'GWh', label: { en: 'Reported generation 2019', jp: '発電量 2019（報告値）' } },
    { key: 'estGenGwh2017', from: 'estGenGwh2017', type: 'number', unit: 'GWh', label: { en: 'Estimated generation 2017 (WRI model)', jp: '推計発電量 2017（WRI のモデル）' } },
  ],
}];

export const GOVERNANCE = {
  'data/power-plants.json': {
    publisher: 'World Resources Institute, Global Energy Observatory, Google, KTH Royal Institute of Technology, Enipedia — Global Power Plant Database 1.3.0',
    url: 'https://datasets.wri.org/datasets/global-power-plant-database',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true,
    period: 'a snapshot: plants as the database stands at its 1.3.0 release (June 2021); each row carries the commissioning year and the capacity year the database states',
    extent: 'worldwide: every plant of the database, every fuel — 34,936 plants in 167 countries, counted 2026-11-24',
    method: 'each row of the database is copied with the fields it states; nothing is joined, filtered or derived',
    resolution: 'one point per plant, at the coordinates the database states; not the plant footprint',
    completeness: 'the database does not claim to list every plant; coverage differs by country with the national sources it draws on',
    accuracy: 'capacity, fuel, owner, commissioning year and generation are copied from the database unchanged; reported and WRI-estimated generation are separate columns; IntMap measures none of them',
    ...WRI_GPPD,
    retrievedAt: '2026-11-24',
    generatedAt: '2026-11-24',
    asOf: '2021-06-02',
    schema: 'scripts/logistics/power.mjs (one row per plant; the `rowTables` declaration names the columns) — read through js/atlas-query.js (data.query) via the index js/data-tables.js',
    quality: { rows: 34936, missing: { id: 0, name: 0, x: 0, y: 0 }, outOfRange: { x: 0, y: 0 }, duplicates: 0 },
    paidBy: 'Power plants — Global Power Plant Database 1.3.0 (WRI, Global Energy Observatory, Google, KTH, Enipedia; CC BY 4.0)',
    builtBy: 'scripts/logistics/power.mjs',
  },
};
const QUALITY_OPTS = { fields: { id: {}, name: {}, x: { min: -180, max: 180 }, y: { min: -90, max: 90 } }, key: ['id'] };

export function parseCsv(text) {
  const rows = []; let row = [], c = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(c); c = ''; }
    else if (ch === '\n') { row.push(c.replace(/\r$/, '')); rows.push(row); row = []; c = ''; }
    else c += ch;
  }
  if (c || row.length) { row.push(c); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i]])));
}

const num = (v, dp) => { const n = parseFloat(v); return Number.isFinite(n) ? +n.toFixed(dp) : null; };
const int = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : null; };
/** a database row → the array FIELDS describes */
export function toRow(r) {
  const other = [r.other_fuel1, r.other_fuel2, r.other_fuel3].filter(Boolean).join('; ');
  return [r.gppd_idnr, r.name, r.country, num(r.longitude, 4), num(r.latitude, 4), r.primary_fuel || null, other || null,
    num(r.capacity_mw, 1), int(r.commissioning_year), r.owner || null, int(r.year_of_capacity_data),
    num(r.generation_gwh_2019, 1), num(r.estimated_generation_gwh_2017, 1)];
}

function main() {
  const csv = arg('--csv'); if (typeof csv !== 'string') { console.error('--csv <global_power_plant_database.csv> is required'); process.exit(2); }
  const src = parseCsv(fs.readFileSync(csv, 'utf8'));
  const plants = src.map(toRow);
  const decl = GOVERNANCE['data/power-plants.json'];
  const at = (k) => FIELDS.indexOf(k);
  const doc = {
    publisher: decl.publisher, url: decl.url, licence: decl.licence, licenceUrl: decl.licenceUrl, attribution: decl.attribution, paidBy: decl.paidBy,
    period: decl.period, extent: decl.extent, method: decl.method, resolution: decl.resolution, completeness: decl.completeness, accuracy: decl.accuracy,
    cadence: decl.cadence, cadenceBasis: decl.cadenceBasis, retrievedAt: decl.retrievedAt, generatedAt: decl.generatedAt, asOf: decl.asOf,
    schema: decl.schema, quality: decl.quality, builtBy: decl.builtBy,
    inputs: [{ role: 'plants', name: 'Global Power Plant Database 1.3.0 (WRI)', licence: 'CC BY 4.0', url: decl.url }],
    coverage: { plants: plants.length, countries: new Set(plants.map((p) => p[at('cc')])).size,
      byFuel: plants.reduce((m, p) => (m[p[at('fuel')]] = (m[p[at('fuel')]] || 0) + 1, m), {}) },
    rowTables: TABLES,
    plants,
  };
  const measured = plants.map((p) => ({ id: p[at('id')], name: p[at('name')], x: p[at('lng')], y: p[at('lat')] }));
  if (arg('--write')) agreeOrRefuse(decl, measured, QUALITY_OPTS, TODAY);
  console.log(JSON.stringify({ coverage: doc.coverage, bytes: JSON.stringify(doc).length }, null, 1));
  if (arg('--write')) { fs.writeFileSync(OUT, JSON.stringify(doc) + '\n'); console.error('wrote', OUT); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
