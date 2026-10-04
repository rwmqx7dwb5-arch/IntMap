/* ============================================================================
 *  IntMap · test helper — THE NATURAL EARTH COUNTRY FILES, AS THE PAGE READS THEM (wave3-nightly-root)
 * ----------------------------------------------------------------------------
 *  Shared by tests/r168.spec.js (a two-country stand-in) and tests/r410-late.spec.js (the real file,
 *  held back). Both used to route a regular expression that spelled the URL of the day —
 *  `/natural-earth-vector.*admin_0_countries\.geojson/` and `/ne_\d+m_admin_0_countries\.geojson/`, the
 *  jsDelivr `@master` files. mobile-performance (#903) moved the three scales to this site
 *  (data/ne-countries/ne_<scale>_admin_0_countries.json.gz, delta-encoded, inflated by the data door),
 *  and from that day neither route matched anything: r168 #8 parsed the 258 real countries instead of
 *  its 2, and r410-late's «held» route held nothing (`delayed` 0) — MEASURED on the nightly deep tier
 *  2026-10-02 and 2026-10-03 (run 37150910390).
 *
 *  ⚠ SO NOTHING HERE SPELLS THE PATH OR THE FORMAT. The path is `neCountriesPath(scale)` for every
 *  scale in `NE_SCALES`, and a stand-in body is `encodeNECountries(fc)` gzipped — the same module the
 *  page imports to read them (js/ne-countries.js), so the next move of the file moves this with it.
 * ==========================================================================*/
import { gzipSync } from 'node:zlib';
import { NE_SCALES, neCountriesPath, encodeNECountries } from '../../js/ne-countries.js';

/** the site paths the page reads the country table from, one per scale */
export const neCountriesPaths = () => NE_SCALES.map(neCountriesPath);

/** a Playwright URL predicate: true for any of those files, on any origin the page is served from */
export const isNECountriesUrl = (u) => {
  const path = (u instanceof URL ? u : new URL(String(u))).pathname;
  return neCountriesPaths().some((p) => path.endsWith('/' + p));
};

/** route every scale to a stand-in FeatureCollection, in the shipped form (encoded, gzipped) */
export async function routeNECountries(target, fc) {
  const body = gzipSync(Buffer.from(JSON.stringify(encodeNECountries(fc))));
  await target.route(isNECountriesUrl, (route) => route.fulfill({ status: 200, contentType: 'application/gzip', body }));
}
