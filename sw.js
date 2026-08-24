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
/* ══ SEC: …AND A CEILING IN BYTES, WHICH THE ENTRY COUNT IS NOT ═══════════════════════════════════
   12,000 ENTRIES bounds how many things are kept and says nothing about how big they are: a real
   z/x/y tile is tens of kilobytes, so the count was a de-facto size cap only for as long as every
   cached URL was a tile. Now that a URL may also arrive by postMessage from the page (see the
   prefetch handler at the bottom), "how many" and "how much" are two different questions.
     · MAX_ENTRY_BYTES  — one response. World_Imagery at @2x is ~120 kB and a terrarium PNG ~90 kB;
       8 MB is far above any tile and far below anything worth parking in a cache.
     · MAX_CACHE_BYTES  — the origin's Cache Storage as the BROWSER accounts for it. Past it the SW
       stops ADDING (and forces a trim); it never stops answering, so a session that reaches the
       ceiling loses cache growth, not tiles: the map still fetches over the network exactly as it
       does on a cold profile. */
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 1536 * 1024 * 1024;      /* 1.5 GiB: ~12,000 tiles at 128 kB, with room */
const QUOTA_EVERY = 256;                          /* stores between two storage.estimate() calls */
let _overBudget = false, _sinceQuota = 0;
async function withinBudget() {
  if (_sinceQuota-- > 0) return !_overBudget;
  _sinceQuota = QUOTA_EVERY;
  try {
    const est = await self.navigator.storage.estimate();
    const usage = (est && est.usage) || 0, quota = (est && est.quota) || 0;
    _overBudget = usage > MAX_CACHE_BYTES || (quota > 0 && usage / quota > 0.9);
  } catch (_) { _overBudget = false; }            /* no estimate API → the entry cap is the only cap */
  return !_overBudget;
}

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
/* ══ ⚠⚠ SEC: A PATH RULE THAT MATCHED **ANY HOST**, AND A SUFFIX TEST WITH NO DOT ═════════════════
   The rule above was written as "the path decides", and it was implemented literally:

       return TILE_PATHS.some((p) => u.pathname.indexOf(p) !== -1);      // ← no host test at all

   So `https://anything.example/terrarium/x.png` was a tile: cached FIRST-hit, answered cache-FIRST for
   sixty days, and — because store() rebuilds the response — handed back to the page as a same-origin
   body. Anything on the page that can reach `fetch()` with a URL of its choosing could therefore pin
   a permanent, attacker-chosen answer at an attacker-chosen URL inside this origin's cache. The
   comment claimed the pattern «cannot over-match: nothing else in the app requests a URL containing
   /terrarium/», which is a statement about IntMap's own code and not about what a request can be.

   The second half is the host test itself: `h.endsWith(t)` has no dot, so `t = 'api.mapbox.com'`
   also matched `notapi.mapbox.com`, and `t = 'tiles.openfreemap.org'` also matched
   `eviltiles.openfreemap.org` — a registrable-domain neighbour is not the same party.

   Both are now the same shape: EXACT hostname, or a genuine subdomain (`.` + host). The DEM's five S3
   spellings (#R178: MapLibre picks the alias per tile as (x+y) % 5) are listed by name rather than
   inferred from a bucket-shaped suffix, because `*.s3.amazonaws.com` is every S3 bucket on earth. */
function hostMatches(h, list) {
  return list.some((t) => h === t || h.endsWith('.' + t));
}
const TILE_PATH_RULES = [
  { path: '/terrarium/',              // AWS terrarium DEM, whichever S3 alias served it (js/dem-source.js)
    hosts: [
      's3.amazonaws.com',
      'elevation-tiles-prod.s3.amazonaws.com',
      'elevation-tiles-prod.s3.dualstack.us-east-1.amazonaws.com',
      'elevation-tiles-prod.s3.us-east-1.amazonaws.com',
      's3.dualstack.us-east-1.amazonaws.com',
      's3.us-east-1.amazonaws.com',
    ] },
];
function isTileRequest(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;      /* a tile is never plaintext; nothing here asks for http */
  const h = u.hostname;
  if (hostMatches(h, TILE_HOSTS)) return true;
  /* ⚠ EXACT hostnames here, not hostMatches(): the two generic S3 endpoints in the list would
     otherwise admit every bucket in the world that happens to serve a /terrarium/ path. */
  return TILE_PATH_RULES.some((r) => r.hosts.indexOf(h) !== -1 && u.pathname.indexOf(r.path) !== -1);
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
    if (hostMatches(h, REFRESHABLE)) return 7 * DAY;         /* SEC: same dot-boundary rule as isTileRequest */
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
    /* SEC: `/arcgisonline\.com$/` also matched `notarcgisonline.com`. Same dot boundary as everywhere else. */
    if (!hostMatches(new URL(url).hostname, ['arcgisonline.com'])) return false;
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
  /* SEC: refuse an oversized body before reading it, when the server declared a length. */
  const declared = +res.headers.get('content-length');
  if (isFinite(declared) && declared > MAX_ENTRY_BYTES) return;
  if (!(await withinBudget())) { try { await trim(cache, true); } catch (_) {} return; }
  try {
    const body = await res.blob();
    /* SEC: …and again once it is read, because content-length is optional and chunked answers omit it. */
    if (body.size > MAX_ENTRY_BYTES) return;
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
async function trim(cache, force) {
  if (_trimming) return;
  /* the first store after a start-up learns the size; after that the counter answers.
     SEC: `force` is the byte-budget path — it must walk even when the ENTRY count is nowhere near. */
  if (_n >= 0 && !force) {
    _n++;
    if (_n <= MAX_ENTRIES) return;                      /* nowhere near the cap — no walk */
    if (_sinceCheck++ < CHECK_EVERY && _n < MAX_ENTRIES * 1.05) return;
  }
  _trimming = true; _sinceCheck = 0;
  try {
    const keys = await cache.keys();               // insertion order (oldest first)
    _n = keys.length;                              // …and re-seed the hint from the truth
    /* SEC: over the byte budget, drop the oldest sixth outright — the entry count is not the thing
       that is full, so waiting for it to be reached would never free anything. */
    const target = force ? Math.min(TRIM_TO, Math.floor(keys.length * 5 / 6)) : TRIM_TO;
    if (keys.length > target) {
      const remove = keys.slice(0, keys.length - target);
      await Promise.all(remove.map((req) => cache.delete(req)));
      _n = Math.max(0, keys.length - remove.length);
      if (force) { _sinceQuota = 0; _overBudget = false; }   /* re-measure on the next store */
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
/* ══ ⚠⚠ (#R230) A PREFETCH IS THE ONE REQUEST NOBODY IS WAITING FOR ══════════════════════════════
   「衛星先読みの一斉実行を小さなキューに変更」. `Promise.all` over the whole batch started up to 96
   fetches in one turn of the event loop — every one of them a connection slot, a response body to
   read, a Blob to build and a Cache API write, all contending with the tiles the map is drawing RIGHT
   NOW, and all of it triggered 260 ms after the reader stopped moving, i.e. squarely inside the next
   gesture. Satellite is the app's DEFAULT basemap (js/app-body.js: `currentMapType='sat'`), so this
   is not an exotic path — it is what a phone does on first load.
   PREFETCH_LANES at a time instead. ⚠ THE WORK IS NOT REDUCED AND NO TILE IS DROPPED: the same URLs
   are fetched and the same responses are stored, just never more than a few at once, so the visible
   tiles keep their share of the connection pool and the main thread. Nothing about the picture
   changes (「見た目は一切落とすな」) — a prefetch has never had a pixel of its own.
   ⚠ THE LANES ARE SHARED ACROSS BATCHES, deliberately: a pan is a run of `moveend`s, so per-batch
   limiting would still let three overlapping batches put 3×N in the air. One module-level cursor over
   a queue that later batches append to is what actually bounds it. */
/* ══ ⚠⚠ SEC: THIS PORT ACCEPTED ANY URL FROM ANY SENDER ══════════════════════════════════════════
   The handler at the bottom took `d.urls` and fetched them. It did not ask who sent the message, it
   did not run the tile allow-list over them, and it stored whatever came back through the same
   cache-first store() the fetch path uses. A service worker's scope is its origin, so the sender is
   at least same-origin — but "same origin" includes an injected iframe, an extension content script
   with page access, and every future page this project serves; and the fetches themselves went out
   from the SW with the default `credentials`, i.e. with cookies for the target site. The result was
   a general-purpose, cookie-bearing, cache-poisoning fetch primitive reachable with one postMessage.
   Four things fix it, and none of them narrows what the real prefetcher does:
     · the SENDER must be a same-origin window client of this registration;
     · every URL goes through isTileRequest() — the same list the fetch path uses;
     · length and count are bounded before anything is queued (a URL is a z/x/y, not a document);
     · `credentials: 'omit'`, so a prefetch can never carry the reader's cookies to a tile host.
   MEASURED against the prefetcher (js/tile-warm.js) this changes nothing: every URL it sends is
   an https tile on a listed host, and its batches are ≤ 96. */
const PREFETCH_LANES = 4;                 /* concurrent prefetch fetches, across every batch */
const PREFETCH_MAX = 96;                  /* per batch, unchanged — the ceiling that was already here */
const PREFETCH_BACKLOG = 512;             /* a queue that outgrows this is stale; drop the oldest */
const PREFETCH_URL_MAX = 2048;            /* a tile URL with BYOK query params is ~300 chars */
let _pfQueue = [], _pfLanes = 0, _pfDrained = null, _pfResolve = null;
/* ⚠ THE WORKER STILL HAS TO BE HELD ALIVE UNTIL THE LAST TILE LANDS. `Promise.all` did that for free
   — `waitUntil` was given the whole batch. A queue that returns the moment it is *scheduled* would
   let the browser terminate the worker with lanes still in flight, which is not "smaller batches",
   it is "silently fewer tiles". So the handler waits on a drain promise instead. */
function pfDrain() { if (!_pfDrained) _pfDrained = new Promise((res) => { _pfResolve = res; }); return _pfDrained; }
function pfSettle() {
  if (_pfLanes === 0 && _pfQueue.length === 0 && _pfResolve) {
    const r = _pfResolve; _pfResolve = null; _pfDrained = null; r();
  }
}
async function pfLane(cache) {
  while (_pfQueue.length) {
    /* (#R408) an entry is { u, c }: the URL, and the client whose batch put it here — see the handler */
    const u = _pfQueue.shift().u;
    try {
      if (await cache.match(u)) continue;
      /* SEC: never the reader's cookies, and never a redirect to somewhere that is not a tile. */
      const res = await fetch(u, { mode: 'cors', credentials: 'omit', redirect: 'follow' });
      if (res && res.url && !isTileRequest(res.url)) continue;
      /* (#R224) the SAME writer as the fetch path — stamped, and never a placeholder. The prefetch
         ring warms exactly the tiles sat-proto will ask about, so a placeholder pinned HERE was the
         other half of the half-resolution defect. */
      if (res && res.ok) await store(cache, u, res);
    } catch (_) {}
  }
}
function pfPump(cache) {
  while (_pfLanes < PREFETCH_LANES && _pfQueue.length) {
    _pfLanes++;
    pfLane(cache).catch(() => {}).then(() => { _pfLanes--; pfSettle(); });
  }
  pfSettle();                              /* nothing to do (empty batch) must resolve, not hang */
}
/* SEC: who sent this. `event.origin` is '' for a same-origin postMessage in some engines, so the
   authority is the CLIENT: a window controlled by this registration, whose URL is this origin. */
async function senderIsOurWindow(event) {
  try {
    if (event.origin && event.origin !== self.location.origin) return false;
    const src = event.source;
    if (!src || !src.id) return false;
    const client = await self.clients.get(src.id);
    if (!client) return false;
    if (client.type && client.type !== 'window') return false;
    return new URL(client.url).origin === self.location.origin;
  } catch (_) { return false; }
}
self.addEventListener('message', (event) => {
  const d = event.data;
  /* (#R408) two spellings, one path: `prefetch` says the view moved and this batch REPLACES whatever of
     the sender's is still queued here; `prefetch-more` says it is the rest of the ring already running
     (js/tile-warm.js caps a batch at 60/110, so the next call from the same tile rectangle is the
     remainder). Everything below — the sender check, the allow-list, the caps, the lanes — is the same
     for both; only the queue in front of the new URLs is treated differently. */
  if (!d || (d.type !== 'prefetch' && d.type !== 'prefetch-more') || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    if (!(await senderIsOurWindow(event))) return;
    const wanted = [];
    for (const u of d.urls) {
      if (wanted.length >= PREFETCH_MAX) break;
      if (typeof u !== 'string' || u.length > PREFETCH_URL_MAX) continue;
      if (!isTileRequest(u)) continue;                 /* the SAME allow-list the fetch path uses */
      wanted.push(u);
    }
    /* ⚠ AND HAND BACK WHAT THE ALLOW-LIST REFUSED, rather than silently doing less than before.
       The satellite basemap has a `custom` (pro-tier) provider whose XYZ template the READER types
       in Settings, so its host is by construction not on any list here. Those tiles were never
       cache-FIRST served — the fetch handler's allow-list already excluded them — but this port did
       fetch them, which warmed the browser's own HTTP cache for the render path. Dropping them on
       the floor would have made a real feature quietly slower, so the page (js/tile-warm.js) is told
       and warms them through the same four-lane queue it uses when there is no controller at all. */
    if (wanted.length < d.urls.length) {
      try {
        const declined = d.urls.filter((u) => typeof u === 'string' && u.length <= PREFETCH_URL_MAX && !isTileRequest(u)).slice(0, PREFETCH_MAX);
        if (declined.length && event.source && event.source.postMessage) event.source.postMessage({ type: 'prefetch-declined', urls: declined });
      } catch (_) {}
    }
    if (!wanted.length) return;
    const cache = await caches.open(CACHE);
    /* ══ (#R408) A BATCH FOR SOMEWHERE ELSE SUPERSEDES THE SAME SENDER'S LEFTOVERS ══════════════════
       The lanes are shared across batches (above), which is what bounds how many fetches are in the
       air — and it is also why a batch keeps its place in the queue long after the reader has moved
       on: 260 ms after a `moveend` the page posts the ring it wants NOW, and what is queued in front
       of it is the ring it wanted then, four lanes' worth at a time, competing with the tiles the map
       is drawing at the new place. Everything of THIS sender's that is still queued predates the
       message being handled (nothing else adds to the queue), so on a `prefetch` it all goes.
       ⚠ PER SENDER, so a second tab's prefetch is not cancelled by this one's, and ⚠ ONLY ON A
       `prefetch`: a `prefetch-more` is the same view continued and drops nothing.
       ⚠ NOTHING ELSE IS REDUCED. The lanes, the batch cap, the backlog and the cache check are
       unchanged, and a fetch already in flight is never abandoned — a reader who stops moving posts
       nothing at all, so nothing supersedes the last batch and it drains in full.
       ⚠ AND THE PAGE IS TOLD WHAT WAS DROPPED. js/tile-warm.js remembers every URL it has asked for
       and never asks twice (#R196), so a URL dropped here in silence would be a tile its prefetch can
       never warm again: the cancellation would be punching holes in the coverage it exists to protect.
       It forgets the ones named here, and offers them again if the camera still wants them. */
    const cid = (event.source && event.source.id) || '';
    const stale = [];
    if (d.type === 'prefetch') {
      _pfQueue = _pfQueue.filter((e) => { if (e.c !== cid) return true; stale.push(e.u); return false; });
    }
    for (const u of wanted) _pfQueue.push({ u, c: cid });
    if (_pfQueue.length > PREFETCH_BACKLOG) _pfQueue = _pfQueue.slice(-PREFETCH_BACKLOG);
    if (stale.length) {
      try { if (event.source && event.source.postMessage) event.source.postMessage({ type: 'prefetch-dropped', urls: stale }); } catch (_) {}
    }
    const done = pfDrain();
    pfPump(cache);
    await done;
  })());
});
