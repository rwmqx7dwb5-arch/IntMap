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

/** every row of the record, in region-file order, each tagged with the file it came from
 *  ⚠ (#R679) A RECORD FILE IS ONE THAT EXPORTS `ROWS`, and a supporting module is one that
 *  exports `HELPER`. It used to be «every .mjs except lang.mjs», which is a list of one — and a
 *  list of one is still a list: the moment the directory gained upstream.mjs and harvest.mjs,
 *  that rule tried to import a harvester as a region and threw. A file that declares neither
 *  still fails loudly, so a typo cannot make a region file quietly disappear. */
/*  ⚠⚠⚠ (#R689) AND A FILE WHOSE ROWS ARE SOMEBODY ELSE'S MUST SAY WHOSE. The condition is
 *  attached to the ROWS, not to a list of derived filenames: `D()` sets `derived` on every row a
 *  harvest writes, so the day a third upstream is harvested the rule already covers it (#R429).
 *  What the declaration is for, and what reads it, is in scripts/histcities/lang.mjs `LIC()`. */
export async function loadRecord() {
  const files = [];
  const rows = [];
  const licences = [];
  for (const f of readdirSync(SRC_DIR).filter((x) => x.endsWith('.mjs')).sort()) {
    const m = await import(new URL('./histcities/' + f, import.meta.url).href);
    if (m.HELPER === true) continue;
    if (!Array.isArray(m.ROWS)) {
      throw new Error(`scripts/histcities/${f} exports neither a ROWS array nor HELPER — a record file lists cities, a supporting module says so`);
    }
    if (m.ROWS.some((r) => r.derived)) {
      if (!m.LICENCE || typeof m.LICENCE.publisher !== 'string') {
        throw new Error(`scripts/histcities/${f} carries rows harvested from an upstream and exports no LICENCE — a derived record has to say whose it is and what that costs (scripts/histcities/lang.mjs LIC())`);
      }
      licences.push(Object.assign({ _file: f, rows: m.ROWS.length }, m.LICENCE));
    } else if (m.LICENCE) {
      throw new Error(`scripts/histcities/${f} exports a LICENCE but holds no derived rows — a handwritten record is IntMap's own and claims nobody else's terms`);
    }
    files.push(f);
    for (const r of m.ROWS) rows.push(Object.assign({ _file: f }, r));
  }
  return { files, rows, licences };
}

/** every distinct spelling the record joins on, sorted — the homonym index's own key set */
export function allKeys(rows) {
  const s = new Set();
  for (const r of rows) for (const k of r.keys) s.add(k);
  return [...s].sort();
}

/** the guard radius, in METRES, the runtime puts around a row's coordinate (see js/hist-cities.js) */
export const GUARD_M = 20000;

/* ── the numbers the guard is derived from, and where each of them comes from ────────────────
 *  ⚠ (#R679) THESE LIVE HERE BECAUSE TWO PROGRAMS NOW DERIVE A GUARD. scripts/build-hist-cities
 *  .mjs derives it for a handwritten row out of data/histcities-homonyms.json.gz, and
 *  scripts/histcities/harvest.mjs derives it for a derived row out of the GeoNames archive
 *  directly, because the committed index covers only the spellings the handwritten record joins
 *  on. #R500's lesson is the reason they do not each keep a copy of the arithmetic: the copies
 *  drift, and the one nobody looks at is the one that goes wrong.
 *
 *  ⚠ MEASURED, NOT CHOSEN — from BOTH sides, because a guard has to be small enough to exclude
 *  the namesake and large enough to still contain the label.
 *    · the namesakes: the nearest settlement carrying a handwritten row's spelling as its own
 *      name is 13.5 km away (Türkmenbaşy village), then 25.6 (Abovyan) and 29.2 (Holubivka) —
 *      and 8.2, Armavir's, which is why `measured` exists.
 *    · the labels: the vector tile's `place` node is NOT the record's coordinate, and the gap was
 *      measured in the real renderer against live OpenFreeMap tiles — 0.11 km (Volgograd), 0.38
 *      (Kirov), 1.47 (Linden), 4.09 (Yining), 4.78 (Kochi), 6.68 (Tokyo). The worst is 6.68 km,
 *      which is what the floor below is protecting.
 *  ⚠⚠ THE FLOOR IS «WHAT AN UNMEASURED ROW GETS» — derived from OTHER rows' worst case, so a
 *  handwritten row that has actually been measured may declare `measured` and go below it.
 *  What no declaration may cross is the hard floor: OpenMapTiles serves `place` at extent 4096,
 *  so at `ofm-city`'s minzoom of 3 one unit is 1.22 km and the rounding alone is ±0.61 km. */
export const GUARD_FLOOR_KM = 6;
export const GUARD_HARD_FLOOR_KM = 2;
export const MARGIN = 2;          /* the guard reaches at most HALFWAY to the nearest namesake */
export const ANCHOR_TOL_KM = 10;  /* how far the row's coordinate may be from its own settlement */
/* GeoNames files a city and its administrative seat as two rows a kilometre or two apart (Fuzhou
   is three rows). Closer than this, one spelling in one country is one place. */
export const SAME_PLACE_KM = 3;

/** the guard radius in KILOMETRES a row earns, given how far its nearest namesake is.
 *  ⚠ THE ONE PLACE THIS SUM IS WRITTEN. No row can be given a radius that reaches its namesake,
 *  because the radius is not typed anywhere — it is this function of a measured distance. */
export function guardFrom(nearestRivalKm) {
  return Math.min(GUARD_M / 1000, isFinite(nearestRivalKm) ? nearestRivalKm / MARGIN : Infinity);
}

const R = Math.PI / 180;
/** great-circle kilometres */
export function km(aLon, aLat, bLon, bLat) {
  const dLat = (bLat - aLat) * R, dLon = (bLon - aLon) * R;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * R) * Math.cos(bLat * R) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
