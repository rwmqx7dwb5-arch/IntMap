#!/usr/bin/env node
/* ============================================================================
 *  IntMap · scripts/build-transit-timetables.mjs — GTFS TIMETABLES → data/transit-<id>.json
 * ----------------------------------------------------------------------------
 *  Compiles a publisher's GTFS archive into the compact bundle js/transit-raptor.js plans over, for
 *  the feeds in js/transit-feeds.js (each of whose licence permits commercial use — the registry
 *  refuses to build any other).
 *
 *    node scripts/build-transit-timetables.mjs --feed lu            fetch the publisher's archive, compile, write
 *    node scripts/build-transit-timetables.mjs --feed lu --zip f.zip  the same from a local archive
 *    node scripts/build-transit-timetables.mjs --list               the registry and what is built
 *
 *  ══ WHAT A BUNDLE KEEPS, AND WHAT IT DOES NOT ═════════════════════════════════════════════════
 *   · a WINDOW of up to 14 days from the day it is built (`window.start`, `window.days`): every trip
 *     carries a day mask over that window, so a plan for any date in it is exact, and a plan for a
 *     date outside it is refused (transit-raptor.js `coverage`) — never answered from a «typical day».
 *   · times in whole minutes (arrival and departure per stop, as deltas). GTFS seconds are rounded;
 *     the error is below 30 s per stop and is stated in the bundle (`timeResolution`).
 *   · trips with `frequencies.txt` are NOT expanded (the feeds built so far carry none that matter;
 *     the count of skipped ones is written as `skipped.frequencyTrips`).
 *   · no shapes (the line drawn is the stop-to-stop chord, and the UI says so).
 *   · no fares, no real-time. `realtime` is null and the bundle says «scheduled» in every plan.
 *
 *  ⚠ NOT IN `npm test` (it fetches). tests/transit-timetable-checks.test.mjs validates the committed
 *  bundle and runs the planner over it.
 * ==========================================================================*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { records } from './lib/zip-lines.mjs';
import { fetchChecked, USER_AGENT } from './lib/upstream.mjs';
import { FEEDS, feedById, licenceAllowsCommercial } from '../js/transit-feeds.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const WINDOW_DAYS = 14;
const dir = (id) => 'data/transit-' + id + '.json';

/* ⚠ 出自は値である（check:datagov が実行せずに読む）。上流が述べることだけを書く。 */
export const GOVERNANCE = {
  'data/transit-lu.json': {
    upstreams: [
      { publisher: 'Administration des transports publics (Luxembourg)', url: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/',
        licence: 'CC-BY-4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true, creditRequired: true,
        fields: 'GTFS agency, routes, trips, stop_times, stops, calendar, calendar_dates — compiled to minute-resolution patterns over a 14-day window',
        paidBy: 'Timetables — Administration des transports publics (Luxembourg), CC BY 4.0, data.public.lu' },
    ],
    publisher: 'Administration des transports publics (Luxembourg)',
    url: 'https://data.public.lu/fr/datasets/horaires-et-arrets-des-transport-publics-gtfs/',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', attribution: true,
    paidBy: 'Timetables — Administration des transports publics (Luxembourg), CC BY 4.0, data.public.lu',
    cadence: 'P3D',
    cadenceBasis: {
      observed: 'measured 2026-11-20 on data.public.lu: resources dated 2026-11-05, 2026-11-12 and 2026-11-20 — a new archive every week, each valid about four weeks ahead. The bundle holds a 14-day window (WINDOW_DAYS), so it is rebuilt every three days: the window never has fewer than 11 days left, and a date beyond it is refused (js/transit-raptor.js coverage)',
      expires: 'if the publisher moves to a different schedule, or WINDOW_DAYS changes',
      canon: 'scripts/build-transit-timetables.mjs WINDOW_DAYS',
    },
    autoRefresh: 'one dataset-API request and one archive download from data.public.lu, no key; the dataset licence is re-read and the build refuses any change from cc-by, the archive must contain a calendar covering a day from today on, and nothing is written when any of that fails',
    /* dates and counts are written IN the bundle by the build that measured them (generatedAt, asOf, quality): an unattended rebuild cannot restate a literal */
    schema: 'scripts/build-transit-timetables.mjs (stops [name, lat*1e5, lon*1e5, group]; patterns {r, s, f, t}) — read by js/transit-raptor.js; tests/transit-timetable-checks.test.mjs',
    builtBy: 'scripts/build-transit-timetables.mjs',
  },
};

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
const fromYmd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
/** HH:MM:SS (hours may exceed 24) → seconds, or NaN */
function secs(t) { if (!t) return NaN; const p = t.trim().split(':'); return p.length < 2 ? NaN : (+p[0]) * 3600 + (+p[1]) * 60 + (+(p[2] || 0)); }

/** compile a GTFS archive → { bundle parts, stats }. `today` is YYYY-MM-DD (injected so a test is deterministic). */
export async function compileGtfs(zip, today) {
  const todayD = new Date(today + 'T00:00:00Z');
  /* 1 · services → which of the dates in the window each runs on */
  const cal = new Map(); let feedStart = '99999999', feedEnd = '00000000';
  for await (const r of records(zip, 'calendar.txt')) {
    cal.set(r.service_id, { dow: [r.sunday, r.monday, r.tuesday, r.wednesday, r.thursday, r.friday, r.saturday].map((x) => x === '1'), s: r.start_date, e: r.end_date, add: new Set(), del: new Set() });
    if (r.start_date < feedStart) feedStart = r.start_date; if (r.end_date > feedEnd) feedEnd = r.end_date;
  }
  for await (const r of records(zip, 'calendar_dates.txt')) {
    let c = cal.get(r.service_id); if (!c) { c = { dow: [false, false, false, false, false, false, false], s: '99999999', e: '00000000', add: new Set(), del: new Set() }; cal.set(r.service_id, c); }
    (r.exception_type === '1' ? c.add : c.del).add(r.date);
    if (r.date < feedStart) feedStart = r.date; if (r.date > feedEnd) feedEnd = r.date;
  }
  if (feedEnd === '00000000') throw new Error('the archive has no calendar');
  let start = fromYmd(feedStart); if (start < todayD) start = todayD;
  const endAll = fromYmd(feedEnd);
  if (start > endAll) throw new Error('the archive expired on ' + feedEnd + ' — it covers no day from ' + today + ' on');
  let days = Math.min(WINDOW_DAYS, Math.round((endAll - start) / 864e5) + 1);
  const win = []; for (let i = 0; i < days; i++) win.push(new Date(start.getTime() + i * 864e5));
  const maskOf = new Map();
  for (const [sid, c] of cal) {
    let m = 0n;
    win.forEach((d, i) => {
      const key = d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate());
      const base = key >= c.s && key <= c.e && c.dow[d.getUTCDay()];
      if ((base && !c.del.has(key)) || c.add.has(key)) m |= 1n << BigInt(i);
    });
    maskOf.set(sid, m);
  }
  /* 2 · agencies, routes, trips */
  const agencies = []; const agIdx = new Map();
  let tz = ''; for await (const r of records(zip, 'agency.txt')) { agIdx.set(r.agency_id || '', agencies.length); agencies.push(r.agency_name); if (!tz) tz = r.agency_timezone || ''; }
  const routes = []; const routeIdx = new Map();
  for await (const r of records(zip, 'routes.txt')) {
    routeIdx.set(r.route_id, routes.length);
    const ai = agIdx.has(r.agency_id || '') ? agIdx.get(r.agency_id || '') : 0;
    routes.push([r.route_short_name || '', r.route_long_name || '', +r.route_type || 0, ai, /^[0-9A-Fa-f]{6}$/.test(r.route_color || '') ? r.route_color.toLowerCase() : '']);
  }
  const trips = new Map(); let noService = 0;
  for await (const r of records(zip, 'trips.txt')) {
    const m = maskOf.get(r.service_id); if (!m) { noService++; continue; }
    if (m === 0n) continue;
    trips.set(r.trip_id, { r: routeIdx.get(r.route_id), m, hs: r.trip_headsign || '', st: [] });
  }
  const freq = new Set(); for await (const r of records(zip, 'frequencies.txt')) freq.add(r.trip_id);
  /* 3 · stop_times (streamed — the file can be hundreds of MB) */
  const stopRow = new Map();
  for await (const r of records(zip, 'stops.txt')) stopRow.set(r.stop_id, r);
  let rows = 0;
  for await (const r of records(zip, 'stop_times.txt')) {
    const t = trips.get(r.trip_id); if (!t) continue;
    const a = secs(r.arrival_time), d = secs(r.departure_time);
    t.st.push([+r.stop_sequence, r.stop_id, Number.isFinite(a) ? a : d, Number.isFinite(d) ? d : a, +(r.pickup_type || 0) === 1 ? 1 : 0, +(r.drop_off_type || 0) === 1 ? 2 : 0]);
    rows++;
  }
  /* 4 · patterns: one per (route, stop sequence, board/alight flags) */
  const stops = []; const stopOf = new Map(); const groupOf = new Map();
  const useStop = (sid) => {
    let i = stopOf.get(sid); if (i !== undefined) return i;
    const s = stopRow.get(sid); i = stops.length; stopOf.set(sid, i);
    const parent = s && s.parent_station ? s.parent_station : '';
    let g = -1; if (parent) { if (!groupOf.has(parent)) groupOf.set(parent, groupOf.size); g = groupOf.get(parent); }
    stops.push([s ? s.stop_name : sid, Math.round(+(s ? s.stop_lat : 0) * 1e5), Math.round(+(s ? s.stop_lon : 0) * 1e5), g]);
    return i;
  };
  const patterns = new Map(); let skippedFreq = 0, skippedShort = 0, skippedTime = 0;
  const hex = (m) => m.toString(16);
  for (const [tid, t] of trips) {
    if (freq.has(tid)) { skippedFreq++; continue; }
    if (t.st.length < 2) { skippedShort++; continue; }
    t.st.sort((x, y) => x[0] - y[0]);
    if (t.st.some((x) => !Number.isFinite(x[2]) || !Number.isFinite(x[3]))) { skippedTime++; continue; }
    const seq = t.st.map((x) => useStop(x[1]));
    const fl = t.st.map((x) => x[4] | x[5]);
    const key = t.r + '|' + seq.join(',') + '|' + fl.join('');
    let p = patterns.get(key); if (!p) { p = { r: t.r, s: seq, f: fl.some(Boolean) ? fl : null, hs: {}, t: [] }; patterns.set(key, p); }
    p.hs[t.hs] = (p.hs[t.hs] || 0) + 1;
    /* minutes: arrival then departure per stop, as deltas from the previous value; first value absolute */
    const seqT = []; let prev = 0, firstDone = false;
    for (const x of t.st) for (const v of [x[2], x[3]]) { const mm = Math.round(v / 60); if (!firstDone) { seqT.push(mm); firstDone = true; } else seqT.push(mm - prev); prev = mm; }
    /* a time that runs backwards would break the engine's FIFO assumption */
    let mono = true; { let q = seqT[0]; for (let i = 1; i < seqT.length; i++) { q += seqT[i]; if (seqT[i] < 0) mono = false; } }
    if (!mono) { skippedTime++; continue; }
    p.t.push([hex(t.m), ...seqT]);
  }
  const pats = [];
  for (const p of patterns.values()) {
    p.t.sort((a, b) => a[1] - b[1]);
    const hs = Object.keys(p.hs).sort((a, b) => p.hs[b] - p.hs[a])[0] || '';
    const o = { r: p.r, s: p.s }; if (p.f) o.f = p.f; if (hs) o.h = hs; o.t = p.t;
    if (o.t.length) pats.push(o);
  }
  pats.sort((a, b) => (a.r - b.r) || (a.s[0] - b.s[0]) || (a.t[0][1] - b.t[0][1]));
  let w = 180, s = 90, e = -180, n = -90;
  for (const x of stops) { const lat = x[1] / 1e5, lon = x[2] / 1e5; if (lat === 0 && lon === 0) continue; w = Math.min(w, lon); e = Math.max(e, lon); s = Math.min(s, lat); n = Math.max(n, lat); }
  return {
    windowStart: ymd(start), days, feedValid: [feedStart, feedEnd],
    tz, agencies, routes, stops, patterns: pats, bbox: [w, s, e, n].map((v) => Math.round(v * 1e4) / 1e4),
    stats: { stopTimeRows: rows, tripsKept: [...patterns.values()].reduce((a, p) => a + p.t.length, 0), patterns: pats.length, skipped: { frequencyTrips: skippedFreq, shortTrips: skippedShort, nonMonotonicOrMissingTime: skippedTime, tripsWithoutService: noService } },
  };
}

async function resolveUrl(feed) {
  if (!feed.resolve) return feed.url;
  const ds = await fetchChecked(feed.resolve.api, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } }, { as: 'json', attempts: 3, timeoutMs: 60000 });
  const zips = (ds.resources || []).filter((r) => /zip/i.test(r.format || '') || /\.zip($|\?)/i.test(r.url || '')).sort((a, b) => String(b.last_modified || b.created_at).localeCompare(String(a.last_modified || a.created_at)));
  if (!zips.length) throw new Error(feed.id + ': the dataset lists no zip resource');
  if (ds.license && ds.license !== 'cc-by') throw new Error(feed.id + ': the publisher now states licence ' + ds.license + ' — re-read it before building');
  return zips[0].url;
}

async function main() {
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  if (process.argv.includes('--list')) {
    for (const f of FEEDS) console.log(f.id.padEnd(6), f.licence.spdx.padEnd(10), fs.existsSync(path.join(ROOT, dir(f.id))) ? 'built' : 'NOT BUILT', f.name);
    return;
  }
  const id = arg('--feed');
  if (!id) {   /* the unattended refresh (scripts/data-refresh.mjs) runs a builder with no arguments: every feed, each independent */
    let failed = 0;
    for (const f of FEEDS) { try { await buildOne(f, arg('--zip')); } catch (e) { failed++; console.error(f.id + ': ' + e.message); } }
    if (failed) process.exit(1);
    return;
  }
  const feed = feedById(id);
  if (!feed) throw new Error('--feed <id>: one of ' + FEEDS.map((f) => f.id).join(', '));
  await buildOne(feed, arg('--zip'));
}

async function buildOne(feed, zipArg) {
  const id = feed.id;
  if (!licenceAllowsCommercial(feed.licence.spdx)) throw new Error(id + ': ' + feed.licence.spdx + ' does not permit commercial use — IntMap does not ship it');
  const out = dir(id); const decl = GOVERNANCE[out]; if (!decl) throw new Error('no GOVERNANCE entry for ' + out);
  let zip = zipArg;
  if (!zip) {
    const url = await resolveUrl(feed);
    const buf = await fetchChecked(url, { headers: { 'user-agent': USER_AGENT } }, { as: 'buffer', attempts: 3, timeoutMs: 900000 });
    zip = path.join(process.env.TEMP || '/tmp', 'intmap-gtfs-' + id + '.zip'); fs.writeFileSync(zip, buf);
    console.log('fetched', url, buf.length, 'bytes');
  }
  const today = new Date().toISOString().slice(0, 10);
  const c = await compileGtfs(zip, today);
  const rowsForGate = c.stops.map((x) => ({ name: x[0], lat: x[1] / 1e5, lon: x[2] / 1e5, k: x[0] + '|' + x[1] + '|' + x[2] }));
  const q = { fields: { name: {}, lat: { min: -90, max: 90 }, lon: { min: -180, max: 180 } }, key: ['k'] };
  const { measureQuality } = await import('../js/data-governance.js');
  /* a rebuild states what it measured — the declaration carries no date or count to disagree with */
  const g = { ...decl, retrievedAt: today, generatedAt: today, asOf: today, quality: measureQuality(rowsForGate, q) };
  const bundle = {
    v: 1, ...g, id, country: feed.country, licenceSpdx: feed.licence.spdx, offeredUnder: feed.licence.spdx === 'ODbL-1.0' || /SA/.test(feed.licence.spdx) ? feed.licence.spdx : undefined,
    realtime: feed.realtime, timeResolution: 'minute', window: { start: c.windowStart, days: c.days }, feedValid: c.feedValid, bbox: c.bbox, tz: c.tz,
    stats: c.stats, agencies: c.agencies, routes: c.routes, stops: c.stops, patterns: c.patterns,
  };
  const json = JSON.stringify(bundle);
  fs.mkdirSync(path.join(ROOT, 'data/transit'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, out), json);
  console.log('wrote', out, json.length, 'bytes (gzip', gzipSync(json).length + ')', JSON.stringify(c.stats), 'bbox', c.bbox, 'window', c.windowStart, c.days + 'd');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
