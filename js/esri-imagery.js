/* ============================================================================
 *  Esri World Imagery — WHERE the satellite tiles come from, in one place.
 * ----------------------------------------------------------------------------
 *  Every reader of World Imagery (the satellite base through js/sat-proto.js and src/sat-worker.js,
 *  the provider list in js/tables.js, the compare view, the flight-sim minimap) builds its URL here.
 *  Before this file each one carried its own copy of the two arcgisonline hosts.
 *
 *  TWO SOURCES, ONE SWITCH — `ESRI_IMAGERY_KEY` below.
 *   · empty  → the keyless hosts server./services.arcgisonline.com (what the app has always used).
 *   · a key  → ArcGIS Location Platform, `ibasemaps-api.arcgis.com` with `?token=` (same tiles,
 *              same {z}/{y}/{x}, same 256 px JPEG — Esri's basemap service list,
 *              https://developers.arcgis.com/rest/basemap-styles/service-data/).
 *
 *  WHY THE KEYED SOURCE (measured 2026-11-17, dev-notes/2026-11-17-sat-arcgis-3d.md):
 *   ① the keyless hosts answer HTTP/1.1 only (`nextHopProtocol`), so the whole satellite layer has
 *     12 sockets; 54–91 % of the wait before a pitched 3-D view turns sharp was queueing for them.
 *     ibasemaps-api answers h2 — one connection, no 12-socket ceiling.
 *   ② the keyless endpoint carries no licence for a commercial app; the Location Platform terms do
 *     (E300 footnotes 16/78/89: revenue apps must authenticate).
 *  Billing on this path is PER TILE (2,000,000 free a month, then $0.15 / 1,000 — browser-cache hits
 *  are not counted). Basemap SESSIONS bill only through the Basemap Styles service, not this raster URL.
 *
 *  ⚠ THE KEY IS PUBLIC ON PURPOSE, like CARTO_BASEMAP_KEY in js/carto-basemap.js: a static site hands
 *  every tile URL to the visitor. What protects it is the key's own settings in the ArcGIS portal —
 *  allowed referrers = the production origin, privilege = basemaps only, an expiry ≤ 1 year — and
 *  leaving pay-as-you-go OFF until it is wanted (then the service stops at the free tier instead of
 *  billing; there is no spending cap otherwise). Rotating it is the one line below and nothing else.
 *
 *  ⚠ A REFUSED KEY MUST NOT BLANK THE MAP. ibasemaps-api answers a missing/expired/over-quota token
 *  with HTTP 200 and a JSON body (`{"error":{"code":499,…}}`, measured with no token), which no
 *  status check sees. `imageryRefused()` is called by the fetchers when a keyed reply is not an
 *  image; from then on this page uses the keyless hosts, and says so once in the console.
 * ==========================================================================*/

/* The ArcGIS Location Platform API key (developer credentials, privilege: basemaps). Empty = keyless. */
export const ESRI_IMAGERY_KEY = '';

const KEYLESS_HOSTS = ['https://server.arcgisonline.com', 'https://services.arcgisonline.com'];
const KEYLESS_PATH = '/ArcGIS/rest/services/World_Imagery/MapServer';
const KEYED_SERVICE = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer';

let refused = false;

/** true while tiles come from the keyed (Location Platform) service */
export function imageryKeyed() { return !!ESRI_IMAGERY_KEY && !refused; }

/** The keyed service declined (non-image reply). Fall back to the keyless hosts for this page. */
export function imageryRefused(why) {
  if (refused || !ESRI_IMAGERY_KEY) return;
  refused = true;
  try { console.warn('[IntMap] Esri World Imagery: the keyed service refused (' + (why || 'non-image reply') + '); using the keyless hosts for this page.'); } catch (_) { /* console may be absent in a worker */ }
}

/** One tile URL. `x+y` parity spreads the keyless path across its two hosts (each has its own 6 sockets). */
export function imageryTileUrl(z, y, x) {
  if (imageryKeyed()) return KEYED_SERVICE + '/tile/' + z + '/' + y + '/' + x + '?token=' + encodeURIComponent(ESRI_IMAGERY_KEY);
  return KEYLESS_HOSTS[(x + y) & 1] + KEYLESS_PATH + '/tile/' + z + '/' + y + '/' + x;
}

/** The same as a renderer `tiles` array ({z}/{y}/{x} template, one entry per host). */
export function imageryTiles() {
  if (imageryKeyed()) return [KEYED_SERVICE + '/tile/{z}/{y}/{x}?token=' + encodeURIComponent(ESRI_IMAGERY_KEY)];
  return KEYLESS_HOSTS.map((h) => h + KEYLESS_PATH + '/tile/{z}/{y}/{x}');
}

/** The hosts a tile may come from (the service worker and the outbound-host ledger read this). */
export const IMAGERY_HOSTS = ['ibasemaps-api.arcgis.com', 'server.arcgisonline.com', 'services.arcgisonline.com'];

/** A reply is imagery when the server says image/*. The refusal comes back 200 text/plain JSON. */
export function isImageryReply(res) {
  const t = (res && res.headers && res.headers.get && res.headers.get('content-type')) || '';
  return /^image\//i.test(t);
}

/* ══ THE CREDIT ═════════════════════════════════════════════════════════════════════════════════
   Esri's attribution rules for interactive maps
   (https://developers.arcgis.com/documentation/esri-and-data-attribution/interactive-maps/):
   "Powered by Esri" visible on the map, and the data providers as "Sources: …", taken from the
   service's `copyrightText` — which changes over time, so it is read from the service rather than
   kept here. IMAGERY_SOURCES_SEEN is what that field said when read (2026-11-17, keyless endpoint
   `?f=json`); it is shown only until the live value arrives, or if it cannot be read. */
const IMAGERY_SOURCES_SEEN = 'Esri, Vantor, Earthstar Geographics, and the GIS User Community';
let sourcesLive = null, sourcesAsked = null;

/** The provider list as the service states it now (falls back to the last value seen). */
export function imagerySources() { return sourcesLive || IMAGERY_SOURCES_SEEN; }

/** Ask the service for its copyrightText once; `onChange` runs if it differs from what is shown. */
export function refreshImagerySources(onChange) {
  if (sourcesAsked) return sourcesAsked;
  const meta = imageryKeyed()
    ? KEYED_SERVICE + '?f=json&token=' + encodeURIComponent(ESRI_IMAGERY_KEY)
    : KEYLESS_HOSTS[0] + KEYLESS_PATH + '?f=json';
  /* read lazily: this module is also imported by src/sat-worker.js, which must not pull the page's
     fetch clock in; the credit is only ever refreshed on the page */
  sourcesAsked = Promise.all([import('./fetch-deadline.js'), import('./proxy-fetch.js')])
    .then(([{ jsonWithin }, { clockFor }]) => jsonWithin(meta, clockFor(meta)))
    .then((j) => {
      const t = j && typeof j.copyrightText === 'string' ? j.copyrightText.replace(/^\s*Source[s]?:\s*/i, '').trim() : '';
      if (t && t !== imagerySources()) { sourcesLive = t; if (typeof onChange === 'function') onChange(t); }
      else if (t) sourcesLive = t;
    })
    .catch(() => { /* the last value seen stays on screen */ });
  return sourcesAsked;
}
