// @ts-check
/* ============================================================================
 *  IntMap · js/geoid.js — the EGM2008 geoid undulation N anywhere on Earth (metres above the WGS84 ellipsoid)
 * ----------------------------------------------------------------------------
 *  The globe's ground is a sea-level DEM; 3D building tilesets from outside Japan state heights above the ellipsoid.
 *  The difference is N (-107..+86 m). data/geoid-egm2008.bin.gz is derived by scripts/build-geoid-grid.mjs (0.5-degree
 *  grid, Int16 centimetres; mean error 0.10 m, max 3.87 m against the 5' source). Bilinear here.
 *  Japan's PLATEAU keeps its own GSI figure per city (js/plateau-cities.js) — better than this grid where it applies.
 *  EXPIRES with a user of this that needs better than ~1 m: rebuild with a finer stride.
 * ==========================================================================*/
import { loadData } from './data-door.js';

export const GEOID_COLS = 720, GEOID_ROWS = 361;
const GEOID_STEP = 0.5;

/** @param {ArrayBuffer|ArrayBufferView} buf  the inflated grid: GEOID_ROWS x GEOID_COLS Int16LE centimetres, row 0 = 90N, col 0 = 0E */
export function mountGeoid(buf) {
  const bytes = ArrayBuffer.isView(buf) ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
  if (bytes.byteLength !== GEOID_COLS * GEOID_ROWS * 2) throw new Error('geoid grid has ' + bytes.byteLength + ' bytes, expected ' + GEOID_COLS * GEOID_ROWS * 2);
  const g = new Int16Array(GEOID_COLS * GEOID_ROWS);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);      /* explicit little-endian: not the host's */
  for (let i = 0; i < g.length; i++) g[i] = dv.getInt16(2 * i, true);
  /** @param {number} lng @param {number} lat @returns {number} N in metres */
  return (lng, lat) => {
    const y = (90 - Math.max(-90, Math.min(90, lat))) / GEOID_STEP, x = (((lng % 360) + 360) % 360) / GEOID_STEP;
    const r0 = Math.min(GEOID_ROWS - 2, Math.floor(y)), c0 = Math.floor(x) % GEOID_COLS, fy = y - r0, fx = x - Math.floor(x), c1 = (c0 + 1) % GEOID_COLS;
    const a = g[r0 * GEOID_COLS + c0], b = g[r0 * GEOID_COLS + c1], c = g[(r0 + 1) * GEOID_COLS + c0], d = g[(r0 + 1) * GEOID_COLS + c1];
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy) / 100;
  };
}

/** @type {Promise<(lng:number,lat:number)=>number>|null} */
let _geoid = null;
/** the world geoid, read once on first use (only the layers that need it ask: nothing is fetched until a worldwide tileset opens) */
export function loadGeoid(url = 'data/geoid-egm2008.bin.gz') {
  if (!_geoid) _geoid = Promise.resolve(loadData(url, { as: 'arrayBuffer' })).then(mountGeoid).catch((e) => { _geoid = null; throw e; });
  return _geoid;
}
