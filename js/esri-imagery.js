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
 *  WHY THE KEY IS EMPTY (measured 2026-11-18, dev-notes/2026-11-17-sat-arcgis-3d.md): the keyed service
 *  answers h2 (no 12-socket ceiling), but each tile's round trip from Japan was 5–10× the keyless hosts'
 *  (p50 ~0.36–0.96 s vs ~0.05–0.12 s), and with the worker's withdraw-queue in place the ceiling no
 *  longer dominated — so keyed was SLOWER in every scenario measured (desktop ×1.2, phone up to several ×).
 *  What the key buys is the LICENCE: the keyless endpoint carries none for a commercial app; the Location
 *  Platform terms do (E300 footnotes 16/78/89). Set the key when that is wanted, and re-measure first.
 *  EXPIRY of this choice: a keyed round trip that comes near the keyless one, or a licence requirement.
 *  Billing on the keyed path is PER TILE (2,000,000 free a month, then $0.15 / 1,000 — browser-cache hits
 *  are not counted). Basemap SESSIONS bill only through the Basemap Styles service, not this raster URL.
 *
 *  ⚠ A KEY HERE IS PUBLIC, like CARTO_BASEMAP_KEY in js/carto-basemap.js: a static site hands every tile
 *  URL to the visitor. IntMap's key exists (ArcGIS portal item "IntMap World Imagery (production)":
 *  Public application · no item access · ONE privilege, Basemaps › Basemap styles service
 *  (premium:user:basemaps) · referrer = the production origin (supabase/functions/_shared/site-origin.js) · expires 2027-11-16 23:59 JST).
 *  ⚠ THE REFERRER IS NOT ENFORCED ON TILES — measured 2026-11-18: a fresh z11 tile came back as a JPEG
 *  with a foreign Referer and with none — so a key committed here is usable by anyone who copies it; what
 *  bounds the cost is the account (pay-as-you-go OFF: past the free tier the service refuses, and the
 *  fallback below takes over). That is why the key is not left here while it is not used.
 *
 *  ⚠ A REFUSED KEY MUST NOT BLANK THE MAP. ibasemaps-api answers a missing/expired/over-quota token
 *  with HTTP 200 and a JSON body (`{"error":{"code":499,…}}`, measured with no token), which no
 *  status check sees. `imageryRefused()` is called by the fetchers when a keyed reply is not an
 *  image; from then on this page uses the keyless hosts, and says so once in the console.
 * ==========================================================================*/

/* The ArcGIS Location Platform API key (developer credentials, privilege: basemaps). Empty = keyless. */
const ESRI_IMAGERY_KEY = '';

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
  return keylessTileUrl(z, y, x);
}

/** The keyless URL of a tile, whatever the key — what a refusal falls back to. */
export function keylessTileUrl(z, y, x) {
  return KEYLESS_HOSTS[(x + y) & 1] + KEYLESS_PATH + '/tile/' + z + '/' + y + '/' + x;
}

/** The same as a renderer `tiles` array ({z}/{y}/{x} template, one entry per host). */
export function imageryTiles() {
  if (imageryKeyed()) return [KEYED_SERVICE + '/tile/{z}/{y}/{x}?token=' + encodeURIComponent(ESRI_IMAGERY_KEY)];
  return KEYLESS_HOSTS.map((h) => h + KEYLESS_PATH + '/tile/{z}/{y}/{x}');
}

/* ══ ESRI'S «MAP DATA NOT YET AVAILABLE» TILE IS ONE FIXED IMAGE — RECOGNISED BY ITS BYTES, NOT ITS SIZE ══════════
   Past its coverage World_Imagery answers HTTP 200 with a grey tile (js/sat-proto.js and src/sat-worker.js replace it with
   a cropped real ancestor). It used to be recognised as «any tile of 3,500 bytes or less», and that is not a property of
   the placeholder: a REAL tile of uniform deep sea is as small. MEASURED 2026-11-18 east of Japan at z7: 7/49/116 is
   2,925 B and 7/50/116 3,065 B — so real sea was taken for the placeholder, replaced by an up-scaled crop of a lower zoom
   whose tone differs, and the ocean showed tile-sized squares.
   OBSERVED (2026-11-18, both keyless hosts, six places past coverage — Pacific z19, Atlantic z18, South Pacific z17,
   Southern Ocean z19, Sahara z19, Antarctica z19): every one is the same 2,521-byte JPEG, FNV-1a 0x92d9118f.
   EXPIRES when Esri changes that image: nothing is recognised then and the grey tile shows past coverage again (no
   real imagery is ever replaced). tests/prod-smoke.spec.js fetches a past-coverage tile and a small real sea tile
   and checks both answers, so the change is seen rather than discovered. The keyed service (unused) is not measured. */
const PLACEHOLDER_BYTES = 2521, PLACEHOLDER_FNV1A = 0x92d9118f;

/** true when `buf` (ArrayBuffer or Uint8Array) is exactly Esri's «no imagery here» tile */
export function isImageryPlaceholder(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.byteLength !== PLACEHOLDER_BYTES) return false;
  let h = 0x811c9dc5;
  for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h === PLACEHOLDER_FNV1A;
}

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
   kept here. IMAGERY_SOURCES_SEEN is what that field said when read (2026-11-18, the keyed endpoint
   `?f=json`); it is shown only until the live value arrives, or if it cannot be read. */
const IMAGERY_SOURCES_SEEN = 'Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community';
let sourcesLive = null, sourcesAsked = null;

/** The provider list as the service states it now (falls back to the last value seen). */
export function imagerySources() { return sourcesLive || IMAGERY_SOURCES_SEEN; }

/* HOW the page reads JSON (the fetch clock, js/fetch-deadline.js + js/proxy-fetch.js) is handed in by
   js/app-body.js, which already has both. Not imported here: src/sat-worker.js imports this module, and a
   dynamic import of those two split them out of the boot chunk into two extra boot requests (measured:
   eager.requests 9 → 11). */
let readMeta = null;
export function useImageryMetaReader(fn) { readMeta = typeof fn === 'function' ? fn : null; }

/** Ask the service for its copyrightText once; `onChange` runs if it differs from what is shown. */
export function refreshImagerySources(onChange) {
  if (sourcesAsked) return sourcesAsked;
  const meta = imageryKeyed()
    ? KEYED_SERVICE + '?f=json&token=' + encodeURIComponent(ESRI_IMAGERY_KEY)
    : KEYLESS_HOSTS[0] + KEYLESS_PATH + '?f=json';
  if (!readMeta) return Promise.resolve();   /* no reader handed in (a worker, a check): the last value seen stays */
  sourcesAsked = Promise.resolve().then(() => readMeta(meta))
    .then((j) => {
      const t = j && typeof j.copyrightText === 'string' ? j.copyrightText.replace(/^\s*Source[s]?:\s*/i, '').trim() : '';
      if (t && t !== imagerySources()) { sourcesLive = t; if (typeof onChange === 'function') onChange(t); }
      else if (t) sourcesLive = t;
    })
    .catch(() => { /* the last value seen stays on screen */ });
  return sourcesAsked;
}

/* ══ WHEN AND HOW SHARP IS THE PICTURE UNDER A POINT ═════════════════════════════════════════════════
   World Imagery's «Citations» sublayer (id 4 of the MapServer, measured 2026-11-20 on the keyless host; the keyed service
   lists the same layers) answers a point query with the capture date and ground resolution of each footprint there:
   Tokyo → {SRC_DATE:20260116, SRC_RES:0.34, NICE_NAME:'Vivid Advanced'} and a 15 m TerraColor row with no date. The sharpest
   dated row is what the tile shows at high zoom. One answer per 0.01° cell is kept (a footprint is far larger). */
const captureCache = new Map();
/** {date:'YYYYMMDD', resolutionM, product} for the sharpest dated footprint at the point, or null when it cannot be read. */
export function imageryCaptureAt(lng, lat) {
  if (!readMeta || !isFinite(lng) || !isFinite(lat)) return Promise.resolve(null);
  const key = Math.round(lng * 100) + ',' + Math.round(lat * 100);
  if (captureCache.has(key)) return captureCache.get(key);
  const base = imageryKeyed() ? KEYED_SERVICE : KEYLESS_HOSTS[0] + KEYLESS_PATH;
  const url = base + '/4/query?f=json&geometry=' + lng.toFixed(5) + ',' + lat.toFixed(5)
    + '&geometryType=esriGeometryPoint&inSR=4326&outFields=SRC_DATE,SRC_RES,SRC_DESC,NICE_NAME&returnGeometry=false'
    + (imageryKeyed() ? '&token=' + encodeURIComponent(ESRI_IMAGERY_KEY) : '');
  const p = Promise.resolve().then(() => readMeta(url)).then((j) => {
    const rows = ((j && j.features) || []).map((f) => f.attributes || {}).filter((a) => a.SRC_DATE != null && a.SRC_RES != null);
    if (!rows.length) return null;
    rows.sort((a, b) => a.SRC_RES - b.SRC_RES);
    const a = rows[0];
    return { date: String(a.SRC_DATE), resolutionM: +a.SRC_RES, product: a.NICE_NAME || a.SRC_DESC || '' };
  }).catch(() => { captureCache.delete(key); return null; });
  captureCache.set(key, p);
  return p;
}
