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
/* ══ ⚠⚠ (#R224) A CACHE-FIRST STORE WITH NO EXPIRY AND NO VERSION CANNOT HEAL ═══════════════════════
 *  「キャッシュの残っているブラウザで開くと、地図が全くちゃんと表示されない」——報告は二つの症状で、
 *  どちらもこの一行の帰結だった：**衛星画像がぼやける**（低解像度のまま）と、**地名・国境・道路の
 *  ラベルが出ない**。
 *
 *  ① ESRI の「まだ画像がありません」タイルは HTTP 200 で返る。約 2,521 バイトの灰色 JPEG で、
 *     js/sat-proto.js はそれを本文サイズで見分けている（_SAT_PLACEHOLDER_MAX = 3500）。
 *     ここは cache-first・無期限なので、**一度でも placeholder を掴んだ z/x/y は永久に placeholder**
 *     になる。そして sat-proto はそれを見て「この近傍は画像がここで終わる」(`_satNoteStop`) と学習し、
 *     **@2x のステッチをまるごと諦める** — すなわちその区画は半分の解像度で描かれ続ける。これが
 *     「ぼやけている」の機構であり、Esri が後日その区画を公開しても**そのブラウザにだけは永久に届かない**。
 *  ② 同じ理由で、`tiles.openfreemap.org` のベクタタイルとグリフも一度壊れた本文を掴めば固定される。
 *     ラベル・国境・道路はすべてそのソースから来るので、まとめて消える。どちらの症状も
 *     「キャッシュが残っているブラウザだけ」で起き、リロードでは治らない——報告のとおり。
 *
 *  だから三つ直す。**名前のバージョンを上げる**（activate が古いキャッシュを消すので、既存の汚染は
 *  全端末で次の訪問に自動で流れる）、**placeholder は保存しない**、**保存に時刻を書いて期限を持たせる**
 *  （期限切れはまず古い方を返してから裏で取り直す＝再訪の速さは一切失わない）。 */
const CACHE = 'intmap-tiles-v2';
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

/* ══ (#R224) WHAT MAY GO STALE, AND HOW STALE ═══════════════════════════════════════════════════════
   A z/x/y of Esri imagery or of the terrarium DEM is the same picture next year; a vector tile of
   OpenMapTiles is REGENERATED from OSM every few weeks, and a Carto raster style is re-rendered when
   the style changes. Both were kept for ever, which is why a browser could be left holding a copy of
   the label tiles that no longer parses against the glyphs it also holds.
   ⚠ THE TTL IS NOT AN EVICTION. Past it the cached answer is still returned IMMEDIATELY — the revisit
   stays a zero-latency cache hit, which is this whole file's reason to exist — and the refresh happens
   behind it (stale-while-revalidate). So the only thing the number changes is how long a poisoned or
   superseded tile can survive, never how fast the map draws. */
const DAY = 86400e3;
const REFRESHABLE = ['tiles.openfreemap.org', 'basemaps.cartocdn.com'];   /* re-rendered upstream */
function maxAgeFor(url) {
  try { const h = new URL(url).hostname;
    if (REFRESHABLE.some((t) => h === t || h.endsWith('.' + t) || h.endsWith(t))) return 7 * DAY;
  } catch (_) {}
  return 60 * DAY;                       /* immutable imagery/DEM — long, but never infinite */
}

/* ⚠ (#R224) THE ONE RESPONSE THIS FILE MUST NOT KEEP. Esri answers "no imagery here yet" with an
   HTTP 200 grey JPEG of ~2,521 bytes, and js/sat-proto.js identifies it by exactly that: a body at or
   under _SAT_PLACEHOLDER_MAX (3,500 B). Storing it for ever pins a neighbourhood at half resolution
   for the life of the browser profile (see the note on CACHE above), so it is the one thing that is
   fetched fresh every session. It is 2.5 kB and sat-proto already dedupes it in memory for the
   session, so refusing to store it costs one small request and buys the ability to heal.
   ⚠ Kept deliberately narrow — ONLY the imagery hosts, and only a body small enough that it cannot be
   a real tile (real World_Imagery is ≥ ~8 kB). Nothing else in the list has a 200-with-no-content. */
const SAT_PLACEHOLDER_MAX = 3500;
function isPlaceholder(url, res) {
  try {
    if (!/arcgisonline\.com$/.test(new URL(url).hostname)) return false;
    const n = +res.headers.get('content-length');
    return isFinite(n) && n > 0 && n <= SAT_PLACEHOLDER_MAX;
  } catch (_) { return false; }
}

/* Store with the time it was stored. The header has to be ADDED, which means rebuilding the response
   — the body is read either way (cache.put reads it too), and a response rebuilt here is same-origin
   from then on, so MapLibre can still upload it to WebGL without tainting the canvas. */
const STAMP = 'x-im-cached';
async function store(cache, req, res) {
  if (!res || !res.ok) return;
  if (!(res.type === 'cors' || res.type === 'basic' || res.type === 'default')) return;
  if (isPlaceholder(typeof req === 'string' ? req : req.url, res)) return;
  try {
    const body = await res.blob();
    const h = new Headers();
    const ct = res.headers.get('content-type'); if (ct) h.set('content-type', ct);
    /* ⚠ NOT `content-encoding`. `res.blob()` hands back the DECODED bytes, so carrying the original
       encoding header forward would tell the browser to inflate something already inflated. */
    h.set(STAMP, String(Date.now()));
    await cache.put(req, new Response(body, { status: 200, statusText: 'OK', headers: h }));
    trim(cache);
  } catch (_) {}
}
function isStale(hit, url) {
  const t = +(hit.headers.get(STAMP) || 0);
  if (!t) return true;                   /* written by an older version of this file — refresh once */
  return (Date.now() - t) > maxAgeFor(url);
}

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop EVERY cache except the current tile cache and the page's own data caches. This SW only ever
    // caches immutable tiles (never the HTML/app shell), but purging any legacy cache name too guarantees
    // a stale index.html can't survive here and resurface as an "old version" (#R16 先祖返り defence on the
    // hosted path). (#R189) 'intmap-subcables-v1' is written by PAGE JS as the offline copy of the
    // submarine-cable GeoJSON (#R188) — deleting it here on every deploy silently re-created the
    // 「片方しかつかない」 outage window this SW was never meant to own. Keep page-owned intmap-* caches.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE && !/^intmap-subcables-/.test(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* ══ ⚠⚠ (#R225) THE LRU WAS ENUMERATING THE WHOLE CACHE ON EVERY TILE STORED ═══════════════════════
   「スマホでの地図スクロール、ズームが壊滅的に遅いです」

   `trim()` is called after every successful store, and its first act is `await cache.keys()` — which
   materialises a Request object for EVERY entry, up to MAX_ENTRIES = 12,000, only to compare a length
   against a cap that is almost never reached. A pan across a city stores dozens of tiles, so the
   service worker spends its time walking twelve thousand keys, over and over, on the same thread that
   has to answer the tile requests the map is waiting for. The `_trimming` flag prevented re-entry, not
   repetition: the next store simply started another walk.

   The count is knowable without asking. It is read ONCE (lazily, on the first store after a start-up)
   and then maintained: +1 per store, −n per eviction. `cache.keys()` now runs only when that counter
   says the cap is genuinely in reach, i.e. a few times per thousand tiles instead of once per tile.
   ⚠ The counter may drift — the browser evicts under storage pressure without telling us, and a second
   tab shares the cache — so it is a HINT, never the authority: the eviction path still reads the real
   keys, and a drifted counter is re-seeded from that same read. Drifting low delays a trim; drifting
   high costs one wasted walk. Neither can lose a tile. */
let _trimming = false, _n = -1, _sinceCheck = 0;
const CHECK_EVERY = 64;              /* stores between two cheap re-checks once the count is known */
async function trim(cache) {
  if (_trimming) return;
  /* the first store after a start-up learns the size; after that the counter answers */
  if (_n >= 0) {
    _n++;
    if (_n <= MAX_ENTRIES) return;                      /* nowhere near the cap — no walk */
    if (_sinceCheck++ < CHECK_EVERY && _n < MAX_ENTRIES * 1.05) return;
  }
  _trimming = true; _sinceCheck = 0;
  try {
    const keys = await cache.keys();               // insertion order (oldest first)
    _n = keys.length;                              // …and re-seed the hint from the truth
    if (keys.length > MAX_ENTRIES) {
      const remove = keys.slice(0, keys.length - TRIM_TO);
      await Promise.all(remove.map((req) => cache.delete(req)));
      _n = Math.max(0, keys.length - remove.length);
    }
  } catch (_) {} finally { _trimming = false; }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !isTileRequest(req.url)) return;   // let everything else hit the network normally

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      /* (#R224) still answered from disk with ZERO latency; if it is past its age the fresh copy is
         fetched behind it and replaces it for next time. A failed refresh changes nothing. */
      if (isStale(hit, req.url)) {
        event.waitUntil((async () => {
          try { const r = await fetch(req.url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
            if (r && r.ok) await store(cache, req, r); } catch (_) {}
        })());
      }
      return hit;                                                 // ZERO network on revisit
    }
    try {
      const res = await fetch(req);
      // Store only CORS-clean, OK responses (so MapLibre can render them to WebGL).
      if (res && res.ok) event.waitUntil(store(cache, req, res.clone()));
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
        /* (#R224) the SAME writer as the fetch path — stamped, and never a placeholder. The prefetch
           ring warms exactly the tiles sat-proto will ask about, so a placeholder pinned HERE was the
           other half of the half-resolution defect. */
        if (res && res.ok) await store(cache, u, res);
      } catch (_) {}
    }));
  })());
});
