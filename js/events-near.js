/* ============================================================================
 *  IntMap · EVENTS NEAR — earthquakes and news events over an area and a window, read ONCE   (place-card-unify)
 * ----------------------------------------------------------------------------
 *  Before this file the same two reads were written five times:
 *    · the USGS M2.5+ 7-day feed, fetched whole and filtered on the device — by the «Here, now» card, by the
 *      watched places (js/place-watch.js), by `research.related` and `research.impact`, and by the world-object
 *      resolver (js/atlas-cap-research.js). One session could fetch the same 0.5 MB file four times in a minute.
 *    · IntMap's news events (news_events) over the last hours, filtered by distance on the device — by «Here, now»
 *      (page by page, with a fence) and by the watched places (ONE page of 1,000 rows, then «truncated»: the
 *      events past the first page were simply not looked at).
 *  This is the one reader of each. What it returns is the same shape for every caller, and its states are the
 *  one vocabulary below.
 *
 *  ══ THE POSITION IS NEVER SENT ═════════════════════════════════════════════════════════════════════════
 *  Both reads ask their source for the WHOLE window (the feed URL carries no position; the news query filters by
 *  status, time and outlet count, never by place) and the area is applied HERE. That is what lets the card opened
 *  from the device position promise that neither USGS nor IntMap's own database learns where the reader is
 *  (privacy.html, js/legal-text.js). ⚠ Do not «optimise» this into the FDSN radius query or a PostGIS filter.
 *
 *  ══ THE STATES (one vocabulary — .agents/rules/one-pass-or-a-reason.md §5) ════════════════════════════
 *    ok           the source answered and something lies in the area and window
 *    none         the source answered and NOTHING lies there — an answer, not a failure
 *    unavailable  the source could not be asked or did not answer, with `reason`:
 *                 'timeout' | 'network' | 'http' | 'parse' | 'aborted' (js/fetch-deadline.js's own words),
 *                 'no-database-client', or 'window-beyond-feed' (the question asks for what the feed does not
 *                 hold — it is said, not silently cut to what the feed has).
 *  ⚠ «could not observe» and «there was nothing» are never the same word.
 * ==========================================================================*/
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';
import { USGS_WEEK_FEED, QUAKE_FLOOR_MAG } from '../supabase/functions/_shared/place-watch.js';

export const STATE = Object.freeze({ OK: 'ok', NONE: 'none', UNAVAILABLE: 'unavailable' });
export const REASON = Object.freeze({
  BEYOND_FEED: 'window-beyond-feed', NONE_WITHIN: 'none-within-reach', NO_DB: 'no-database-client', PARSE: 'parse',
});

/* THE FEED: USGS's own summary feed «M2.5+, past 7 days» (its URL and floor are canonical in
   supabase/functions/_shared/place-watch.js, where the watched-places rule and the migration's CHECK read them). */
export const QUAKE_FEED = Object.freeze({ url: USGS_WEEK_FEED, minMag: QUAKE_FLOOR_MAG, days: 7, publisher: 'USGS Earthquake Hazards Program' });
/* How long one read of it is reused within a session. SOURCE: USGS documents its summary GeoJSON feeds as
   «updated every minute» (earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php) — a second read inside that minute
   can only return the same file. EXPIRES IF USGS changes the regeneration interval. */
export const QUAKE_FEED_TTL_MS = 60 * 1000;

/* the news window, read page by page. OBSERVED (2026-10-03, «Here, now»): PostgREST as Supabase runs it answers at
   most 1,000 rows per request (its default `max-rows`), and the 72-hour window of placed events held MORE than that.
   So the window is read with `.range` until a page comes back short — time bounds it — and NEWS_PAGES is the last
   fence (a row is ~0.2 kB, so the fence is ~1 MB on a phone); past it the answer says `truncated`.
   EXPIRES IF max-rows changes (NEWS_PAGE) or the window outgrows the fence. */
export const NEWS_PAGE = 1000, NEWS_PAGES = 5;
/* the columns every caller needs: the card's (title, place, outlets, category) and the watched places' (status,
   counts, the representative article's link and outlet). One select, so one shape of row. */
export const NEWS_COLS = 'public_id,representative_title,rep_lng,rep_lat,rep_place_name_en,independent_source_count,article_count,last_article_at,first_published_at,status,primary_category,'
  + 'representative:news_articles!news_events_representative_article_id_fkey(canonical_url,source_id)';

const finite = (v) => typeof v === 'number' && isFinite(v);
const num = (v) => { if (v == null || v === '' || typeof v === 'boolean') return null; const x = Number(v); return isFinite(x) ? x : null; };
const reasonOf = (e) => (e && e.reason) ? String(e.reason) : 'network';

/** an area: {point:{lng,lat}, radiusKm} | {bbox:[w,s,e,n]} | absent (the whole world).
 *  → (lng, lat) => { in:boolean, km:number|null } */
function areaTest(area) {
  if (area && area.point && finite(+area.point.lng) && finite(+area.point.lat) && finite(+area.radiusKm)) {
    const lng0 = +area.point.lng, lat0 = +area.point.lat, r = +area.radiusKm;
    return (lng, lat) => { const km = haversineKm(lng0, lat0, lng, lat); return { in: km <= r, km }; };
  }
  if (area && Array.isArray(area.bbox) && area.bbox.length === 4 && area.bbox.every((v) => finite(+v))) {
    const [w, s, e, n] = area.bbox.map(Number);
    /* a box that crosses the antimeridian is written w > e */
    return (lng, lat) => ({ in: lat >= s && lat <= n && (w <= e ? (lng >= w && lng <= e) : (lng >= w || lng <= e)), km: null });
  }
  return () => ({ in: true, km: null });
}

async function withDeadline(p, ms) {
  if (!finite(ms) || ms <= 0) return p;
  let t; const d = new Promise((_, rej) => { t = setTimeout(() => rej(Object.assign(new Error('deadline'), { reason: 'timeout' })), ms); });
  try { return await Promise.race([p, d]); } finally { clearTimeout(t); }
}

/**
 * makeEventsNear(env?) — a reader with its own session cache.
 *   env.json(url)  how a URL is fetched as JSON (default: js/fetch-deadline.js under the host's own deadline,
 *                  js/proxy-fetch.js clockFor, bypassing the HTTP cache — the freshness is QUAKE_FEED_TTL_MS here)
 *   env.now()      the clock (default Date.now)
 * The app uses the one instance `EventsNear` below; tests make their own or `configure` it.
 */
export function makeEventsNear(env) {
  let cfg = {};
  let feed = null;          /* { at, data } — the last good read */
  let inflight = null;      /* the read in progress, shared by every caller that arrives during it */
  let fetches = 0;          /* how many times the feed was actually requested (the regression counts it) */
  const configure = (e) => {
    e = e || {};
    cfg = { json: e.json || ((u) => jsonWithin(u, clockFor(u), { cache: 'no-cache' })), now: e.now || (() => Date.now()), ttlMs: finite(e.ttlMs) ? e.ttlMs : QUAKE_FEED_TTL_MS };
    if (e.reset !== false) { feed = null; inflight = null; fetches = 0; }
  };
  configure(env);

  async function feedData() {
    if (feed && cfg.now() - feed.at < cfg.ttlMs) return feed;
    if (inflight) return inflight;
    fetches++;
    inflight = (async () => {
      try {
        const data = await cfg.json(QUAKE_FEED.url);
        if (!data || !Array.isArray(data.features)) throw Object.assign(new Error('not a feature collection'), { reason: REASON.PARSE });
        feed = { at: cfg.now(), data };
        return feed;
      } finally { inflight = null; }   /* a failed read is not kept: the next caller asks again (a real failure may be retried) */
    })();
    return inflight;
  }

  /**
   * readQuakes({ area?, days = 7, minMag = 2.5 }) →
   *   { state, reason, items, features, scanned, fetchedAt, source, window, area }
   * `items` are the card's shape (id, mag, place, time ISO, timeMs, km, depthKm, lng, lat, url), newest first;
   * `features` are the same quakes as the feed published them (GeoJSON), for a rule that reads the feed's own
   * fields (supabase/functions/_shared/place-watch.js quakeItems, js/atlas-world-objects.js fromUsgs).
   */
  async function readQuakes(o) {
    o = o || {};
    const days = finite(+o.days) ? +o.days : QUAKE_FEED.days, minMag = finite(+o.minMag) ? +o.minMag : QUAKE_FEED.minMag;
    const source = { publisher: QUAKE_FEED.publisher, feed: QUAKE_FEED.url, minMag: QUAKE_FEED.minMag, days: QUAKE_FEED.days };
    const win = { days, minMag };
    const base = { items: [], features: [], scanned: 0, fetchedAt: null, source, window: win, area: o.area || null };
    if (days > QUAKE_FEED.days || minMag < QUAKE_FEED.minMag) return Object.assign(base, { state: STATE.UNAVAILABLE, reason: REASON.BEYOND_FEED });
    let f;
    try { f = await feedData(); } catch (e) { return Object.assign(base, { state: STATE.UNAVAILABLE, reason: reasonOf(e), status: (e && e.status) || null }); }
    const test = areaTest(o.area);
    /* the feed IS the 7-day window: a shorter window is cut by the clock, the full one is not cut again */
    const since = days < QUAKE_FEED.days ? cfg.now() - days * 86400000 : -Infinity;
    const items = [], features = [];
    for (const ft of f.data.features) {
      const g = ft && ft.geometry && ft.geometry.coordinates, p = (ft && ft.properties) || {};
      if (!g) continue;
      const lng = num(g[0]), lat = num(g[1]); if (lng == null || lat == null) continue;
      const mag = num(p.mag), t = num(p.time);
      if (minMag > QUAKE_FEED.minMag && !(mag != null && mag >= minMag)) continue;
      if (since > -Infinity && !(t != null && t >= since)) continue;
      const hit = test(lng, lat); if (!hit.in) continue;
      features.push(ft);
      items.push({ id: String(ft.id || p.code || ''), mag, place: p.place ? String(p.place) : null, time: t != null ? new Date(t).toISOString() : null, timeMs: t,
        km: hit.km, depthKm: num(g[2]), lng, lat, url: typeof p.url === 'string' ? p.url : null });
    }
    const order = items.map((x, i) => i).sort((a, b) => (items[b].timeMs || 0) - (items[a].timeMs || 0));
    return Object.assign(base, { state: items.length ? STATE.OK : STATE.NONE, reason: items.length ? null : REASON.NONE_WITHIN,
      items: order.map((i) => items[i]), features: order.map((i) => features[i]), scanned: f.data.features.length, fetchedAt: new Date(f.at).toISOString() });
  }

  /**
   * readNewsEvents({ db, area?, hours = 72, minSources?, deadlineMs? }) →
   *   { state, reason, rows, items, truncated, scanned, hours, source }
   * `rows` are the news_events rows inside the area as the database returned them (NEWS_COLS); `items` are the card's
   * shape (publicId, title, place, km, lastAt, outlets, category, lng, lat) — nearest first when the area is a point.
   * The whole window is read page by page (NEWS_PAGE, up to NEWS_PAGES) and filtered here.
   */
  async function readNewsEvents(o) {
    o = o || {};
    const hours = finite(+o.hours) && +o.hours > 0 ? +o.hours : 72;
    const source = { publisher: 'IntMap news events (headlines by their outlets)' };
    const base = { rows: [], items: [], truncated: false, scanned: 0, hours, source };
    const DB = o.db;
    if (!DB || typeof DB.from !== 'function') return Object.assign(base, { state: STATE.UNAVAILABLE, reason: REASON.NO_DB });
    const minSources = finite(+o.minSources) && o.minSources != null ? +o.minSources : null;
    try {
      const since = new Date(cfg.now() - hours * 3600000).toISOString();
      const all = [];
      let truncated = false;
      await withDeadline((async () => {
        for (let p = 0; ; p++) {
          if (p >= NEWS_PAGES) { truncated = true; break; }
          let q = DB.from('news_events').select(NEWS_COLS)
            .eq('status', 'active').is('merged_into', null).not('rep_lat', 'is', null).gte('last_article_at', since);
          if (minSources != null) q = q.gte('independent_source_count', minSources);
          const { data, error } = await q.order('last_article_at', { ascending: false }).range(p * NEWS_PAGE, p * NEWS_PAGE + NEWS_PAGE - 1);
          if (error) throw Object.assign(new Error(error.message || 'db'), { reason: 'http', code: error.code || null });
          const page = Array.isArray(data) ? data : [];
          all.push(...page);
          if (page.length < NEWS_PAGE) break;
        }
      })(), o.deadlineMs);
      const test = areaTest(o.area), rows = [], items = [];
      for (const r of all) {
        const lng = num(r && r.rep_lng), lat = num(r && r.rep_lat); if (lng == null || lat == null) continue;
        const hit = test(lng, lat); if (!hit.in) continue;
        rows.push(r);
        const outlets = num(r.independent_source_count);
        items.push({ publicId: String(r.public_id), title: String(r.representative_title || ''), place: r.rep_place_name_en || null, km: hit.km,
          lastAt: r.last_article_at || null, outlets, category: r.primary_category || null, lng, lat });
      }
      if (o.area && o.area.point) items.sort((a, b) => a.km - b.km || String(b.lastAt).localeCompare(String(a.lastAt)));
      return Object.assign(base, { state: items.length ? STATE.OK : STATE.NONE, reason: items.length ? null : REASON.NONE_WITHIN, rows, items, truncated, scanned: all.length });
    } catch (e) { return Object.assign(base, { state: STATE.UNAVAILABLE, reason: reasonOf(e), code: (e && e.code) || null }); }
  }

  return { readQuakes, readNewsEvents, configure, fetchCount: () => fetches };
}

/** the session's one reader — every caller in the app shares its cache */
export const EventsNear = makeEventsNear();
export const readQuakes = (o) => EventsNear.readQuakes(o);
export const readNewsEvents = (o) => EventsNear.readNewsEvents(o);
