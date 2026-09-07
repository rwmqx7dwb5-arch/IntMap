/* ============================================================================
 *  IntMap · THE RECORD, READ ONCE — scripts/histcities/*.mjs → rows   (#R521)
 * ----------------------------------------------------------------------------
 *  Three programs read the same eleven region files: the builder that writes
 *  data/hist-cities.json, the one that resolves every key against GeoNames
 *  (scripts/build-histcities-homonyms.mjs), and the audit that prints the table.
 *  They were about to hold three copies of «how a row is loaded», which is the
 *  shape #R500 measured going wrong: the copies drift, and the oldest one is the
 *  one nobody looks at. So the loading lives here and they import it.
 * ==========================================================================*/
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = join(HERE, 'histcities');

/** every row of the record, in region-file order, each tagged with the file it came from */
export async function loadRecord() {
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith('.mjs') && f !== 'lang.mjs').sort();
  const rows = [];
  for (const f of files) {
    const m = await import(new URL('./histcities/' + f, import.meta.url).href);
    if (!Array.isArray(m.ROWS)) throw new Error(`scripts/histcities/${f} exports no ROWS array`);
    for (const r of m.ROWS) rows.push(Object.assign({ _file: f }, r));
  }
  return { files, rows };
}

/** every distinct spelling the record joins on, sorted — the homonym index's own key set */
export function allKeys(rows) {
  const s = new Set();
  for (const r of rows) for (const k of r.keys) s.add(k);
  return [...s].sort();
}

/** the guard radius, in METRES, the runtime puts around a row's coordinate (see js/hist-cities.js) */
export const GUARD_M = 20000;

const R = Math.PI / 180;
/** great-circle kilometres */
export function km(aLon, aLat, bLon, bLat) {
  const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
