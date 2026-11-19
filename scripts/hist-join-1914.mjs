#!/usr/bin/env node
/* ============================================================================
 *  hist-join-1914.mjs — borders · population · cities · railways, joined for one instant  (time-spatial-base)
 * ----------------------------------------------------------------------------
 *  The spatio-temporal analysis the audit (dev-notes/2026-11-19-hist-audit-fixes.md §3) said had never been run: Europe on
 *  1 July 1914 (four weeks before the war), read off the records the map draws, then joined through the GIS layer
 *  (js/gis-ops.js), and compared with what the history says.
 *
 *    · BORDERS    the map's own record for the instant (scripts/history-pages.mjs mapReader → js/time-borders.js collectionAt),
 *                 each outline carrying its polity's IDENTIFIER (js/year-book.js polityKey: CShapes `_gw`, Wikidata `_qid`).
 *    · POPULATION Maddison Project 2020 (data/maddison.json), the year 1913 (nearest stated year before the instant). LINKED BY
 *                 IDENTIFIER: the polity's CShapes gw code → its single modern carrier ISO3 (the table js/time-borders.js
 *                 `_GW2ISO` states — read from that file, not copied), never by the polity's name. Maddison counts the people of
 *                 a country code; it is not a count of the polity's subjects, and where the polity has several successors
 *                 (Austria-Hungary, the Ottoman Empire) the table states none and NO population is joined.
 *    · CITIES     Reba, Reitsma & Seto 2016 (data/hist-urban.json), each city's latest stated size in 1900–1914, assigned to the
 *                 polity whose drawn shape contains it — GIS op `aggregate`.
 *    · RAILWAYS   OpenStreetMap lines that STATE an opening year ≤ 1914 (data/railways/c, RailSchema.yearOf), clipped to each
 *                 polity's shape — GIS op `clip`, length by `measure`. A lower bound twice over: OSM states a year on only some
 *                 lines, and a line closed before today is not in OSM at all. The undated length is reported beside it.
 *
 *    node scripts/hist-join-1914.mjs            print the report
 *    node scripts/hist-join-1914.mjs --json     the same as JSON
 * ========================================================================== */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const BOX = [-12, 34, 45, 71];   /* Europe as the 1914 question means it: Iberia to the Urals' western foot */
const at1 = (y) => { const d = new Date(0); d.setUTCFullYear(y, 6, 1); d.setUTCHours(12, 0, 0, 0); return d; };
const WHEN = at1(1914);
const YEAR_POP = 1913, FIRST_CITY_YEAR = 1900;
const bboxOf = (g) => { let a = 180, b = 90, c = -180, d = -90; const wk = (cs) => { for (const x of cs) { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); b = Math.min(b, x[1]); c = Math.max(c, x[0]); d = Math.max(d, x[1]); } else wk(x); } }; wk(g.coordinates); return [a, b, c, d]; };
const meets = (b) => b[0] <= BOX[2] && b[2] >= BOX[0] && b[1] <= BOX[3] && b[3] >= BOX[1];
const iso = (d) => d.toISOString().slice(0, 10);

const realTimers = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval };
const { mapReader } = await import('./history-pages.mjs');
const R = await mapReader();   /* first: it sets up its own page globals; the GIS scope below is installed after */
const { polityKey, areaKm2 } = await import('../js/year-book.js');
const { RailSchema } = await import('../js/rail-schema.js');   /* decodeLines — the wire form's one reader */
const { followPolities } = await import('../js/atlas-reasoning.js');
/* ── BORDERS ── */
const at = await R.labelsAt(WHEN);
const polys = [];
at.fc.features.forEach((f, i) => {
  const nm = String(at.labels.en[i] || '').trim(); if (!nm || !f.geometry) return;
  if (!meets(bboxOf(f.geometry))) return;
  const p = f.properties || {};
  polys.push({ type: 'Feature', geometry: f.geometry, properties: { uid: 'o' + polys.length, name: nm, key: polityKey(p) || '', record: p._rec || (p._gw != null ? 'cshapes' : ''), km2: Math.round(areaKm2(f.geometry)) } });
});
/* ── THE FOLLOW ACROSS ERAS: the same identifier, 1900 → 1914 → 1925 ── */
const snaps = [];
for (const y of [1900, 1914, 1925]) {
  const a = await R.labelsAt(at1(y));
  snaps.push({ year: y, rows: a.fc.features.map((f, i) => ({ en: String(a.labels.en[i] || '').trim(), key: polityKey(f.properties), km2: Math.round(areaKm2(f.geometry)), bb: f.geometry ? bboxOf(f.geometry) : null })).filter((r) => r.en && r.bb && meets(r.bb)) });
}
const fl = followPolities(snaps);
const followed = { renamedAcrossEras : [...fl.values()].filter((e) => e.names.length > 1).map((e) => ({ key: e.key, names: e.names })), unkeyedPerSnapshot: fl.unkeyed };



/* ── the GIS scope is installed AFTER everything the map reader does: that harness replaces the page's timers with stubs that never fire ── */
Object.assign(globalThis, realTimers);   /* the map reader's harness stubs the timers (they never fire); the GIS yields on a real one */
const { installWindow } = await import('../tests/helpers/geo-shared.mjs');
const w = installWindow();
const { makeGisDatasets } = await import('../js/gis-datasets.js');
const { makeGisGeometry } = await import('../js/gis-geometry.js');
const { makeGisUnits } = await import('../js/gis-units.js');
const { makeGisOps } = await import('../js/gis-ops.js');
const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops; w.IntMapGisUnits = makeGisUnits();
await geometry.ready();
const must = async (step) => { const r = await ops.run(step); if (!r.ok) throw new Error(step.op + ' refused: ' + r.why + ' ' + JSON.stringify(r.detail)); return r; };


const bordersDs = data.add({ title: 'borders 1914-07-01', features: polys, time: { kind: 'constant', start: iso(WHEN), end: iso(WHEN) } });

/* ── IDENTIFIER → MODERN CARRIER (read from the map's own table) ── */
const gwTable = (() => { const m = /const _GW2ISO=\{([\s\S]*?)\};/.exec(rd('js/time-borders.js')); const o = {}; for (const t of m[1].matchAll(/(\d+):'([A-Z]{3})'/g)) o[t[1]] = t[2]; return o; })();
const MAD = JSON.parse(rd('data/maddison.json'));

/* ── CITIES: latest size stated in 1900–1914 ── */
const U = JSON.parse(rd('data/hist-urban.json'));
const cities = [];
for (const c of U.cities) {
  const f = (c.f || []).filter((x) => x[0] >= FIRST_CITY_YEAR && x[0] <= 1914).sort((a, b) => b[0] - a[0])[0];
  if (!f || !(f[1] > 0) || c.lon < BOX[0] || c.lon > BOX[2] || c.lat < BOX[1] || c.lat > BOX[3]) continue;
  cities.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.lon, c.lat] }, properties: { name: c.n, pop: f[1], popYear: f[0] } });
}
const citiesDs = data.add({ title: 'cities 1900-1914', features: cities, time: { kind: 'instant', field: 'popYear' } });
const cityAgg = await must({ op: 'aggregate', inputs: [bordersDs.id, citiesDs.id], params: { stat: 'sum', field: 'pop', outName: 'cityPop' } });
const cityCnt = await must({ op: 'aggregate', inputs: [bordersDs.id, citiesDs.id], params: { stat: 'count', outName: 'cityN' } });

/* ── RAILWAYS: lines that state an opening year ≤ 1914, inside Europe ── */
const cellIdx = JSON.parse(rd('data/railways/index.json')).cells;
const lines = []; let undatedKm = 0, laterKm = 0;
const lenKm = (cs) => { let s = 0; for (let i = 1; i < cs.length; i++) { const a = cs[i - 1], b = cs[i]; s += Math.hypot((b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180) * 111.32, (b[1] - a[1]) * 110.57); } return s; };
const cellNum = (x) => (x[0] === 'm' ? -Number(x.slice(1)) : Number(x));
for (const key of Object.keys(cellIdx)) {
  const [la, lo] = key.split('_').map(cellNum);
  if (la + 5 < BOX[1] || la > BOX[3] || lo + 5 < BOX[0] || lo > BOX[2]) continue;
  const enc = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT, 'data/railways/c', key + '.json.gz'))).toString());
  for (const f of RailSchema.decodeLines(enc).features) {
    const p = f.properties || {};
    if (p.k && p.k !== 'rail') continue;
    /* the wire form's `y` IS the opening year (js/railways.js reads p.y for 「開業」); RailSchema.yearOf reads a raw tag */
    const y = (p.y != null && Number.isInteger(+p.y) && +p.y >= 1800 && +p.y <= 2100) ? +p.y : null;
    const km = lenKm(f.geometry.coordinates);
    if (y == null) undatedKm += km; else if (y > 1914) laterKm += km; else lines.push({ type: 'Feature', geometry: f.geometry, properties: { year: y } });
  }
}
const railBy = {};
if (lines.length) {
  const railDs = data.add({ title: 'rail stated open by 1914', features: lines });
  for (const f of polys) {
    const one = data.add({ title: 'p', features: [{ type: 'Feature', geometry: f.geometry, properties: {} }] });
    const c = await must({ op: 'clip', inputs: [railDs.id, one.id] });
    const m = await must({ op: 'measure', inputs: [c.dataset.id], params: { what: 'length', unit: 'km', outName: 'km' } });
    railBy[f.properties.uid] = m.dataset.features().reduce((s, g) => s + (Number(g.properties.km) || 0), 0);
  }
}

/* ── THE JOIN ── */
const byRow = (ds) => new Map(ds.features().map((f) => [f.properties.uid, f.properties]));
const cp = byRow(cityAgg.dataset), cn = byRow(cityCnt.dataset);
const rows = [];
for (const f of polys) {
  const k = f.properties.uid;
  const gw = f.properties.key.startsWith('gw:') ? f.properties.key.slice(3) : null;
  const carrier = gw ? gwTable[gw] || null : null;
  const m = carrier && MAD[carrier] && MAD[carrier][String(YEAR_POP)];
  rows.push({ uid: f.properties.uid, name: f.properties.name, key: f.properties.key || null, record: f.properties.record, km2: f.properties.km2,
    popMaddison1913k: m ? m[1] : null, carrier,
    cityPop: (cp.get(k) || {}).cityPop || 0, cities: (cn.get(k) || {}).cityN || 0, railKm: Math.round(railBy[k] || 0) });
}
rows.sort((a, b) => b.km2 - a.km2);
/* one line per polity: the outlines a polity is drawn as (a metropole and its exclaves) are summed; the Maddison figure is counted once */
const byPolity = new Map();
for (const r of rows) {
  const k = r.key || 'name:' + r.name;
  const e = byPolity.get(k) || { key: r.key, name: r.name, outlines: 0, km2: 0, popMaddison1913k: r.popMaddison1913k, carrier: r.carrier, cityPop: 0, cities: 0, railKm: 0 };
  e.outlines++; e.km2 += r.km2; e.cityPop += r.cityPop; e.cities += r.cities; e.railKm += r.railKm; byPolity.set(k, e);
}
const polities = [...byPolity.values()].sort((a, b) => b.km2 - a.km2);
const NAMED = ['Berlin', 'Paris', 'London', 'Wien', 'Vienna', 'Sankt-Peterburg', 'Saint Petersburg', 'Moskva', 'Moscow', 'Istanbul', 'Constantinople', 'Roma', 'Rome', 'Beograd', 'Belgrade'];
const namedCities = cities.filter((c) => NAMED.includes(c.properties.name)).map((c) => ({ name: c.properties.name, pop: c.properties.pop, popYear: c.properties.popYear }));
const out = { instant: iso(WHEN), record: at.tier, src: at.src, drawn: polys.length, keyed: polys.filter((p) => p.properties.key).length,
  railKm: { statedOpenBy1914: Math.round(Object.values(railBy).reduce((a, b) => a + b, 0)), undated: Math.round(undatedKm), datedLater: Math.round(laterKm) },
  validTime: { borders: bordersDs.time, cities: citiesDs.time, cityAgg: cityAgg.dataset.time, recordedAt: cityAgg.dataset.provenance.recordedAt }, polities, namedCities, outlines: rows, ...followed };

if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
else {
  console.log(`${out.instant} · ${out.record} · ${out.src}\ndrawn ${out.drawn} outlines in the Europe box, ${out.keyed} carry an identifier`);
  console.log('name | key | km2 | Maddison 1913 pop (thousand) via carrier | city pop (n) | rail km stated open by 1914');
  for (const r of polities.slice(0, 40)) console.log([r.name, r.key, r.km2, r.popMaddison1913k == null ? '-' : r.popMaddison1913k + ' via ' + r.carrier, r.cityPop + ' (' + r.cities + ')', r.railKm].join(' | '));
  console.log('named cities:', JSON.stringify(namedCities));
  console.log('rail km (Europe box):', JSON.stringify(out.railKm));
  console.log('valid time:', JSON.stringify(out.validTime));
  console.log('renamed across eras:', JSON.stringify(out.renamedAcrossEras));
  console.log('unkeyed rows per snapshot:', JSON.stringify(out.unkeyedPerSnapshot));
}
