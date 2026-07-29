/* ============================================================================
 *  IntMap · Service Worker — persistent map-tile cache
 * ----------------------------------------------------------------------------
 *  Caches satellite / basemap / DEM tiles in the Cache Storage API (disk-backed,
 *  survives reloads and browser restarts) so returning to an area you've already
 *  viewed is drawn from cache with ZERO network. Quality is untouched — these are
 *  the exact same tile URLs, just served locally on a hit.
 *
 *  Strategy: cache-first for known tile hosts (imagery tiles are immutable per
 *  z/x/y, and dated/satellite URLs carry the date, so a cache hit is always valid).
 *  Only CORS-clean responses are stored, so MapLibre can still render them to WebGL
 *  without tainting the canvas. A soft LRU cap keeps the cache from growing forever.
 * ========================================================================== */
const CACHE = 'intmap-tiles-v1';
/* (#R178) 4000 → 12000. The cap is what makes a REVISIT free, and 4000 was set before the DEM
   reached terrarium's native z15 (#R20) and before 3-D became a normal way to use the app: one
   tilted city view at z15 is already several hundred DEM tiles on top of its imagery, so a session
   that visits three or four places evicts the first one before you go back to it. Cache Storage is
   disk-backed and the browser evicts under real pressure anyway, so the cost of a high cap is
   bookkeeping, not memory. */
const MAX_ENTRIES = 12000;         // ~tiles kept on disk (trimmed oldest-first)
const TRIM_TO = 10200;             // trim down to this when the cap is hit

/* Hosts whose responses are immutable tiles worth caching aggressively. */
const TILE_HOSTS = [
  'server.arcgisonline.com',          // Esri World Imagery + reference labels
  'services.arcgisonline.com',
  'gibs.earthdata.nasa.gov',          // NASA GIBS (MODIS / VIIRS / overlays)
  'tiles.maps.eox.at',                // Sentinel-2 cloudless
  'api.mapbox.com',                   // Mapbox Satellite (BYOK)
  'services.sentinel-hub.com',        // Sentinel Hub (BYOK)
  'basemaps.cartocdn.com',            // light/dark basemaps (a/b/c/d subdomains)
  'elevation-tiles-prod.s3.amazonaws.com', // terrarium DEM (instant elevation/depth)
  'wmts.terrascope.be',               // (#R17) ESA WorldCover land-cover — single slow host, so cache hard → instant on revisit
  'tiles.openfreemap.org',            // (#R17) vector place labels — cache so labels snap in on revisit
];
/* (#R178) …and some tile sets are identified by PATH, not by host. The terrarium DEM is served from
   FIVE S3 aliases (#R7 round-robins them so the browser opens five connection pools instead of one),
   and MapLibre picks the alias per tile as (x+y) % 5 — deterministically. Only ONE of those five
   spellings was in the host list, so measured, FOUR OUT OF FIVE DEM TILES BYPASSED THIS CACHE
   ENTIRELY and were re-downloaded on every visit:
       s3.amazonaws.com                                        MISSED
       elevation-tiles-prod.s3.amazonaws.com                   cached
       elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com   MISSED
       elevation-tiles-prod.s3.us-east-1.amazonaws.com             MISSED
       s3.dualstack.us-east-1.amazonaws.com                        MISSED
   Matching the PATH fixes every present and future alias at once, and it cannot over-match: nothing
   else in the app requests a URL containing /terrarium/. */
const TILE_PATHS = [
  '/terrarium/',                      // AWS terrarium DEM, whichever S3 alias served it
];
function isTileRequest(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const h = u.hostname;
  if (TILE_HOSTS.some((t) => h === t || h.endsWith('.' + t) || h.endsWith(t))) return true;
  return TILE_PATHS.some((p) => u.pathname.indexOf(p) !== -1);
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop EVERY cache except the current tile cache. This SW only ever caches immutable tiles (never the
    // HTML/app shell), but purging any legacy cache name too guarantees a stale index.html can't survive
    // here and resurface as an "old version" (#R16 先祖返り defence on the hosted path).
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

let _trimming = false;
async function trim(cache) {
  if (_trimming) return;
  _trimming = true;
  try {
    const keys = await cache.keys();               // insertion order (oldest first)
    if (keys.length > MAX_ENTRIES) {
      const remove = keys.slice(0, keys.length - TRIM_TO);
      await Promise.all(remove.map((req) => cache.delete(req)));
    }
  } catch (_) {} finally { _trimming = false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !isTileRequest(req.url)) return;   // let everything else hit the network normally

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;                                          // ZERO network on revisit
    try {
      const res = await fetch(req);
      // Store only CORS-clean, OK responses (so MapLibre can render them to WebGL).
      if (res && res.ok && (res.type === 'cors' || res.type === 'basic' || res.type === 'default')) {
        cache.put(req, res.clone()).then(() => trim(cache)).catch(() => {});
      }
      return res;
    } catch (err) {
      const stale = await cache.match(req, { ignoreVary: true });
      if (stale) return stale;
      throw err;
    }
  })());
});

/* Allow the page's prefetcher to warm the cache directly (postMessage of tile URLs). */
self.addEventListener('message', (event) => {
  const d = event.data;
  if (!d || d.type !== 'prefetch' || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(d.urls.slice(0, 96).map(async (u) => {
      try {
        if (await cache.match(u)) return;
        const res = await fetch(u, { mode: 'cors' });
        if (res && res.ok && (res.type === 'cors' || res.type === 'basic')) await cache.put(u, res.clone());
      } catch (_) {}
    }));
    trim(cache);
  })());
});
