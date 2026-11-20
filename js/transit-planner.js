/* ============================================================================
 *  IntMap · js/transit-planner.js — window.IntMapTransitTimetable   (lazy: IntMapLazy.need('transitTimetable'))
 * ----------------------------------------------------------------------------
 *  The browser side of the timetable planner: picks the shipped feed(s) that cover a point, loads the
 *  bundle (data/transit/<id>.json, same origin — nothing is sent to a third party), runs
 *  js/transit-raptor.js, and answers in the two shapes the app already speaks:
 *
 *    · plan()  → itineraries in the MOTIS shape routing.js's `_buildItin` consumes, so the route
 *                cards, the leg list and the map drawing are the ones every other transit answer uses;
 *    · reach() → nested reachable-area polygons + the reached stops, with the countries they lie in.
 *
 *  ══ SCHEDULED VS LIVE ═════════════════════════════════════════════════════════════════════════
 *  Every leg carries `realTime: false` and every result `basis: 'scheduled'` unless a bundle declares
 *  a real-time source (none does today — js/transit-feeds.js). The reply text says «timetable»; it
 *  never says «live» about data it does not have.
 *
 *  ══ BORDERS ═══════════════════════════════════════════════════════════════════════════════════
 *  A journey is walked stop by stop through the app's own country outlines; each change of country
 *  is a crossing, named, with the nearest official border-control post (data/border-crossings.json:
 *  OpenStreetMap barrier=border_control) and its stated opening hours / who may cross, when it states
 *  them. A reach says which countries its stops lie in — a timetable that runs over a border extends
 *  the reachable area over it, and the answer says so rather than clipping at the line.
 * ==========================================================================*/
import { loadNetwork, plan as raptorPlan, reach as raptorReach, bandCircles, circleRing, coverage, planBasis, distanceM, MODELS } from './transit-raptor.js';
import { FEEDS, feedById, feedsNear, attributionFor, TRANSITOUS_FALLBACK } from './transit-feeds.js';
import { featureAt } from './routing-ops.js';
import { jsonWithin } from './fetch-deadline.js';

/* a bundle is about 3 MB and the border-post file about 2 MB: a generous deadline, not a short one */
const BUNDLE_MS = 45000;

const NETS = new Map();   /* id → Promise<network|null> */
const BBOXES = Object.fromEntries(FEEDS.map((f) => [f.id, f.bbox]));

/** GTFS route_type (basic and the extended 100–1700 range) → the MOTIS mode names routing.js colours by */
export function motisMode(t) {
  t = +t || 0;
  if (t >= 100 && t < 200) return t === 101 || t === 102 ? 'HIGHSPEED_RAIL' : 'RAIL';
  if (t >= 200 && t < 300) return 'COACH';
  if (t >= 400 && t < 500) return 'SUBWAY';
  if (t >= 700 && t < 800) return 'BUS';
  if (t >= 900 && t < 1000) return 'TRAM';
  if (t >= 1000 && t < 1100) return 'FERRY';
  return ({ 0: 'TRAM', 1: 'SUBWAY', 2: 'RAIL', 3: 'BUS', 4: 'FERRY', 5: 'CABLE_CAR', 6: 'GONDOLA', 7: 'FUNICULAR', 11: 'BUS', 12: 'RAIL' })[t] || 'BUS';
}

function netFor(id) {
  let p = NETS.get(id); if (p) return p;
  p = jsonWithin('data/transit/' + id + '.json', BUNDLE_MS).then(loadNetwork).catch(() => { NETS.delete(id); return null; });
  NETS.set(id, p); return p;
}

/** the feeds that could serve this point (the bounding box of their stops, widened by the walk allowed) */
function candidates(p) { return feedsNear(p.lng, p.lat, BBOXES, 2); }

/* ── local time in the feed's zone ─────────────────────────────────────────────────────────────── */
function zoneParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {}; f.formatToParts(new Date(ms)).forEach((x) => { o[x.type] = x.value; });
  return { date: o.year + '-' + o.month + '-' + o.day, secs: (+o.hour) * 3600 + (+o.minute) * 60 + (+o.second) };
}
/** wall-clock (date + seconds since local midnight) in `tz` → epoch ms. Seconds may exceed 86400 (service day overrun). */
export function zonedMs(date, secs, tz) {
  const base = Date.parse(date + 'T00:00:00Z') + secs * 1000; let ms = base;
  for (let i = 0; i < 3; i++) { const z = zoneParts(ms, tz); const asUtc = Date.parse(z.date + 'T00:00:00Z') + z.secs * 1000; ms -= (asUtc - base); }
  return ms;
}

/* ── countries ──────────────────────────────────────────────────────────────────────────────────── */
function countryName(lng, lat) {
  const geo = typeof window !== 'undefined' && window.countryGeo;
  if (!geo || !geo.features) return '';
  const f = featureAt(lng, lat, geo.features); const p = (f && f.properties) || {};
  return String(p.NAME || p.name || p.ADMIN || p.NAME_EN || '').trim();
}
let CROSSINGS = null;
async function crossingPosts() {
  if (CROSSINGS) return CROSSINGS;
  CROSSINGS = jsonWithin('data/border-crossings.json', BUNDLE_MS).then((j) => (j && j.crossings) || []).catch(() => []);
  return CROSSINGS;
}
async function nearestPost(lng, lat, withinM) {
  const all = await crossingPosts(); let best = null, bd = withinM;
  for (const c of all) { const d = distanceM(lng, lat, c.x, c.y); if (d < bd) { bd = d; best = c; } }
  return best ? { name: best.en || best.n || '', m: Math.round(bd), lng: best.x, lat: best.y, hours: best.oh || null, citizenship: best.cz || null, modes: best.m || null, tz: best.tz || null, osm: best.i } : null;
}
/** the country changes along a sequence of [lng, lat] points */
export async function bordersAlong(pts) {
  const seq = []; let prev = null;
  pts.forEach((p, i) => { const n = countryName(p[0], p[1]); if (n && n !== prev) { seq.push({ name: n, at: i, lng: p[0], lat: p[1] }); prev = n; } });
  const crossings = [];
  for (let i = 1; i < seq.length; i++) {
    const a = pts[seq[i - 1].at], b = pts[seq[i].at];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    crossings.push({ from: seq[i - 1].name, to: seq[i].name, near: [mid[0], mid[1]], post: await nearestPost(mid[0], mid[1], 15000) });
  }
  return { countries: seq.map((s) => s.name), crossings };
}

/* ── plan ─────────────────────────────────────────────────────────────────────────────────────── */
/** one row of the attribution a reply prints: the reader picks the language (en | jp) */
const attr = (id) => ({ id, ...feedById(id).credit });
const isoOf = (ms) => new Date(ms).toISOString();

function toItinerary(net, feed, j, from, to, date, tz) {
  const b = net.b, legs = []; const P = (s) => ({ name: b.stops[s][0], lat: net.lat[s], lon: net.lng[s] });
  const T = (secs) => isoOf(zonedMs(date, secs, tz));
  j.legs.forEach((l, i) => {
    if (l.type === 'access') { const s0 = j.depart; legs.push({ mode: 'WALK', from: { name: 'START', lat: from.lat, lon: from.lng }, to: P(l.toStop), startTime: T(s0), endTime: T(s0 + l.sec), duration: l.sec, realTime: false, estimated: true, distance: l.m }); }
    else if (l.type === 'egress') { const t0 = j.arrive - l.sec; legs.push({ mode: 'WALK', from: P(l.fromStop), to: { name: 'END', lat: to.lat, lon: to.lng }, startTime: T(t0), endTime: T(j.arrive), duration: l.sec, realTime: false, estimated: true, distance: l.m }); }
    else if (l.type === 'transfer') { const prevEnd = legs.length ? Date.parse(legs[legs.length - 1].endTime) : 0; legs.push({ mode: 'WALK', from: P(l.fromStop), to: P(l.toStop), startTime: isoOf(prevEnd), endTime: isoOf(prevEnd + l.sec * 1000), duration: l.sec, realTime: false, estimated: true }); }
    else {
      const r = b.routes[l.route];
      legs.push({ mode: motisMode(r[2]), from: P(l.fromStop), to: P(l.toStop), startTime: T(l.depart), endTime: T(l.arrive), scheduledStartTime: T(l.depart), duration: l.arrive - l.depart,
        routeShortName: r[0], routeLongName: r[1], headsign: l.headsign, agencyName: b.agencies[r[3]] || '', realTime: false, feed: feed.id,
        coords: l.stops.map((s) => [net.lng[s], net.lat[s]]), stopTimes: l.stops.map((s, q) => ({ name: b.stops[s][0], at: T(l.times[q]) })) });
    }
  });
  return { duration: j.durationS, transfers: j.transfers, startTime: legs[0].startTime, endTime: legs[legs.length - 1].endTime, legs };
}

/**
 * Plan over the shipped timetables.
 * q: { from:{lng,lat}, to:{lng,lat}, time?:Date|ms|ISO, mode?:'walk'|'bike', maxWalkM? }
 * → { ok:true, basis, realtime:false, itineraries[], feed, attribution[], borders } or { ok:false, reason }
 */
async function plan(q) {
  const ids = candidates(q.from).filter((id) => candidates(q.to).indexOf(id) >= 0);
  if (!ids.length) return { ok: false, reason: 'no-open-timetable', note: 'no shipped feed covers both ends' };
  const feed = feedById(ids[0]); const net = await netFor(feed.id); if (!net) return { ok: false, reason: 'bundle-unavailable' };
  const when = q.time ? new Date(q.time).getTime() : Date.now(); const tz = net.b.tz || feed.tz || 'UTC';
  const z = zoneParts(when, tz);
  const r = raptorPlan(net, { from: q.from, to: q.to, date: z.date, depart: z.secs, mode: q.mode === 'bike' || q.mode === 'cycling' ? 'bike' : 'walk', maxWalkM: q.maxWalkM });
  if (!r.ok) return { ...r, feed: feed.id, tz };
  const itineraries = r.journeys.map((j) => toItinerary(net, feed, j, q.from, q.to, z.date, tz));
  const stopsAlong = []; r.journeys[0].legs.forEach((l) => { if (l.type === 'ride') l.stops.forEach((s) => stopsAlong.push([net.lng[s], net.lat[s]])); });
  let borders = null; try { borders = await bordersAlong([[q.from.lng, q.from.lat]].concat(stopsAlong, [[q.to.lng, q.to.lat]])); } catch (_) { borders = null; }
  return { ok: true, basis: r.basis, realtime: r.realtime, itineraries, feed: feed.id, tz, date: z.date, walkModel: r.walkModel, attribution: ids.map(attr), borders,
    crossBorderFeed: feed.crossBorder || [] };
}

/* ── reach ────────────────────────────────────────────────────────────────────────────────────── */
async function unionCircles(circles) {
  const feats = circles.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [circleRing(c.lng, c.lat, c.r, 18)] } }));
  const turf = typeof window !== 'undefined' && window.turf;
  if (turf && turf.ensureUnion && feats.length > 1) {
    try { await turf.ensureUnion(); const u = turf.union({ type: 'FeatureCollection', features: feats }); if (u && u.geometry) return { type: 'Feature', properties: {}, geometry: u.geometry }; } catch (_) { /* fall through: one polygon each, still the same area */ }
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: feats.map((f) => f.geometry.coordinates) } };
}

/**
 * Reachable area by public transport + walking (or cycling) from a point.
 * q: { origin:{lng,lat}, minutes?:number|number[] (≤ 120, up to 4 nested), time?:Date|ms|ISO, mode?:'walk'|'bike' }
 */
async function reach(q) {
  const ids = candidates(q.origin); if (!ids.length) return { ok: false, reason: 'no-open-timetable' };
  const feed = feedById(ids[0]); const net = await netFor(feed.id); if (!net) return { ok: false, reason: 'bundle-unavailable' };
  const mins = (Array.isArray(q.minutes) ? q.minutes : [q.minutes || 30]).map((m) => Math.max(5, Math.min(120, +m || 30))).sort((a, b) => a - b).slice(0, 4);
  const when = q.time ? new Date(q.time).getTime() : Date.now(); const tz = net.b.tz || feed.tz || 'UTC'; const z = zoneParts(when, tz);
  const mode = q.mode === 'bike' || q.mode === 'cycling' ? 'bike' : 'walk';
  const res = raptorReach(net, { origin: q.origin, date: z.date, depart: z.secs, budgetMin: mins[mins.length - 1], mode, maxWalkM: q.maxWalkM });
  if (!res.ok) return { ...res, feed: feed.id, tz };
  res.mode = mode;
  const bands = [];
  for (const m of mins) {
    const circles = bandCircles(res, m);
    bands.push({ minutes: m, circles: circles.length, feature: await unionCircles(circles) });
  }
  const byCountry = {}; res.stops.forEach((s) => { const c = countryName(s.lng, s.lat) || '—'; byCountry[c] = (byCountry[c] || 0) + 1; });
  const countries = Object.keys(byCountry).filter((c) => c !== '—');
  return { ok: true, basis: res.basis, realtime: res.realtime, feed: feed.id, tz, date: z.date, depart: z.secs, minutes: mins, bands, stops: res.stops, origin: res.origin, walkModel: res.walkModel,
    countries, byCountry, crossesBorder: countries.length > 1, attribution: ids.map(attr) };
}

const api = {
  plan, reach, coverageOf: async (id, date) => { const n = await netFor(id); return n ? coverage(n, date) : null; },
  feeds: () => FEEDS.map((f) => ({ id: f.id, country: f.country, name: f.name, licence: f.licence.spdx, bbox: f.bbox, realtime: !!f.realtime })),
  covers: (p) => candidates(p).length > 0,
  attribution: (ids) => attributionFor(ids),
  basis: planBasis, models: MODELS, motisMode,
  /* read from the registry, so the one declaration decides (js/transit-feeds.js) */
  transitousFallback: TRANSITOUS_FALLBACK,
};
if (typeof window !== 'undefined') window.IntMapTransitTimetable = api;
export default api;
