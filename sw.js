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
const MAX_ENTRIES = 4000;          // ~tiles kept on disk (trimmed oldest-first)
const TRIM_TO = 3400;              // trim down to this when the cap is hit

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
];
function isTileRequest(url) {
  let h;
  try { h = new URL(url).hostname; } catch { return false; }
  return TILE_HOSTS.some((t) => h === t || h.endsWith('.' + t) || h.endsWith(t));
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // drop older cache versions
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('intmap-tiles-') && k !== CACHE).map((k) => caches.delete(k)));
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
    await Promise.all(d.urls.slice(0, 64).map(async (u) => {
      try {
        if (await cache.match(u)) return;
        const res = await fetch(u, { mode: 'cors' });
        if (res && res.ok && (res.type === 'cors' || res.type === 'basic')) await cache.put(u, res.clone());
      } catch (_) {}
    }));
    trim(cache);
  })());
});
