/* ============================================================================
 *  IntMap · js/quake-history-core.js — THE EARTHQUAKE RECORD OF ONE PLACE  (live-news-product)
 * ----------------------------------------------------------------------------
 *  The live earthquake layer answers «what shook in the last day / week / month». A reader who has just seen a
 *  M6.8 pin — or a headline about one — asks the next question: IS THIS UNUSUAL HERE? When did the ground last
 *  move like this, and what is the largest this place has on record? The USGS ANSS Comprehensive Catalog
 *  (ComCat) answers it: one FDSN query returns every catalogued earthquake around a point, from the oldest
 *  entry it holds (the instrumental ISC-GEM relocations from 1904, a few historical entries before) to the one
 *  that happened minutes ago.
 *
 *  This file is the arithmetic of that record: which request is made, what comes back, the largest, the rank of
 *  one quake among its neighbours, the decades, and what the record holds UP TO AN INSTANT — the master clock's
 *  (js/chronos.js). No DOM, no network, no clock of its own: node evaluates every function here on a real ComCat
 *  answer (tests/live-news-product-checks.test.mjs); js/quake-history.js fetches, paints and words it.
 *
 *  ⚠ THE RECORD IS NOT THE EARTH. A catalogue holds what was DETECTED and LOCATED. Before the global networks
 *    small earthquakes were not recorded at all, so a decade with few entries is a decade with few RECORDS. The
 *    record says so as data: `decades[i].minMag` is the smallest magnitude catalogued in that decade (measured,
 *    2026-10-08, within 300 km of Tokyo at M5+: the 1900s' smallest is M5.8, the 2010s' M5.0). Nothing here
 *    computes a rate, a probability or a «return period» — the record does not support one, and IntMap does not
 *    state what its source does not.
 *  ⚠ THE READER'S POSITION IS NOT SENT. The card can be opened from «Here, now» (the device's position), so the
 *    point asked of USGS is the centre ROUNDED TO `GRID_DEG`, and the radius asked is widened by the farthest a
 *    point of that grid cell can lie from its rounded centre — the same for every point, so the request says
 *    nothing finer than the cell. The exact circle is applied HERE (`within`).
 *  ⚠ A RECORD TOO LARGE TO READ WHOLE IS NOT CUT. `CAP` is how many events one read may bring; the count is asked
 *    first (FDSN `count`), and when the reader's floor holds more than that, the floor is RAISED to the next step
 *    that fits and the card says so — every statistic is then over a complete record at the floor it names.
 * ==========================================================================*/
import { haversineKm } from '../supabase/functions/_shared/great-circle.js';

/* ⚠ EVERY NUMBER HERE SAYS WHERE IT CAME FROM AND WHAT WOULD UNMAKE IT (.agents/rules/no-ad-hoc-hardcoding.md §4).
   · CAP 3000 — measured 2026-10-08: 2,476 events (M5+, 380 km around 36°N 140°E, the densest record tested) were
     251 kB compressed / 1.8 MB parsed and 2.6 s from earthquake.usgs.gov. 3,000 keeps one read near 300 kB and the
     map's circles and the chart's dots within one draw. Unmade if the read moves off GeoJSON or the chart off SVG.
   · GRID_DEG 1 — the privacy grain: a request names a whole-degree point (≈111 km), coarser than the 0.1° the place
     card sends for weather (js/place-dossier.js PRIVACY_GRID_DEG) because a 300 km record does not need finer.
   · RADII / MAGS — the reader's steps, not thresholds the record is judged by: 100 km is a city's surroundings,
     300 km the reach the watched places and «Here, now» already use (supabase/functions/_shared/place-watch.js),
     500 km a region. M4.5 is the floor of USGS's own global summary feeds; M7 the «major» class.
   · FROM — the request's start: before the oldest entry ComCat holds (1568, measured 2026-10-08), so the record
     starts where the catalogue starts and the card names that year rather than a year chosen here. */
export const QH = Object.freeze({
  CAP: 3000,
  GRID_DEG: 1,
  RADII: Object.freeze([100, 300, 500]),
  MAGS: Object.freeze([4.5, 5, 5.5, 6, 7]),
  DEFAULT_RADIUS: 300,
  DEFAULT_MAG: 5,
  FROM: '1000-01-01',
  ENDPOINT: 'https://earthquake.usgs.gov/fdsnws/event/1/',
  TOP: 10,
  PARAM: 'qh',
});
const YEAR_MS = 365.2425 * 86400000;
const finite = (v) => typeof v === 'number' && isFinite(v);

/* the farthest any point of a GRID_DEG cell lies from the cell's rounded centre: the half-diagonal at the equator,
   where a degree of longitude is widest — derived, so it moves with GRID_DEG */
export const SLACK_KM = Math.ceil(haversineKm(0, 0, QH.GRID_DEG / 2, QH.GRID_DEG / 2));

/** roundedCentre(lng, lat) — the point a request names: the centre on the GRID_DEG grid */
export function roundedCentre(lng, lat) {
  const g = QH.GRID_DEG;
  const r = (v) => Math.round(v / g) * g;
  let x = r(+lng); if (x > 180) x -= 360; if (x < -180) x += 360;
  return { lng: +x.toFixed(6), lat: Math.max(-90, Math.min(90, +r(+lat).toFixed(6))) };
}

/** a radius the reader can choose (the nearest step), and a magnitude floor (the nearest step at or below) */
export function radiusStep(v) {
  const n = +v; if (!finite(n) || n <= 0) return QH.DEFAULT_RADIUS;
  return QH.RADII.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b), QH.RADII[0]);
}
export function magStep(v) {
  const n = +v; if (!finite(n)) return QH.DEFAULT_MAG;
  const below = QH.MAGS.filter((m) => m <= n + 1e-9);
  return below.length ? below[below.length - 1] : QH.MAGS[0];
}

/** queryUrl(kind, { lng, lat, radiusKm, minMag }) — the FDSN request: 'count' or 'query'. The point is rounded and the
    radius widened by SLACK_KM here, so no caller can send the exact centre. Earthquakes only (no quarry blasts). */
export function queryUrl(kind, o) {
  const c = roundedCentre(o.lng, o.lat);
  const p = new URLSearchParams();
  p.set('format', 'geojson');
  p.set('eventtype', 'earthquake');
  p.set('starttime', QH.FROM);
  p.set('latitude', String(c.lat));
  p.set('longitude', String(c.lng));
  p.set('maxradiuskm', String(Math.round(+o.radiusKm + SLACK_KM)));
  p.set('minmagnitude', String(+o.minMag));
  if (kind === 'query') { p.set('orderby', 'time-asc'); p.set('limit', String(QH.CAP)); }
  return QH.ENDPOINT + (kind === 'count' ? 'count' : 'query') + '?' + p.toString();
}
/** eventUrl(id) — one event by its ComCat id (the anchor named by Atlas or a link) */
export function eventUrl(id) {
  return QH.ENDPOINT + 'query?format=geojson&eventid=' + encodeURIComponent(String(id));
}
/** the count FDSN returns: `{count, maxAllowed}` for geojson, a bare number for text */
export function readCount(j) {
  if (finite(j)) return j;
  if (j && finite(+j.count)) return +j.count;
  return null;
}

/** floorFor(asked, countAt) — the lowest step at or above `asked` whose count fits CAP. `countAt(m)` resolves to the
    count at that floor (the caller's FDSN read). Resolves to { minMag, asked, raised, counts:{m:n} } or, when even the
    highest step does not fit, that step with `cut:true` (the read is then the CAP largest, said by the card). */
export async function floorFor(asked, countAt) {
  const start = magStep(asked);
  const steps = QH.MAGS.filter((m) => m >= start);
  const counts = {};
  for (const m of steps) {
    const n = await countAt(m);
    counts[m] = n;
    if (n == null) return { minMag: m, asked: start, raised: m !== start, counts, unknown: true };
    if (n <= QH.CAP) return { minMag: m, asked: start, raised: m !== start, counts, total: n };
  }
  const top = steps[steps.length - 1];
  return { minMag: top, asked: start, raised: top !== start, counts, total: counts[top], cut: true };
}

/** normalise(feature) — one ComCat feature as the record keeps it, or null when it carries no usable point/time */
export function normalise(f) {
  if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
  const c = f.geometry.coordinates, p = f.properties || {};
  const lng = +c[0], lat = +c[1], t = +p.time;
  if (!finite(lng) || !finite(lat) || !finite(t)) return null;
  return {
    id: String(f.id || ((p.net || '') + (p.code || ''))),
    t, lng, lat,
    mag: finite(+p.mag) && p.mag !== null ? +p.mag : null,
    magType: p.magType ? String(p.magType) : '',
    depthKm: finite(+c[2]) && c[2] !== null ? +c[2] : null,
    place: p.place ? String(p.place) : (p.title ? String(p.title) : ''),
    net: p.net ? String(p.net) : '',
    url: p.url ? String(p.url) : '',
    tsunami: +p.tsunami === 1,
    shakemap: /(^|,)shakemap(,|$)/.test(String(p.types || '')),
  };
}

/** within(features, centre, radiusKm) — the exact circle, applied on the device; each event gains its distance */
export function within(features, centre, radiusKm) {
  const out = [];
  for (const f of features || []) {
    const e = normalise(f); if (!e) continue;
    const km = haversineKm(+centre.lng, +centre.lat, e.lng, e.lat);
    if (km <= +radiusKm) { e.km = Math.round(km); out.push(e); }
  }
  out.sort((a, b) => a.t - b.t || (b.mag || 0) - (a.mag || 0));
  return out;
}

const byMag = (a, b) => (b.mag == null ? -1 : b.mag) - (a.mag == null ? -1 : a.mag) || a.t - b.t;
const decadeOf = (t) => Math.floor(new Date(t).getUTCFullYear() / 10) * 10;

/** buildRecord(events, { anchor, radiusKm, minMag, centre, now }) — the record's facts. `anchor` is the quake the
    card was opened from (a normalised event, or null); it is found in the record by id, or added when the record
    was read before ComCat had it (the live feed can be minutes ahead of the query). */
export function buildRecord(events, o) {
  o = o || {};
  const ev = (events || []).slice();
  let anchor = o.anchor || null;
  if (anchor) {
    const hit = ev.find((e) => e.id === anchor.id || (Math.abs(e.t - anchor.t) < 5000 && e.mag === anchor.mag));
    if (hit) anchor = hit;
    else if (anchor.mag != null && anchor.mag >= o.minMag && (!o.centre || haversineKm(o.centre.lng, o.centre.lat, anchor.lng, anchor.lat) <= o.radiusKm)) {
      ev.push(anchor); ev.sort((a, b) => a.t - b.t);
    }
  }
  const rec = { radiusKm: +o.radiusKm, minMag: +o.minMag, centre: o.centre || null, n: ev.length, events: ev,
    firstAt: ev.length ? ev[0].t : null, lastAt: ev.length ? ev[ev.length - 1].t : null,
    largest: ev.slice().sort(byMag).slice(0, QH.TOP), decades: [], anchor: null };
  const D = new Map();
  for (const e of ev) {
    const d = decadeOf(e.t);
    let r = D.get(d); if (!r) { r = { decade: d, n: 0, minMag: null, maxMag: null }; D.set(d, r); }
    r.n++;
    if (e.mag != null) { if (r.minMag == null || e.mag < r.minMag) r.minMag = e.mag; if (r.maxMag == null || e.mag > r.maxMag) r.maxMag = e.mag; }
  }
  /* every decade from the first record to the last, the empty ones too — a gap in the record is shown as a gap */
  if (ev.length) {
    const d0 = decadeOf(rec.firstAt), d1 = decadeOf(o.now != null ? o.now : rec.lastAt);
    for (let d = d0; d <= Math.max(d0, d1); d += 10) rec.decades.push(D.get(d) || { decade: d, n: 0, minMag: null, maxMag: null });
  }
  if (anchor && ev.indexOf(anchor) >= 0) rec.anchor = rankOf(rec, anchor);
  else if (anchor) rec.anchor = { event: anchor, inRecord: false };
  return rec;
}

/** rankOf(record, e) — where one event stands: how many in the record are larger, how many the same size, the last
    event at least as large BEFORE it (and how long before) and the first one after it. Complete only because the
    record is complete at its floor and `e` is at or above it. */
function rankOf(rec, e) {
  const m = e.mag;
  if (m == null) return { event: e, inRecord: true, rank: null };
  let larger = 0, same = 0, prev = null, next = null;
  for (const x of rec.events) {
    if (x === e || x.mag == null) continue;
    if (x.mag > m) larger++;
    else if (x.mag === m) same++;
    if (x.mag >= m && x.t < e.t && (!prev || x.t > prev.t)) prev = x;
    if (x.mag >= m && x.t > e.t && (!next || x.t < next.t)) next = x;
  }
  return { event: e, inRecord: true, rank: larger + 1, larger, same, prev, next,
    yearsSincePrev: prev ? (e.t - prev.t) / YEAR_MS : null, largestOnRecord: larger === 0 };
}

/** at(record, ms) — the record as it stood at an instant: what had been catalogued by then, the last event before
    it, the largest so far, and how many come after (the clock is in their past) */
export function at(rec, ms) {
  const T = finite(ms) ? ms : Infinity;
  const shown = rec.events.filter((e) => e.t <= T);
  let largest = null;
  for (const e of shown) if (e.mag != null && (!largest || e.mag > largest.mag)) largest = e;
  return { until: finite(ms) ? ms : null, shown, after: rec.events.length - shown.length,
    last: shown.length ? shown[shown.length - 1] : null, largest };
}

/** ageClass(eventMs, clockMs) — how long before the clock's instant, in the four bands the map and its key share */
export const AGE_BANDS = Object.freeze([
  Object.freeze({ maxYears: 1, colour: '#ff3b30' }),
  Object.freeze({ maxYears: 10, colour: '#ff9500' }),
  Object.freeze({ maxYears: 50, colour: '#ffcc00' }),
  Object.freeze({ maxYears: Infinity, colour: '#8e8e93' }),
]);
export function ageBand(eventMs, clockMs) {
  const y = Math.max(0, (clockMs - eventMs) / YEAR_MS);
  for (let i = 0; i < AGE_BANDS.length; i++) if (y <= AGE_BANDS[i].maxYears) return i;
  return AGE_BANDS.length - 1;
}

/** ring(centre, km, n) — the circle the record covers, as a closed ring of [lng, lat] (great-circle destination) */
export function ring(centre, km, n) {
  const N = n || 96, R = 6371, d = km / R, la = centre.lat * Math.PI / 180, lo = centre.lng * Math.PI / 180, out = [];
  for (let i = 0; i <= N; i++) {
    const b = (i % N) / N * 2 * Math.PI;
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    out.push([+(((lo2 * 180 / Math.PI) + 540) % 360 - 180).toFixed(5), +(la2 * 180 / Math.PI).toFixed(5)]);
  }
  return out;
}

/* ── the link: `?qh=<lat>,<lng>,<radius>,<floor>[,<event id>]` — the camera and the clock ride in the hash ── */
export function encodeLink(o) {
  const parts = [(+o.lat).toFixed(3), (+o.lng).toFixed(3), String(radiusStep(o.radiusKm)), String(magStep(o.minMag))];
  if (o.eventId && /^[A-Za-z0-9_-]{2,40}$/.test(String(o.eventId))) parts.push(String(o.eventId));
  return QH.PARAM + '=' + parts.join(',');
}
export function decodeLink(search) {
  let v = null;
  try { v = new URLSearchParams(String(search || '')).get(QH.PARAM); } catch (_) { v = null; }
  if (!v) return null;
  const p = v.split(',');
  const lat = +p[0], lng = +p[1];
  if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const out = { lat, lng, radiusKm: radiusStep(p[2]), minMag: magStep(p[3]) };
  if (p[4] && /^[A-Za-z0-9_-]{2,40}$/.test(p[4])) out.eventId = p[4];
  return out;
}

/** brief(e) — one event as Atlas and the summary carry it */
export function brief(e) {
  if (!e) return null;
  return { id: e.id, time: new Date(e.t).toISOString(), mag: e.mag, magType: e.magType || null, depthKm: e.depthKm,
    place: e.place || null, distanceKm: e.km != null ? e.km : null, lng: e.lng, lat: e.lat, url: e.url || null, tsunamiFlag: !!e.tsunami };
}

/** forAtlas(record, clockMs, floor) — what Atlas is handed: the facts, the floor and why, and what the record is not */
export function forAtlas(rec, clockMs, floor) {
  const A = rec.anchor, now = at(rec, clockMs);
  return {
    source: 'USGS ANSS Comprehensive Earthquake Catalog (ComCat), FDSN event query' + (rec.events.some((e) => /^iscgem/.test(e.net)) ? '; entries from the ISC-GEM Global Instrumental Earthquake Catalogue (ISC/GEM Foundation, CC BY-SA 3.0)' : ''),
    radiusKm: rec.radiusKm, minMagnitude: rec.minMag,
    floorRaised: floor && floor.raised ? { asked: floor.asked, counts: floor.counts } : null,
    truncatedToLargest: !!(floor && floor.cut),
    events: rec.n,
    recordStarts: rec.firstAt != null ? new Date(rec.firstAt).toISOString().slice(0, 10) : null,
    latest: brief(rec.events[rec.events.length - 1]),
    largest: rec.largest.map(brief),
    decades: rec.decades.map((d) => ({ decade: d.decade, events: d.n, smallestRecorded: d.minMag, largest: d.maxMag })),
    anchor: A ? (A.inRecord ? { event: brief(A.event), rank: A.rank, largerOnRecord: A.larger, sameSize: A.same,
      previousAtLeastAsLarge: brief(A.prev), yearsSincePrevious: A.yearsSincePrev != null ? +A.yearsSincePrev.toFixed(1) : null,
      nextAtLeastAsLarge: brief(A.next) } : { event: brief(A.event), inRecord: false }) : null,
    atClock: now.until != null ? { until: new Date(now.until).toISOString(), recordedByThen: now.shown.length, after: now.after, lastBefore: brief(now.last), largestByThen: brief(now.largest) } : null,
    caveat: 'A catalogue holds what was detected and located: older decades miss smaller earthquakes (see decades[].smallestRecorded). No rate or probability is implied.',
  };
}
