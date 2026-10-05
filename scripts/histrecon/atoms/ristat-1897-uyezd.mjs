/* ==========================================================================
 * scripts/histrecon/atoms/ristat-1897-uyezd.mjs   (hist-reconstruction · atom set «ristat-1897-uyezd@v3»)
 *
 * ATOMS = the 824 uyezds (districts) of the Russian Empire at the census of 1897, as the Electronic
 * Repository of Russian Historical Statistics published them (DataverseNL doi:10.34894/NQOASN, version 3,
 * file «Russian Empire 1897 - Districts», datafile 578935, GeoPackage, layer districts_1897).
 *
 * WHY UYEZDS ARE THE RIGHT ATOMS: a guberniya was, by law, a list of whole uyezds (ПСЗ; V. E. Den,
 * «Население России по пятой ревизии», 1902, prilozhenie — the change list per guberniya cites the decree
 * that moved each uyezd). A guberniya on a date is therefore a union of uyezds wherever the uyezds of 1897
 * already existed with their 1897 lines; a change that moved part of an uyezd, or created an uyezd whose
 * lines cut 1897 ones, cannot be written this way — a dossier names it in `unresolved`.
 *
 * Read at the publisher's precision (WGS84, no rounding). The antimeridian split is the harvester's own
 * (scripts/histsurveys/ristat.mjs `wrapPolygons`, imported, not copied).
 *
 * Licence: CC0 1.0 with a request to cite the Electronic Repository of Russian Historical Statistics
 * (Dataverse termsOfUse/termsOfAccess, read 2026-10-05; the same evidence scripts/histsurveys/ristat.mjs re-reads).
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { cacheDir } from './ne-admin1.mjs';
import { gpkgGeometry, wrapPolygons } from '../../histsurveys/ristat.mjs';

export const SET = 'ristat-1897-uyezd@v3';
export const SOURCE = {
  publisher: 'Electronic Repository of Russian Historical Statistics (RISTAT)',
  title: 'Russian Empire Historical GIS Maps (1897) — Districts',
  url: 'https://doi.org/10.34894/NQOASN',
  licence: 'CC0 1.0 with a request for attribution',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  citation: 'Electronic Repository of Russian Historical Statistics, 18th - 21st centuries, https://ristat.org/, Version I (2020): Russian Empire Historical GIS Maps (1897). DataverseNL, https://doi.org/10.34894/NQOASN.',
};
const URL = 'https://dataverse.nl/api/access/datafile/578935';

let _rows = null;
async function rows() {
  if (_rows) return _rows;
  const file = path.join(cacheDir(), 'ristat-1897-districts.gpkg');
  if (!fs.existsSync(file)) {
    const r = await fetch(URL);
    if (!r.ok) throw new Error('RISTAT districts ' + r.status);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const db = new DatabaseSync(file, { readOnly: true });
  _rows = db.prepare('SELECT Distr_ID, Gub_ID, Name_RU, Name_ENG, prov_RU, prov_ENG, RISTAT_ID, geom FROM districts_1897').all();
  db.close();
  return _rows;
}
const idOf = (r) => 'U1897-' + r.Distr_ID;

/** catalogue under the polity key «RUE» (Russian Empire); `group` = the 1897 guberniya the uyezd belonged to */
export async function catalogue() {
  const out = { RUE: [] };
  for (const r of await rows()) out.RUE.push({ id: idOf(r), name: r.Name_RU, name_en: r.Name_ENG, group: r.prov_ENG, groupRu: r.prov_RU, gubId: r.Gub_ID, ristatId: r.RISTAT_ID });
  return out;
}

function clean(ring) {
  const out = [];
  for (const p of ring) { const q = out[out.length - 1]; if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push([p[0], p[1]]); }
  if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0].slice());
  return out.length >= 4 ? out : null;
}
export async function geometries() {
  const out = new Map();
  for (const r of await rows()) {
    const g = gpkgGeometry(r.geom);
    if (!g) continue;
    const polys = wrapPolygons(g.type === 'Polygon' ? [g.coordinates] : g.coordinates)
      .map((poly) => poly.map(clean)).filter((poly) => poly[0]).map((poly) => poly.filter(Boolean));
    out.set(idOf(r), polys);
  }
  return out;
}
