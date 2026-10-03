// ============================================================================
//  IntMap · _shared/place-watch.js — WATCHED PLACES: what counts as «something happened here»  (watch-places)
// ----------------------------------------------------------------------------
//  THE PRODUCT. A reader who saved a place (My places, supabase/migrations/20261003140000_saved_places.sql)
//  can WATCH it: earthquakes, official weather warnings, volcano alert levels and corroborated news
//  events near it are read from the feeds IntMap already draws, and what is NEW since the reader last
//  looked is said in the app and gathered into a digest. This file is the part that decides — which
//  record is near enough, strong enough, and new — and it decides in CODE, from the records' own
//  numbers. No model is asked whether something happened (the rule the withdrawn Area Monitors kept,
//  docs/AREA-MONITORS.md «code decides "changed?"»), and here no model is asked to explain it either:
//  the digest is the records themselves, each with its source and its link.
//
//  WHY IT IS IN _shared/. It is plain JavaScript with no DOM, no Deno global, no clock and no network
//  (every input is passed in, `nowMs` included), so the page (js/place-watch.js) runs it today and a
//  server evaluator can run THE SAME CODE the day one is approved (docs/AREA-MONITORS.md §«Watched
//  places · push, awaiting approval»). Two copies of «what is new» would disagree on the first day.
//  tests/watch-places-checks.test.mjs evaluates it.
//
//  THE FOUR KINDS AND THE NATIVE MEASURE EACH IS JUDGED ON (never one score across kinds —
//  js/atlas-anomaly-score.js explains why an Mw and a warning level are not one number):
//    quake    USGS moment magnitude, within radius_km of the place
//    warning  the agency's own ladder normalised 1–4 by the warnings layer (js/world-packs.js normOf:
//             1 advisory · 2 warning · 3 danger/extreme · 4 emergency), for an area CONTAINING the place
//    volcano  the agency's alert rank 0–4 (js/volcano-intel.js RANK / JMA_RANK), within radius_km
//    news     independent outlets reporting one event (news_events.independent_source_count), its
//             representative point within radius_km
//
//  ⚠ A SOURCE THAT COULD NOT BE READ IS NOT «NOTHING HAPPENED». Every kind comes back with a state —
//  `ok`, `off` (the reader did not ask for it), `unavailable` (asked, could not read, with the reason).
//  The digest prints the state; a quiet place and an unread feed are never the same line.
// ============================================================================

/* ── THE DEFAULTS, each with where it comes from ──────────────────────────────────────────────────
   radiusKm 300   — research.impact's own default radius (js/atlas-cap-research.js «km default 300»),
                    which js/atlas-world-objects.js already reuses for «near». One answer to «how far
                    is near» across the app. Lapses if research.impact's default changes; that one is canonical.
   quakeMinMag 4.5 — USGS's own top summary-feed tier (feeds 1.0 / 2.5 / 4.5 / significant). The floor
                    a reader may set is QUAKE_FLOOR_MAG.
   alertMinLevel 2 — the agencies' «warning» step, above «advisory» (normOf in js/world-packs.js).
   volcanoMinRank 2 — the first RAISED step (USGS ADVISORY / YELLOW, JMA level 2) in js/volcano-intel.js RANK.
   newsMinSources 2 — two independent outlets: the smallest number that is not one outlet's claim
                    (docs/NEWS-EVENTS.md: independent_source_count counts source families, not articles).
                    A design choice, not an observation; it lapses the day readers are measured to want otherwise. */
export const WATCH_DEFAULTS = Object.freeze({
  radiusKm: 300, quakeMinMag: 4.5, alertMinLevel: 2, volcanoMinRank: 2, newsMinSources: 2,
});

/* The lowest magnitude a watch can ask for: the feed read is USGS's 2.5_week summary
   (js/atlas-cap-research.js USGS_WEEK), which holds nothing below M2.5. Asking for less would be a
   threshold the data cannot answer. Canonical here; the migration's CHECK repeats it and
   tests/watch-places-checks.test.mjs holds the two together. */
export const QUAKE_FLOOR_MAG = 2.5;
/* The widest radius: 1,000 km. Beyond it «near this place» stops meaning the place (Tokyo–Seoul is
   1,160 km). A design bound, repeated in the migration's CHECK and held by the same test. */
export const RADIUS_MAX_KM = 1000;
/* How many «already seen» keys one watch keeps. MEASURED 2026-10-03: the whole USGS 2.5_week feed
   held 323 quakes worldwide; the busiest of four test places (Anchorage) had 41 within 1,000 km.
   news_events active in the last 72 h with ≥ 2 independent outlets: 296 worldwide (25 within 300 km
   of London). So one watch at the widest radius sees a few hundred keys at most; 2,000 is ~5× the
   whole of both feeds together. When more are current the NEWEST are kept (the oldest leave the feeds
   first). Lapses if a feed with far more rows is added. Repeated in the migration's CHECK; this is
   the number the code trims to. */
export const SEEN_MAX = 2000;

export const KINDS = Object.freeze(['quake', 'warning', 'volcano', 'news']);

const num = (v) => { if (v == null || v === '' || typeof v === 'boolean') return null; const x = Number(v); return isFinite(x) ? x : null; };
/* a link is kept only when it is http(s) — the page renders it, and a feed is not trusted to choose a scheme */
const httpUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');

/* THE FEEDS READ, named once for the page and for a future server evaluator:
   USGS's 2.5_week summary feed — the same URL js/atlas-cap-research.js (USGS_WEEK) and
   js/layer-previews.js (QUAKES_WEEK) read. ONE request answers every watch (the filtering is here),
   so the number of watched places never multiplies the requests to USGS. */
export const USGS_WEEK_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson';
/* How far back news is read: 72 h, the retention IntMap keeps ARTICLES for (CONSTITUTION.md §5) and
   the window js/atlas-anomaly-score.js scores recency over. Canonical there. */
export const NEWS_WINDOW_MS = 72 * 3600 * 1000;

/** Great-circle distance in km (mean Earth radius 6,371 km). */
export function haversineKm(lng1, lat1, lng2, lat2) {
  const t = Math.PI / 180;
  const dLat = (lat2 - lat1) * t, dLng = (lng2 - lng1) * t;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * t) * Math.cos(lat2 * t) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** A watch row (database shape or camelCase) → the settings this file reads. A threshold that is
 *  NULL means the reader does not watch that kind; it is never filled with the default here. */
export function watchSettings(w) {
  w = w || {};
  const pick = (a, b) => (w[a] !== undefined ? w[a] : w[b]);
  const r = num(pick('radius_km', 'radiusKm'));
  return {
    radiusKm: r == null ? WATCH_DEFAULTS.radiusKm : Math.max(1, Math.min(RADIUS_MAX_KM, r)),
    quakeMinMag: num(pick('quake_min_mag', 'quakeMinMag')),
    alertMinLevel: num(pick('alert_min_level', 'alertMinLevel')),
    volcanoMinRank: num(pick('volcano_min_rank', 'volcanoMinRank')),
    newsMinSources: num(pick('news_min_sources', 'newsMinSources')),
    enabled: pick('enabled', 'enabled') !== false,
  };
}

/** Which kinds a watch asks for. */
export function watchedKinds(w) {
  const s = watchSettings(w);
  return KINDS.filter((k) => (k === 'quake' ? s.quakeMinMag : k === 'warning' ? s.alertMinLevel : k === 'volcano' ? s.volcanoMinRank : s.newsMinSources) != null);
}

/* ── THE FOUR READERS. Each takes the records as the feed published them and returns the items that
   pass this watch. An item: { key, kind, title, at (ms|null), km (|null), measure, measureText, source,
   url, ref, lng, lat }. `key` is the identity «have I seen this» is asked about — chosen per kind so a
   CHANGE is a new key and a re-publication of the same thing is not. ───────────────────────────── */

/** USGS GeoJSON (summary feed or FDSN) → quakes ≥ quakeMinMag within radius. Key: the USGS event id. */
export function quakeItems(geojson, place, w) {
  const s = watchSettings(w);
  if (s.quakeMinMag == null) return [];
  const out = [];
  for (const f of ((geojson && geojson.features) || [])) {
    const p = (f && f.properties) || {}, c = f && f.geometry && f.geometry.coordinates;
    const mag = num(p.mag); if (mag == null || mag < s.quakeMinMag || !c) continue;
    const lng = num(c[0]), lat = num(c[1]); if (lng == null || lat == null) continue;
    const km = haversineKm(place.lng, place.lat, lng, lat);
    if (km > s.radiusKm) continue;
    const id = String(f.id || p.code || ''); if (!id) continue;
    out.push({ key: 'quake:' + id, kind: 'quake', title: String(p.place || p.title || ''), at: num(p.time),
      km, measure: mag, measureText: 'M' + mag.toFixed(1), depthKm: num(c[2]),
      source: 'USGS', url: typeof p.url === 'string' ? p.url : '', ref: { type: 'earthquake', id }, lng, lat });
  }
  return out;
}

/** Warning records (js/world-packs.js IntMapWorld.alertsQuery rows, already filtered to areas that
 *  contain the place) → warnings ≥ alertMinLevel. Key: feed · unit/place · level · hazard — a
 *  re-issue of the same warning is the same key, an upgrade or a new hazard is a new one. The
 *  issuing time is NOT in the key (agencies re-stamp a warning that did not change). */
export function warningItems(records, place, w) {
  const s = watchSettings(w);
  if (s.alertMinLevel == null) return [];
  const out = [];
  for (const a of (records || [])) {
    const lv = num(a && a.level); if (lv == null || lv < s.alertMinLevel) continue;
    const unit = String(a.unit || a.place || ''), kind = String(a.kind || '');
    out.push({ key: 'warning:' + [a.feed || '', unit, lv, kind].join('|'), kind: 'warning',
      title: (kind ? kind + ' — ' : '') + String(a.place || unit), at: num(a.at), km: 0,
      measure: lv, measureText: String(lv), source: String(a.feed || '').toUpperCase(), url: '',
      ref: { type: 'warning', id: [a.iso || '', a.feed || '', unit].join(':') }, lng: place.lng, lat: place.lat,
      bbox: Array.isArray(a.bbox) ? a.bbox : null });
  }
  return out;
}

/** Volcanoes (positions [{v,name,lng,lat}]) + their published status (Map vn → js/volcano-intel.js
 *  status()) → volcanoes whose rank ≥ volcanoMinRank within radius. Key: number · rank — a change of
 *  level is a new key; the same level re-confirmed is not. */
export function volcanoItems(volcanoes, statusOf, place, w) {
  const s = watchSettings(w);
  if (s.volcanoMinRank == null) return [];
  const get = typeof statusOf === 'function' ? statusOf : (vn) => (statusOf && statusOf.get ? statusOf.get(vn) : null);
  const out = [];
  for (const v of (volcanoes || [])) {
    const lng = num(v && v.lng), lat = num(v && v.lat); if (lng == null || lat == null) continue;
    const km = haversineKm(place.lng, place.lat, lng, lat);
    if (km > s.radiusKm) continue;
    const st = get(+v.v);
    const rank = num(st && st.rank); if (rank == null || rank < s.volcanoMinRank) continue;
    out.push({ key: 'volcano:' + v.v + ':' + rank, kind: 'volcano', title: String(v.name || ''),
      at: st.at ? num(Date.parse(st.at)) : null, km, measure: rank, measureText: String(st.label || ''),
      source: String(st.source || ''), url: String(st.url || ''), ref: { type: 'volcano', id: String(v.v) }, lng, lat });
  }
  return out;
}

/** news_events rows → events reported by ≥ newsMinSources independent outlets, representative point
 *  within radius. Key: the event's public id (merges keep it reachable — docs/NEWS-EVENTS.md). */
export function newsItems(rows, place, w) {
  const s = watchSettings(w);
  if (s.newsMinSources == null) return [];
  const out = [];
  for (const e of (rows || [])) {
    if (!e || (e.status && e.status !== 'active')) continue;
    const n = num(e.independent_source_count); if (n == null || n < s.newsMinSources) continue;
    const lng = num(e.rep_lng), lat = num(e.rep_lat); if (lng == null || lat == null) continue;
    const km = haversineKm(place.lng, place.lat, lng, lat);
    if (km > s.radiusKm) continue;
    const id = String(e.public_id || ''); if (!id) continue;
    /* the representative article — the one the event list itself leads with (news_events.representative_article_id) */
    const rep = e.representative || null;
    out.push({ key: 'news:' + id, kind: 'news', title: String(e.representative_title || ''),
      at: num(Date.parse(e.last_article_at || e.first_published_at || '')), km, measure: n,
      measureText: String(n), place: String(e.rep_place_name_en || ''),
      source: String((rep && rep.source_id) || ''), url: httpUrl(rep && rep.canonical_url),
      ref: { type: 'news_event', id }, lng, lat });
  }
  return out;
}

/* ── EVALUATION ────────────────────────────────────────────────────────────────────────────────── */

/**
 * evaluate(watch, place, feeds) — one watch against what the feeds said this time.
 *   feeds[kind] = { state:'ok', items:[…] } | { state:'unavailable', reason } (items already read by
 *   the four readers above, so this function never knows where they came from).
 * Returns { items (all current, newest first per kind), fresh (not yet seen), sources:{kind:{state,reason,n}},
 *   baseline (true when the watch has never been looked at — nothing is called new on the first look) }.
 */
export function evaluate(watch, place, feeds) {
  const kinds = watchedKinds(watch);
  const seen = new Set(Array.isArray(watch && watch.seen_keys) ? watch.seen_keys : []);
  const baseline = !(watch && watch.seen_at);
  const sources = {}, items = [];
  for (const k of KINDS) {
    if (kinds.indexOf(k) < 0) { sources[k] = { state: 'off', n: 0 }; continue; }
    const f = feeds && feeds[k];
    if (!f || f.state !== 'ok') { sources[k] = { state: 'unavailable', reason: (f && f.reason) || 'not-read', n: 0 }; continue; }
    const got = (f.items || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    sources[k] = { state: 'ok', n: got.length };
    items.push(...got);
  }
  const fresh = baseline ? [] : items.filter((it) => !seen.has(it.key));
  return { placeId: watch && (watch.place_id || watch.placeId) || null, name: place && place.name || '', items, fresh, sources, baseline };
}

/**
 * nextSeen(prevKeys, ev) — the keys to store when the reader has looked (or on the first look).
 * The current items' keys, PLUS the previous keys of every kind that could not be read this time:
 * an unread feed must not make its items look new again the next time it answers.
 * Trimmed to SEEN_MAX, newest kept.
 */
export function nextSeen(prevKeys, ev) {
  const unread = new Set(Object.keys((ev && ev.sources) || {}).filter((k) => ev.sources[k].state === 'unavailable'));
  const cur = ((ev && ev.items) || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0)).map((it) => it.key);
  const kept = (Array.isArray(prevKeys) ? prevKeys : []).filter((k) => unread.has(String(k).split(':')[0]));
  const out = [];
  const have = new Set();
  for (const k of cur.concat(kept)) { if (!have.has(k)) { have.add(k); out.push(k); } if (out.length >= SEEN_MAX) break; }
  return out;
}

/** The headline of one place's fresh items, in the order a reader triages: warnings, volcanoes,
 *  quakes, news; within a kind the strongest first. Returns the items in that order. */
export function triage(items) {
  const order = { warning: 0, volcano: 1, quake: 2, news: 3 };
  return (items || []).slice().sort((a, b) => (order[a.kind] - order[b.kind]) || ((b.measure || 0) - (a.measure || 0)) || ((b.at || 0) - (a.at || 0)));
}
