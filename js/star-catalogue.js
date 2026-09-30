// @ts-check
/* ============================================================================
 *  IntMap · THE STAR CATALOGUE, READ ONCE — data/stars.bin  (startup-lazy-layers)
 * ----------------------------------------------------------------------------
 *  Two views draw the same Hipparcos catalogue (scripts/build-star-catalogue.mjs): the sky behind
 *  the dark globe (js/space-sky.js, all ~99,000 stars on a canvas) and the space explorer
 *  (js/space.js, the naked-eye subset as WebGL points at their measured distances). Until this file
 *  each of them fetched data/stars.bin (791 kB) itself and walked its bytes with its own copy of the
 *  header rule — two requests and two decoders for one file, and two places the IMSTAR1/IMSTAR2
 *  stride had to be kept right.
 *
 *  Now the BYTES come through js/data-door.js (`as:'arrayBuffer'` — one read per file, shared by
 *  every caller while somebody holds it) and the RECORD LAYOUT is decoded here, once, into plain
 *  columns in physical units. Each view derives its own form from those columns (colours, sizes,
 *  unit vectors), because those forms genuinely differ; what must not differ — where a star is, how
 *  bright it is, and how far — is answered in one place.
 *
 *  THE FORMAT (the build script is the canonical writer):
 *    bytes 0–6  magic 'IMSTAR1' | 'IMSTAR2'   byte 7 reserved   bytes 8–11 count (uint32 LE)
 *    then one record per star, 6 bytes (IMSTAR1) or 8 bytes (IMSTAR2):
 *      uint16 RA × 360/65536 °   int16 Dec × 90/32767 °   uint8 (V + 2) × 20   int8 (B−V) × 50
 *      [IMSTAR2] uint16 parallax in mas × 10 — 0 MEANS «not measured well enough», not «at the origin»
 *  ⚠ THE STRIDE COMES FROM THE MAGIC. A reader that hard-codes either size turns the sky to noise the
 *  day the catalogue is rebuilt in the other format.
 * ==========================================================================*/
/* ⚠ THE DOOR IS REACHED THROUGH window.IntMapDataDoor, NOT BY `import`. This file is shared by an eager module
   (js/space-sky.js) and a lazy one (js/space.js); a static import from it to js/data-door.js — another module
   main shares with lazy chunks — is the edge vite.config.js (fetch-deadline-layer) measured: Rolldown then
   cannot fold every shared module back into main, and MEASURED on this change it left js/fetch-deadline.js and
   js/proxy-fetch.js as two extra startup requests (eager chunks 7 → 9). js/data-door.js publishes the same
   one instance on window for exactly this kind of reader. */
/** @type {(url: string, opts: { as: string }) => Promise<any>} */
const loadData = (url, opts) => /** @type {any} */ (window).IntMapDataDoor.load(url, opts);

/**
 * @typedef {{ n: number, format: string, ra: Float32Array, dec: Float32Array, mag: Float32Array,
 *   bv: Float32Array, plxMas: Float32Array|null }} StarCatalogue
 */

/** Decode the bytes of data/stars.bin into columns (degrees, V magnitude, B−V, parallax in mas).
 *  @param {ArrayBuffer} buf  @returns {StarCatalogue} */
export function decodeStarCatalogue(buf) {
  const dv = new DataView(buf);
  let magic = ''; for (let i = 0; i < 7; i++) magic += String.fromCharCode(dv.getUint8(i));
  if (magic !== 'IMSTAR1' && magic !== 'IMSTAR2') throw new Error('bad catalog header');
  const STRIDE = (magic === 'IMSTAR2') ? 8 : 6;
  const n = dv.getUint32(8, true);
  if (buf.byteLength < 12 + n * STRIDE) throw new Error('truncated catalog: ' + buf.byteLength + ' bytes for ' + n + ' stars');
  const ra = new Float32Array(n), dec = new Float32Array(n), mag = new Float32Array(n), bv = new Float32Array(n);
  const plxMas = STRIDE === 8 ? new Float32Array(n) : null;
  for (let i = 0; i < n; i++) {
    const o = 12 + i * STRIDE;
    ra[i] = dv.getUint16(o, true) * 360 / 65536;
    dec[i] = dv.getInt16(o + 2, true) * 90 / 32767;
    mag[i] = dv.getUint8(o + 4) / 20 - 2;
    bv[i] = dv.getInt8(o + 5) / 50;
    if (plxMas) plxMas[i] = dv.getUint16(o + 6, true) / 10;
  }
  return { n, format: magic, ra, dec, mag, bv, plxMas };
}

/* One decode per read. The columns are held through a WeakRef for the same reason js/data-door.js
   holds its values that way: each view keeps the form it derived, and pinning the columns here as
   well would keep a second copy of the catalogue alive for the life of the tab. */
/** @type {Promise<StarCatalogue>|null} */ let inFlight = null;
/** @type {WeakRef<StarCatalogue>|null} */ let held = null;

/** The catalogue, read through the data door and decoded once while anyone holds it.
 *  A failed read is not kept — the next call reads again (js/data-door.js §「A FAILURE IS NOT KEPT」).
 *  @returns {Promise<StarCatalogue>} */
export function loadStarCatalogue() {
  const have = held && held.deref();
  if (have) return Promise.resolve(have);
  if (inFlight) return inFlight;
  const p = loadData('data/stars.bin', { as: 'arrayBuffer' })
    .then((buf) => {
      const cat = decodeStarCatalogue(/** @type {ArrayBuffer} */ (buf));
      held = typeof WeakRef === 'function' ? new WeakRef(cat) : null;
      if (inFlight === p) inFlight = null;
      return cat;
    }, (e) => { if (inFlight === p) inFlight = null; throw e; });
  inFlight = p;
  return p;
}
