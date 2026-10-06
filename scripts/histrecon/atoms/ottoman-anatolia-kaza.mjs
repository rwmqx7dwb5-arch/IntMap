/* ==========================================================================
 * scripts/histrecon/atoms/ottoman-anatolia-kaza.mjs   (hist-reconstruction · atom set «oak-kaza@d897044»)
 *
 * ATOMS = the kazas (districts) of the late Ottoman Empire in Anatolia and Eastern Thrace as Emre Amasyalı's
 * «Ottoman Anatolia Schooling — Historical GIS Dataset» publishes them (data/derived/geojson/kazas_boundaries.geojson,
 * 332 polygons, WGS84). The publisher traced them in ArcGIS from R. Huber's 1899 administrative map of the Ottoman
 * Empire and, where a kaza had been split or merged between 1893 and 1899, reconstructed its 1893 extent from the
 * vilayet yearbooks (salname) — so the set is «the kazas of the 1893 census» (Karpat 1985) on Huber's lines.
 *
 * WHY KAZAS ARE THE RIGHT ATOMS: under the Vilayet Law (1864/1867) a vilayet or an independent sanjak was, by law, a
 * list of whole sanjaks and a sanjak a list of whole kazas, so a first-level unit on a date is a union of kazas
 * wherever the 1893 kazas kept their lines. A change that moved only a nahiye or villages across a first-level line
 * cannot be written this way — the dossier names it in `unresolved` (e.g. the Kargı nahiye, Tosya → Osmancık, 1894).
 *
 * WHAT THE SET DOES NOT COVER (measured 2026-10-06): Kars, Ardahan, Artvin and Iğdır (Russian 1878–1918) are absent;
 * Edirne vilayet is present only with its parts inside today's Turkey (five polygons labelled by sanjak) and Aleppo
 * vilayet only with its northern kazas — a dossier must not draw those two vilayets from this set. The Aegean islands
 * (Imbros, Tenedos) are absent.
 *
 * PRECISION: read at the publisher's precision. Two mechanical steps only, both below any drawn distance:
 *   · consecutive duplicate vertices are dropped and rings are closed (the same `clean` as the other atom sets);
 *   · coordinates are snapped to 1e-9° (≈ 0.1 mm). MEASURED 2026-10-06: the GeoJSON (re-projected by the publisher
 *     from EPSG:3857) carries shared kaza edges whose vertices differ in the last floating-point digits, and
 *     polygon-clipping's union of a vilayet's kazas threw («Unable to complete output ring») for 9 of 19 vilayets;
 *     after the 1e-9° snap all 19 unions complete with the summed and unioned areas equal to < 0.02 %.
 *     Expires if the publisher re-exports the file or the union library changes.
 *   The publisher's file gives the city of Istanbul as three polygons with one RTENO; they are one atom here.
 *
 * THE SEA IS NOT A KAZA (hist-recon-expand, 2026-10-06). The publisher traced Huber's 1899 map and georeferenced
 * it; along the coasts the traced shoreline lies up to 10–20 km off today's (measured: 19.7 % of Trabzon's union,
 * 21 % of Istanbul's, 11.7 % of Çatalca's fell outside Turkey, almost all at sea). That is a georeferencing error,
 * not a historical claim — no kaza extended into the Black Sea. Each kaza is therefore intersected with the LAND:
 * Turkey's from geoBoundaries TUR ADM1 (OpenStreetMap, CC BY-SA — it carries the small islands; Natural Earth 10m
 * does not, and the first version of this step erased the Princes' Islands kaza of Istanbul, measured 2026-10-06),
 * every neighbour's from Natural Earth 10m admin-0 (public domain, the same pinned commit as ne-admin1), so
 * only sea is removed: land borders between today's countries do not cut a kaza, and the interior lines between
 * kazas stay exactly as the publisher traced them (their precision is the 1899 map's, a few km — the only record
 * of these lines). Where the traced shore falls short of today's coast the gap stays: nothing is added.
 *
 * Catalogue key: «TUR» (the present-day country whose ground the set covers; a dossier names it in `atomCountries`
 * under its polity key, e.g. OTT), so the assembler's guard against two dossiers describing one country on one day
 * applies to it as to the geoBoundaries sets.
 *
 * Source pinned to commit d89704465b6f7f962ba9612c334100fbfc854874 (read 2026-10-06).
 * Licence (README «License», read 2026-10-06): data CC BY 4.0, code MIT. Credit: Amasyalı, Emre. 2020. Ottoman Anatolia
 * Schooling HGIS Dataset [Data set]. McGill University. https://github.com/emreamasyali/ottoman-anatolia-schooling-hgis
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import pc from 'polygon-clipping';
import { atomSet } from './geoboundaries.mjs';
import { cacheDir, SHA as NE_SHA } from './ne-admin1.mjs';

export const COMMIT = 'd89704465b6f7f962ba9612c334100fbfc854874';
export const SET = 'oak-kaza@d897044';
export const SOURCE = {
  publisher: 'Emre Amasyalı (McGill University)',
  title: 'Ottoman Anatolia Schooling — Historical GIS Dataset: kaza boundaries (c. 1893, traced from R. Huber 1899)',
  url: 'https://github.com/emreamasyali/ottoman-anatolia-schooling-hgis',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  citation: 'Amasyalı, Emre. 2020. Ottoman Anatolia Schooling HGIS Dataset [Data set]. McGill University. https://github.com/emreamasyali/ottoman-anatolia-schooling-hgis',
  attribution: true, creditRequired: true,
  /* the js/reference-data.js row that pays the credit (its exact `n`) */
  creditRow: 'Emre Amasyalı (McGill University) — Ottoman Anatolia Schooling HGIS: kaza boundaries c. 1893 (CC BY 4.0), parts of the reconstructed Ottoman provinces',
};
/* geoBoundaries datasets this set reads (Turkey's land, see THE SEA IS NOT A KAZA) — credited with the others */
export const GB_PARTS = [{ iso: 'TUR', level: 'ADM1' }];
const URL = 'https://raw.githubusercontent.com/emreamasyali/ottoman-anatolia-schooling-hgis/' + COMMIT + '/data/derived/geojson/kazas_boundaries.geojson';
const KEY = 'TUR';
const SNAP = 1e9;

let _fc = null;
async function collection() {
  if (_fc) return _fc;
  const file = path.join(cacheDir(), 'oak-kazas-' + COMMIT.slice(0, 7) + '.geojson');
  if (!fs.existsSync(file)) {
    const r = await fetch(URL);
    if (!r.ok) throw new Error('Amasyalı kazas ' + r.status + ' ' + URL);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  _fc = JSON.parse(fs.readFileSync(file, 'utf8'));
  return _fc;
}

/** the atom id of a feature: its RTENO without the trailing « Kaza», as a stable slug */
const idOf = (p) => 'OAK-' + String(p.RTENO).replace(/\s*Kaza$/, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
const nameOf = (p) => (p.KazaName ? String(p.KazaName).replace(/\s*Kaza$/, '') : String(p.RTENO).replace(/\s*Kaza$/, '').split('_').pop());

/** features grouped by atom id (the three Istanbul polygons share one RTENO) */
async function byAtom() {
  const m = new Map();
  for (const f of (await collection()).features) {
    const id = idOf(f.properties);
    if (!m.has(id)) m.set(id, { p: f.properties, gs: [] });
    m.get(id).gs.push(f.geometry);
  }
  return m;
}

const want = (countries) => !countries || !countries.length || countries.includes(KEY);

/** { TUR: [{ id, name, group (the vilayet the dataset attributes it to), sanjak }] } */
export async function catalogue(countries) {
  if (!want(countries)) return {};
  const out = { [KEY]: [] };
  for (const [id, { p }] of await byAtom()) out[KEY].push({ id, name: nameOf(p), group: p.Vilayet || p.Sanjak || null, sanjak: p.Sanjak || null });
  return out;
}

function clean(ring) {
  const out = [];
  for (const p of ring) {
    const q = [Math.round(p[0] * SNAP) / SNAP, Math.round(p[1] * SNAP) / SNAP];
    const l = out[out.length - 1];
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q);
  }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}

/* the land the kazas may occupy: Natural Earth 10m admin-0 of Turkey and its neighbours (see THE SEA IS NOT A KAZA) */
const LAND_OF = ['GRC', 'BGR', 'GEO', 'ARM', 'AZE', 'IRN', 'IRQ', 'SYR', 'CYP', 'CYN'];
let _land = null;
async function land() {
  if (_land) return _land;
  const file = path.join(cacheDir(), 'ne_10m_admin0-' + NE_SHA.slice(0, 7) + '.geojson');
  if (!fs.existsSync(file)) {
    const u = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' + NE_SHA + '/geojson/ne_10m_admin_0_countries.geojson';
    const r = await fetch(u);
    if (!r.ok) throw new Error('Natural Earth admin-0 ' + r.status + ' ' + u);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  _land = [];
  for (const f of JSON.parse(fs.readFileSync(file, 'utf8')).features) {
    if (!LAND_OF.includes(f.properties.ADM0_A3)) continue;
    const g = f.geometry;
    for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) _land.push({ poly, box: boxOf([poly]) });
  }
  for (const polys of (await atomSet('ADM1').geometries(['TUR'])).values()) for (const poly of polys) _land.push({ poly, box: boxOf([poly]) });
  return _land;
}
function boxOf(polys) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const p of polys) for (const [x, y] of p[0]) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}
async function onLand(polys) {
  const [a, b, c, d] = boxOf(polys);
  const near = (await land()).filter(({ box: q }) => q[0] <= c && q[2] >= a && q[1] <= d && q[3] >= b).map((l) => l.poly);
  if (!near.length) return [];
  return pc.intersection(polys, near.length === 1 ? near[0] : pc.union(...near.map((p) => [p])));
}

/** Map id → MultiPolygon at the publisher's precision (snapped to 1e-9°), less the sea (see above) */
export async function geometries(countries) {
  const out = new Map();
  if (!want(countries)) return out;
  for (const [id, { gs }] of await byAtom()) {
    const polys = [];
    for (const g of gs) {
      if (!g) continue;
      for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
        const rings = poly.map(clean);
        if (rings[0]) polys.push(rings.filter(Boolean));
      }
    }
    const kept = polys.length ? (await onLand(polys)).map((p) => p.map(clean).filter(Boolean)).filter((p) => p.length) : [];
    if (kept.length) out.set(id, kept);
  }
  return out;
}
