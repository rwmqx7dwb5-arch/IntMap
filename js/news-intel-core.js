/* ============================================================================
 *  IntMap · js/news-intel-core.js — THE ARITHMETIC OF THE NEWS PULSE  (news-intelligence)
 * ----------------------------------------------------------------------------
 *  Every claim the news pulse, the country brief, the outage↔news link and the ingest badge make is
 *  computed here, from data handed in — no DOM, no network, no clock of its own — so node evaluates
 *  the SHIPPED functions on real production data (tests/news-intelligence-checks.test.mjs) and the
 *  browser (js/news-intel.js) only fetches, paints and words them.
 *
 *  ══ WHAT IS COUNTED ═══════════════════════════════════════════════════════════════════════════
 *  An EVENT (docs/NEWS-EVENTS.md — one happening, however many outlets reported it), counted on the
 *  UTC day it was FIRST reported, at its representative point. The server groups by point × day ×
 *  category (public.news_pulse); the point is given a country HERE, against the country outlines the
 *  page already has (Natural Earth). ⚠ NEVER BY THE PLACE NAME: production holds an event named
 *  «Georgia» whose point is Atlanta — a spelling would file it under the Caucasus.
 *  ⚠ A point no country contains (a strait, a sea, the UN building's point in the East River if it ever
 *    sat there) is COUNTED AS «not in any country», and an event with no point at all as «no place»;
 *    both are reported with the totals, never dropped — a map that loses them looks complete and isn't.
 *
 *  ══ WINDOWS ═══════════════════════════════════════════════════════════════════════════════════
 *  A window is the W most recent UTC dates ending with the date of `until` (that one partial while the
 *  clock is live). The comparison is the W dates before it. Both come out of one fetch of 30 days.
 * ==========================================================================*/

import { judge } from './freshness.js';

const DAY = 86400000;

/* ── the country index ────────────────────────────────────────────────────────────────────────── */

/* the ISO 3166-1 alpha-2 ladder js/countries-ui.js and js/net-health-live.js use: `-99` is Natural
   Earth's «no code» (Kosovo, Northern Cyprus, Somaliland…), so those are keyed by their A3 name instead */
export function countryKeyOf(p) {
  p = p || {};
  const a = p.ISO_A2_EH, b = p.ISO_A2;
  const v = (a && a !== '-99') ? a : b;
  if (v && v !== '-99') return String(v).toUpperCase();
  const a3 = p.ADM0_A3 || p.SOV_A3 || '';
  return a3 ? 'X-' + String(a3).toUpperCase() : '';
}
export const isIso2 = (k) => /^[A-Z]{2}$/.test(String(k || ''));

function ringHas(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
  }
  return inside;
}

/* ══ A COASTAL CITY IS NOT AT SEA ══════════════════════════════════════════════════════════════════
   MEASURED (2026-10-02, all 17,435 placed events in production against Natural Earth 10 m): the point the
   server gives Miami, Copenhagen, Venice, Mumbai, Nuuk, Banjul or Mombasa lies 0.1–1.9 km OFF the 10 m
   outline — the outline is generalised at 1:10,000,000 and the cities are on its edge. The first points
   that are genuinely at sea begin a little further out (Kota Kinabalu's harbour point 2.2 km, «English
   Channel» 2.5 km, «Bab el-Mandeb Strait» 9.2 km, «Strait of Hormuz» 22 km). So a point outside every
   polygon is given to the nearest country only when its nearest edge is within COAST_KM.
   ⚠ What this still gets wrong, measured on the same data: 3 events whose upstream point for a SEA sits on
     a coast («Persian Gulf» 1.6 km off Qatar ×2, «English Channel» 0.9 km off England ×1).
   ⚠ EXPIRES with the outline: at 50 m or 110 m the generalisation is coarser and the same cities are
     farther off — js/news-intel.js asks for the 10 m outline for that reason. */
export const COAST_KM = 2;

function nearestEdgeKm(P, lng, lat) {
  const cx = Math.cos(lat * Math.PI / 180);
  let best = Infinity;
  for (const r of P.rings) {
    for (let i = 1; i < r.length; i++) {
      const ax = (r[i - 1][0] - lng) * cx, ay = r[i - 1][1] - lat, bx = (r[i][0] - lng) * cx, by = r[i][1] - lat;
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / ((dx * dx + dy * dy) || 1e-12)));
      const d = Math.hypot(ax + t * dx, ay + t * dy) * 111.2;
      if (d < best) best = d;
    }
  }
  return best;
}

/** makeCountryIndex(features, { coastKm }) → { keyAt(lng, lat), name(key), keys() } — one bbox per POLYGON,
    not per country (a country with remote territory has a union box spanning the planet: js/countries-ui.js #R426) */
export function makeCountryIndex(features, opts) {
  const coastKm = (opts && opts.coastKm != null) ? +opts.coastKm : COAST_KM;
  const polys = [], names = new Map();
  for (const f of (features || [])) {
    const k = countryKeyOf(f && f.properties); if (!k || !f.geometry) continue;
    const p = f.properties || {};
    if (!names.has(k)) names.set(k, String(p.NAME || p.ADMIN || p.NAME_EN || k));
    const g = f.geometry;
    const list = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of list) {
      if (!rings || !rings[0] || rings[0].length < 4) continue;
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const c of rings[0]) { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; }
      polys.push({ k, rings, b: [w, s, e, n] });
    }
  }
  function keyAt(lng, lat) {
    if (!isFinite(lng) || !isFinite(lat)) return null;
    const pt = [lng, lat];
    for (const P of polys) {
      const b = P.b; if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!ringHas(pt, P.rings[0])) continue;
      let hole = false; for (let h = 1; h < P.rings.length; h++) if (ringHas(pt, P.rings[h])) { hole = true; break; }
      if (!hole) return P.k;
    }
    if (!(coastKm > 0)) return null;
    /* outside every polygon: the nearest edge, among the polygons whose box is within reach */
    const padLat = coastKm / 111.2, padLng = padLat / Math.max(0.05, Math.cos(lat * Math.PI / 180));
    let bestK = null, best = coastKm;
    for (const P of polys) {
      const b = P.b; if (lng < b[0] - padLng || lng > b[2] + padLng || lat < b[1] - padLat || lat > b[3] + padLat) continue;
      const d = nearestEdgeKm(P, lng, lat);
      if (d <= best) { best = d; bestK = P.k; }
    }
    return bestK;
  }
  return { keyAt, name: (k) => names.get(k) || k, keys: () => Array.from(names.keys()), size: polys.length };
}

/* ── the pulse ────────────────────────────────────────────────────────────────────────────────── */

/** decodePulse(json from public.news_pulse) → { since, until, oldest, newest, pts, rows:[{i,day,cat,n,m}] } */
export function decodePulse(j) {
  const o = j || {};
  const pts = Array.isArray(o.pts) ? o.pts.map((p) => [+p[0], +p[1]]) : [];
  const rows = (Array.isArray(o.rows) ? o.rows : []).map((r) => ({ i: +r[0], day: String(r[1]), cat: String(r[2]), n: +r[3] || 0, m: +r[4] || 0 }));
  return { since: o.since || null, until: o.until || null, oldest: o.oldest || null, newest: o.newest || null, pts, rows };
}

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
/** the W UTC dates ending with the date of `untilMs` (newest last) */
function windowDays(untilMs, w) {
  const out = [], d0 = Date.parse(utcDay(untilMs) + 'T00:00:00Z');
  for (let k = w - 1; k >= 0; k--) out.push(utcDay(d0 - k * DAY));
  return out;
}

/**
 * aggregate(pulse, index, { untilMs, windowDays: W, category, seriesDays })
 *   → { countries: Map(key → { key, n, prev, multi, cats, series[], pts:Set(i) }), total, unplaced, notInCountry,
 *       days, prevDays, seriesDays }
 */
export function aggregate(pulse, index, opts) {
  const o = opts || {};
  const W = Math.max(1, o.windowDays | 0 || 1);
  const S = Math.max(W, o.seriesDays | 0 || 30);
  const until = o.untilMs;
  const days = windowDays(until, W), prevDays = windowDays(Date.parse(days[0] + 'T00:00:00Z') - DAY, W);
  const series = windowDays(until, S);
  const inW = new Set(days), inP = new Set(prevDays), sIdx = new Map(series.map((d, i) => [d, i]));
  const cat = o.category && o.category !== 'all' ? o.category : null;
  const ptKey = pulse.pts.map((p) => index.keyAt(p[0], p[1]));
  const countries = new Map();
  let total = 0, unplaced = 0, notInCountry = 0, prevTotal = 0;
  const C = (k) => { let c = countries.get(k); if (!c) { c = { key: k, n: 0, prev: 0, multi: 0, cats: {}, series: new Array(S).fill(0), pts: new Set() }; countries.set(k, c); } return c; };
  for (const r of pulse.rows) {
    if (cat && r.cat !== cat) continue;
    const w = inW.has(r.day), p = inP.has(r.day), si = sIdx.get(r.day);
    if (!w && !p && si == null) continue;
    if (w) total += r.n; if (p) prevTotal += r.n;
    if (r.i < 0) { if (w) unplaced += r.n; continue; }
    const k = ptKey[r.i];
    if (!k) { if (w) notInCountry += r.n; continue; }
    const c = C(k);
    if (w) { c.n += r.n; c.multi += r.m; c.cats[r.cat] = (c.cats[r.cat] || 0) + r.n; c.pts.add(r.i); }
    if (p) c.prev += r.n;
    if (si != null) c.series[si] += r.n;
  }
  /* a country seen only in the series (or only in the comparison) is still a country of this answer */
  return { countries, total, prevTotal, unplaced, notInCountry, days, prevDays, seriesDays: series };
}

/** the change between two counts, as the reader reads it: «new» (nothing before), a ratio, or «none» */
export function change(n, prev) {
  if (!n && !prev) return { kind: 'none', ratio: null };
  if (!prev) return { kind: 'new', ratio: null };
  return { kind: n >= prev ? 'up' : 'down', ratio: n / prev };
}

/**
 * rank(agg, mode, limit) — 'volume': most events first; 'rising': the largest increase over the previous
 * window, measured as a difference of counts (a ratio would put a country going 1 → 3 above one going
 * 40 → 90, and the first is noise). Ties go to the more independently reported, then the key.
 */
export function rank(agg, mode, limit) {
  const list = Array.from(agg.countries.values()).filter((c) => (mode === 'rising' ? c.n > c.prev : c.n > 0));
  const score = (c) => (mode === 'rising' ? c.n - c.prev : c.n);
  list.sort((a, b) => (score(b) - score(a)) || (b.multi - a.multi) || (a.key < b.key ? -1 : 1));
  return limit ? list.slice(0, limit) : list;
}

/** the value painted for one country, 0…1 — on a square-root scale of the window's largest count, because
    one country (the United States, 975 + 563 events at two points in 6 weeks, measured 2026-10-02) would
    otherwise leave every other country in the palest step */
export function shade(agg, mode) {
  const out = new Map();
  const vals = Array.from(agg.countries.values()).map((c) => (mode === 'rising' ? c.n - c.prev : c.n));
  const max = Math.max(1, ...vals);
  for (const c of agg.countries.values()) {
    const v = mode === 'rising' ? c.n - c.prev : c.n;
    if (v <= 0) continue;
    out.set(c.key, Math.sqrt(v / max));
  }
  return out;
}

/* ── outages ↔ news ───────────────────────────────────────────────────────────────────────────── */

/**
 * linkOutages(outages, events, { beforeMs, afterMs })
 *   outages: [{ cc, start(ms), end(ms), … }]   events: [{ cc, at(ms), … }]
 * → the outages, each with `news`: the events in the SAME country first reported from `beforeMs` before
 *   the outage began to `afterMs` after it ended. The tie is place and time only — it says the two were
 *   reported together, not that one caused the other (the panel says exactly that).
 */
export function linkOutages(outages, events, opts) {
  const o = opts || {};
  const before = o.beforeMs != null ? o.beforeMs : 12 * 3600000;
  const after = o.afterMs != null ? o.afterMs : 24 * 3600000;
  const byCc = new Map();
  for (const e of (events || [])) { if (!e || !e.cc) continue; const l = byCc.get(e.cc) || []; l.push(e); byCc.set(e.cc, l); }
  return (outages || []).map((x) => {
    const lo = x.start - before, hi = (x.end != null ? x.end : x.start) + after;
    const news = (byCc.get(x.cc) || []).filter((e) => e.at >= lo && e.at <= hi).sort((a, b) => a.at - b.at);
    return Object.assign({}, x, { news });
  });
}

/** an IODA /outages/events row → { cc, name, start, end, signal, score } — the entity is read from the
    location the SERVICE wrote («country/PY»), never from a name */
export function outageOf(r) {
  const loc = String((r && r.location) || '');
  const m = /^country\/([A-Za-z]{2})$/.exec(loc);
  if (!m) return null;
  const start = (+r.start || 0) * 1000, dur = (+r.duration || 0) * 1000;
  if (!start) return null;
  return { cc: m[1].toUpperCase(), name: String(r.location_name || m[1]), start, end: dur > 0 ? start + dur : null,
    signal: String(r.datasource || ''), method: String(r.method || ''), score: +r.score || 0 };
}

/* ── the ingest badge ─────────────────────────────────────────────────────────────────────────── */

/* «every 20 minutes» (the cron form star-slash-20 in the minute field, stars elsewhere) → 20 minutes. Only the minute-step form; any other schedule is not read (the median
   gap of the runs then stands in, which is a measurement rather than a parse). */
export function scheduleMs(expr) {
  const m = /^\*\/(\d{1,2})\s+\*\s+\*\s+\*\s+\*$/.exec(String(expr || '').trim());
  return m ? (+m[1]) * 60000 : null;
}

/**
 * ingestVerdict(health | null, { now, error }) → { state, rhythmMs, rhythmFrom, lastOkAt, failing:[stage],
 *   skipped:[stage] } — `state` is the freshness vocabulary (js/freshness.js): `unverified` when the
 *   summary could not be asked, `stale` when the last successful run is more than three rhythms ago
 *   (js/freshness.js `judge` — the one rule).
 *   A stage is FAILING when its last run left an error after its last clean run.
 */
export function ingestVerdict(h, opts) {
  const o = opts || {};
  if (!h || o.error) return { state: 'unverified', rhythmMs: null, rhythmFrom: null, lastOkAt: null, failing: [], skipped: [] };
  const sched = scheduleMs(h.tick_schedule);
  const gap = Number(h.median_gap_s) > 0 ? Number(h.median_gap_s) * 1000 : null;
  const rhythmMs = sched || gap;
  const rhythmFrom = sched ? 'schedule' : gap ? 'median-gap' : null;
  const lastOk = h.last_ok_at ? Date.parse(h.last_ok_at) : null;
  const now = o.now != null ? o.now : (h.checked_at ? Date.parse(h.checked_at) : null);
  const failing = [], skipped = [];
  const st = h.stages || {};
  for (const k of Object.keys(st).sort()) {
    const s = st[k] || {};
    const err = s.last_error_at ? Date.parse(s.last_error_at) : null, ok = s.last_ok_at ? Date.parse(s.last_ok_at) : null;
    if (err != null && (ok == null || err > ok)) failing.push(k);
    else if (s.last_skipped_at && (ok == null || Date.parse(s.last_skipped_at) >= ok)) skipped.push(k);
  }
  /* the rule «more than three rhythms without a success» is js/freshness.js's, not a second copy here */
  const j = judge({ at: lastOk, now, rhythmMs });
  return { state: j.state, ageMs: j.ageMs, rhythmMs, rhythmFrom, lastOkAt: lastOk, failing, skipped };
}

/* ── distance and the line between two points (the country brief's company lines and the story's spread) ── */
/** km(a, b) — great-circle distance in km between two [lng, lat] (mean Earth radius 6,371 km) */
export const km = (a, b) => { const D = Math.PI / 180, dl = (b[1] - a[1]) * D, dg = (b[0] - a[0]) * D; const h = Math.sin(dl / 2) ** 2 + Math.cos(a[1] * D) * Math.cos(b[1] * D) * Math.sin(dg / 2) ** 2; return 12742 * Math.asin(Math.sqrt(Math.min(1, h))); };
/** arc(a, b, n) — n + 1 points along the great circle a → b that do not wrap round the back of the world
    (the js/world-packs-rows.js rule: each longitude is kept within 180° of the one before) */
export function arc(a, b, n) {
  const D = Math.PI / 180, p1 = [a[1] * D, a[0] * D], p2 = [b[1] * D, b[0] * D];
  const dd = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin((p2[0] - p1[0]) / 2), 2) + Math.cos(p1[0]) * Math.cos(p2[0]) * Math.pow(Math.sin((p2[1] - p1[1]) / 2), 2)));
  if (!(dd > 1e-9)) return [a.slice(), b.slice()];
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * dd) / Math.sin(dd), B = Math.sin(f * dd) / Math.sin(dd);
    const x = A * Math.cos(p1[0]) * Math.cos(p1[1]) + B * Math.cos(p2[0]) * Math.cos(p2[1]);
    const y = A * Math.cos(p1[0]) * Math.sin(p1[1]) + B * Math.cos(p2[0]) * Math.sin(p2[1]);
    const z = A * Math.sin(p1[0]) + B * Math.sin(p2[0]);
    out.push([Math.atan2(y, x) / D, Math.atan2(z, Math.hypot(x, y)) / D]);
  }
  for (let i = 1; i < out.length; i++) { while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360; while (out[i][0] - out[i - 1][0] < -180) out[i][0] += 360; }
  return out;
}
