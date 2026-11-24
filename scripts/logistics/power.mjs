/* ============================================================================
 *  IntMap · logistics network — POWER PLANTS  (WRI Global Power Plant Database 1.3.0 + the port table → data/power-plants.json)
 * ----------------------------------------------------------------------------
 *  node scripts/logistics/power.mjs --csv global_power_plant_database.csv [--write]
 *    --csv    the CSV inside https://wri-dataportal-prod.s3.amazonaws.com/manual/global_power_plant_database_v_1_3.zip
 *             (CC BY 4.0; 34,936 plants; WRI, Global Energy Observatory, Google, KTH, Enipedia; June 2021)
 *
 *  WHAT IT ANSWERS: which fuel-burning plants (coal, oil, gas, petcoke — the fuels that travel by ship) stand within
 *  reach of each port of data/logistics-network.json, with the capacity (MW), operator and commissioning year the
 *  database STATES, so «this port stops» can name the generating capacity that sits at it.
 *
 *  ⚠ WHAT IT DOES NOT CLAIM. Proximity is not supply: the database does not say where a plant buys its fuel, and a gas
 *    plant may be fed by pipeline. A plant is listed at a port because it lies within `MODEL.portReachKm` of it (straight
 *    line), nothing more. Plants of every other fuel (hydro, wind, solar, nuclear, geothermal, biomass, waste, storage)
 *    are not in the file — they are not seaborne-fuel loads. The operator is the database's CURRENT statement, not a
 *    history: it is never read as who owned the plant in a past year.
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

export const MODEL = {
  /* Fuels that arrive by ship. Chosen (a plant of any other primary fuel is not a seaborne-fuel load). */
  fuels: ['Coal', 'Oil', 'Gas', 'Petcoke'],
  /* A plant is listed at a port within this STRAIGHT-LINE distance. Measured 2026-11-20 on the 984-port table: of 8,660 plants of those fuels,
     303 lie within 5 km of a port, 687 within 15 km, 1,028 within 30 km, 1,583 within 60 km. 30 km is where a plant can plausibly take fuel
     at the quay or by a short link; chosen, not measured as a supply relation. Expires: never (a stated reading of «at the port»). */
  portReachKm: 30,
  /* how many ports are kept per plant: the first is the nearest */
  keep: 3,
};

export const GOVERNANCE = {
  'data/power-plants.json': {
    publisher: 'World Resources Institute, Global Energy Observatory, Google, KTH Royal Institute of Technology, Enipedia — Global Power Plant Database 1.3.0',
    url: 'https://datasets.wri.org/datasets/global-power-plant-database',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    attribution: true,
    /* (describes.*) what the build rule and the database state */
    period: 'a snapshot: plants as the database stands at its 1.3.0 release (June 2021); each row carries the commissioning year the database states',
    extent: 'worldwide, but only the plants of the fuels in MODEL.fuels (coal, oil, gas, petcoke) that stand within MODEL.portReachKm (30 km, straight line) of a port in data/ports.json: 1,028 plants, counted 2026-11-20',
    method: 'each plant is tied to the nearest MODEL.keep (3) ports within the radius by great-circle distance; the tie is proximity, not a stated fuel supply',
    resolution: 'one point per plant, at the coordinates the database states; not the plant footprint',
    completeness: 'a plant of another fuel, or farther than the radius, is absent by the rule and not because it does not exist; the database does not claim to list every plant',
    accuracy: 'capacity, operator and commissioning year are copied from the database unchanged; IntMap measures none of them',
    ...WRI_GPPD,
    retrievedAt: '2026-11-20',
    generatedAt: '2026-11-20',
    asOf: '2021-06-02',
    schema: 'scripts/logistics/power.mjs (plants with the ports they stand at) — read by js/logistics-impact.js (research.portImpact) and tests/logistics-network-checks.test.mjs',
    quality: { rows: 1028, missing: { id: 0, name: 0, x: 0, y: 0 }, outOfRange: { x: 0, y: 0 }, duplicates: 0 },
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
export const hav = (lng1, lat1, lng2, lat2) => { const r = Math.PI / 180, dl = (lng2 - lng1) * r, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) ** 2; return 12742 * Math.asin(Math.min(1, Math.sqrt(a))); };

/** plants (parsed rows) + ports ([{ref,lng,lat}]) → { plants, portRefs, considered } */
export function link(rows, ports, model = MODEL) {
  const used = new Map(), portRefs = [], plants = []; let considered = 0;
  for (const r of rows) {
    if (model.fuels.indexOf(r.primary_fuel) < 0) continue;
    considered++;
    const x = +r.longitude, y = +r.latitude; if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const near = [];
    for (const p of ports) { const d = hav(x, y, p.lng, p.lat); if (d <= model.portReachKm) near.push([p.ref, d]); }
    if (!near.length) continue;
    near.sort((a, b) => a[1] - b[1]);
    const mw = +r.capacity_mw, yr = parseInt(r.commissioning_year, 10);
    plants.push({
      id: r.gppd_idnr, n: r.name, cc: r.country, x: +x.toFixed(4), y: +y.toFixed(4), f: r.primary_fuel,
      mw: Number.isFinite(mw) ? mw : null, yr: Number.isFinite(yr) ? yr : null, o: r.owner || null,
      p: near.slice(0, model.keep).map(([ref, d]) => { if (!used.has(ref)) { used.set(ref, portRefs.length); portRefs.push(ref); } return [used.get(ref), +d.toFixed(1)]; }),
    });
  }
  return { plants, portRefs, considered };
}

function main() {
  const csv = arg('--csv'); if (typeof csv !== 'string') { console.error('--csv <global_power_plant_database.csv> is required'); process.exit(2); }
  const rows = parseCsv(fs.readFileSync(csv, 'utf8'));
  const net = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'logistics-network.json'), 'utf8'));
  const { plants, portRefs, considered } = link(rows, net.ports);
  const decl = GOVERNANCE['data/power-plants.json'];
  const doc = {
    publisher: decl.publisher, url: decl.url, licence: decl.licence, licenceUrl: decl.licenceUrl, attribution: decl.attribution, paidBy: decl.paidBy,
    period: decl.period, extent: decl.extent, method: decl.method, resolution: decl.resolution, completeness: decl.completeness, accuracy: decl.accuracy,
    cadence: decl.cadence, cadenceBasis: decl.cadenceBasis, retrievedAt: decl.retrievedAt, generatedAt: decl.generatedAt, asOf: decl.asOf,
    schema: decl.schema, quality: decl.quality, builtBy: decl.builtBy,
    inputs: [{ role: 'plants', name: 'Global Power Plant Database 1.3.0 (WRI)', licence: 'CC BY 4.0', url: decl.url }, { role: 'ports', name: 'data/logistics-network.json', licence: 'see that file' }],
    model: { ...MODEL, kind: "straight-line proximity of a fuel-burning plant to a port — not an observed fuel supply; the operator is the database's current statement, not a history" },
    coverage: { databaseRows: rows.length, ofSeabornFuels: considered, atAPort: plants.length, portsWithPlants: portRefs.length, byFuel: plants.reduce((m, p) => (m[p.f] = (m[p.f] || 0) + 1, m), {}) },
    portRefs, plants,
  };
  const measured = plants.map((p) => ({ id: p.id, name: p.n, x: p.x, y: p.y }));
  if (arg('--write')) agreeOrRefuse(decl, measured, QUALITY_OPTS, TODAY);
  console.log(JSON.stringify({ coverage: doc.coverage, bytes: JSON.stringify(doc).length }, null, 1));
  if (arg('--write')) { fs.writeFileSync(OUT, JSON.stringify(doc) + '\n'); console.error('wrote', OUT); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
