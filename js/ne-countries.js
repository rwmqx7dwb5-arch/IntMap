/* ============================================================================
 *  IntMap · NATURAL EARTH ADMIN-0, SERVED FROM THIS SITE — window.__imNECountries  (mobile-performance)
 * ----------------------------------------------------------------------------
 *  The country table, its outlines and the country hit-test (js/countries-ui.js) and the projection
 *  viewer (js/map-tools.js) read Natural Earth's admin-0 countries at three scales. They used to read
 *  them from a third-party CDN at `@master` — a branch, not a version — so what a reader received
 *  was whatever that branch said on the day, from a host this site does not answer for, and the
 *  10 m file was 4.34 MB on the wire (MEASURED in production, 2026-10-02, the one request a phone
 *  made when the camera zoomed in).
 *
 *  Now scripts/build-ne-countries.mjs reads the three files at ONE PINNED COMMIT of
 *  nvkelso/natural-earth-vector and writes them to data/ne-countries/, in a form that is LOSSLESS
 *  and smaller:
 *    · every property of every feature, verbatim (Natural Earth keeps one attribute table across
 *      scales, and readers of `countryGeo` read many of its columns);
 *    · every coordinate, as integer micro-degrees DELTA-ENCODED along its ring. Natural Earth writes
 *      six decimals at most (measured on all three files), so `n / 1e6` gives back the exact
 *      double the upstream JSON parses to — the builder's --check asserts it for every vertex.
 *  MEASURED (gzip -9): 110 m 209 kB → see dev-notes; 10 m 4,723 kB → ~2.7 MB, the geometry half
 *  alone 2,598 kB against the text form's ~3.9 MB.
 *
 *  `decode()` turns a file back into the FeatureCollection the upstream file parses to — deep-equal,
 *  key order included — so nothing downstream can tell where it came from. ⚠ THE DECODE IS SLICED
 *  (`decodeAsync`): 548,471 vertices of 10 m built as one loop are a long task on a phone; the
 *  reader gives the thread back between features.
 *
 *  Its readers (js/countries-ui.js, js/map-tools.js) IMPORT it — nothing is published on window.
 * ==========================================================================*/

import { loadData } from './data-door.js';   /* the one reader of data/ — inflate and parse off the page's thread */

export const NE_SCALES = ['110m', '50m', '10m'];
export const NE_FORMAT = 'IntMapNECountries';

/** the site path of one scale's file */
export function neCountriesPath(scale) { return 'data/ne-countries/ne_' + scale + '_admin_0_countries.json.gz'; }

/* one ring: flat [dx0,dy0,dx1,dy1,…] integer deltas → [[x,y],…] */
function ringOf(flat, q) {
  const out = new Array(flat.length >> 1);
  let x = 0, y = 0;
  for (let i = 0, k = 0; i < flat.length; i += 2, k++) { x += flat[i]; y += flat[i + 1]; out[k] = [x / q, y / q]; }
  return out;
}
function geometryOf(f, q) {
  const polys = f.c.map((poly) => poly.map((r) => ringOf(r, q)));
  const g = { type: f.t, coordinates: f.t === 'Polygon' ? polys[0] : polys };
  return g;
}
function featureOf(f, q) {
  /* the upstream key order: type, properties, (bbox / id / anything else the file carried), geometry */
  const o = { type: 'Feature', properties: f.p };
  if (f.x) for (const k of Object.keys(f.x)) o[k] = f.x[k];
  o.geometry = (f.t === null || f.c === null) ? null : geometryOf(f, q);
  return o;
}
function check(doc) {
  if (!doc || doc.type !== NE_FORMAT || !Array.isArray(doc.features) || !(doc.q > 0)) {
    const e = new Error('not an ' + NE_FORMAT + ' file'); e.reason = 'parse'; throw e;
  }
}
function collection(doc, features) {
  const o = { type: 'FeatureCollection' };
  if (doc.head) for (const k of Object.keys(doc.head)) o[k] = doc.head[k];
  o.features = features;
  return o;
}

/** decode(doc) → the upstream FeatureCollection (synchronous; fine for 110 m / 50 m) */
export function decodeNECountries(doc) {
  check(doc);
  return collection(doc, doc.features.map((f) => featureOf(f, doc.q)));
}

/** decodeAsync(doc) → the same, giving the main thread back every few thousand vertices */
export async function decodeNECountriesAsync(doc, budgetVerts) {
  check(doc);
  const per = budgetVerts > 0 ? budgetVerts : 20000;
  const out = []; let n = 0;
  const pause = () => new Promise((r) => {
    try { const S = globalThis.scheduler; if (S && typeof S.yield === 'function') { S.yield().then(r, r); return; } } catch (_) { }
    setTimeout(r, 0);
  });
  for (const f of doc.features) {
    out.push(featureOf(f, doc.q));
    if (f.c) for (const poly of f.c) for (const r of poly) n += r.length >> 1;
    if (n >= per) { n = 0; await pause(); }
  }
  return collection(doc, out);
}

/** encode(fc, meta) → the shipped form (the builder's half; here so that one file owns both). */
export function encodeNECountries(fc, meta) {
  const q = 1e6;
  const head = {};
  for (const k of Object.keys(fc)) if (k !== 'type' && k !== 'features') head[k] = fc[k];
  const enc = (ring) => {
    const flat = new Array(ring.length * 2); let px = 0, py = 0;
    for (let i = 0; i < ring.length; i++) {
      const X = Math.round(ring[i][0] * q), Y = Math.round(ring[i][1] * q);
      flat[2 * i] = X - px; flat[2 * i + 1] = Y - py; px = X; py = Y;
    }
    return flat;
  };
  const features = fc.features.map((f) => {
    const x = {};
    for (const k of Object.keys(f)) if (k !== 'type' && k !== 'properties' && k !== 'geometry') x[k] = f[k];
    const g = f.geometry;
    const t = g ? g.type : null;
    const c = !g ? null : (t === 'Polygon' ? [g.coordinates.map(enc)] : g.coordinates.map((p) => p.map(enc)));
    const o = { p: f.properties, t, c };
    if (Object.keys(x).length) o.x = x;
    return o;
  });
  return Object.assign({ type: NE_FORMAT, v: 1 }, meta || {}, { q, head, features });
}

/* ── the page's door ── */
/** loadNECountries(scale) → the decoded FeatureCollection, read through js/data-door.js */
export function loadNECountries(scale, opts) {
  const big = scale === '10m';
  /* the HTTP cache's own rules: the name is not content-hashed, so a rebuild must be able to reach a returning reader */
  return loadData(neCountriesPath(scale), (opts && opts.cache) ? { as: 'json', cache: opts.cache } : { as: 'json' })
    .then((doc) => (big ? decodeNECountriesAsync(doc) : decodeNECountries(doc)));
}
