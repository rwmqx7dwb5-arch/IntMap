/* ============================================================================
 *  IntMap · HERE, NOW — what is happening where the reader is standing, on one card   (mobile-next)
 * ----------------------------------------------------------------------------
 *  A phone is the one screen that knows where its reader is. Before this file IntMap used that for exactly one
 *  thing — the blue dot (js/map-extras.js IntMapLocate) — and the reader who asked 「いまここで何が起きているか」
 *  had to assemble it: the weather panel, then the earthquake layer, then the news list, then Chronos to see what
 *  the city used to be called. «いま、ここ» is that question as one card, from the device position (or any point:
 *  the context menu, a shared photo, Atlas's `research.hereNow`):
 *
 *    · the place          OpenStreetMap through Nominatim reverse, at town scale (zoom 10), behind the app's one
 *                         Nominatim queue (js/nominatim-gate.js)
 *    · the weather now    window.IntMapWx.point — the SAME call the weather panel makes (Open-Meteo, MET Norway
 *                         as its fallback), with the local time and the time zone the source states
 *    · the sun            window.IntMapWx.sunTimes — IntMap's own sunrise equation, computed on the device
 *    · earthquakes        the USGS M2.5+ 7-day feed, filtered ON THE DEVICE to the reach below
 *    · the news           IntMap's news events (news_events, the table the News list reads), the most recent
 *                         window read WITHOUT a location, filtered ON THE DEVICE to the reach
 *    · the past           what this place was called — window.IntMapHistCities.near: the renamed-city record the
 *                         Chronos labels read (Edo for Tokyo, Stalingrad for Volgograd), each span as written;
 *                         a tap puts the map in that year
 *
 *  ══ THE POSITION STAYS ON THE DEVICE ══════════════════════════════════════════════════════════════════════
 *  The exact fix is drawn on the map and used for what is computed here (the sun, distances, the history
 *  lookup — the record is a file this page already has). What LEAVES the device is a point rounded to
 *  PRIVACY_GRID_DEG, and only to the two sources that cannot answer without one (the place name and the
 *  weather). The earthquake feed and the news are fetched whole and filtered here, so neither the USGS nor
 *  IntMap's own database is told where the reader is. Nothing is stored. privacy.html states the same.
 *
 *  ⚠ THE CARD READS THE SAME OBJECT ATLAS IS HANDED (the js/place-dossier.js rule): `hereNow()` builds one
 *  plain, JSON-safe record; `hereNowHtml()` draws it; Atlas receives it whole as `exec.hereNow`.
 *  ⚠ A HOLE IS SAID, NOT HIDDEN: every section is `ok`, `none` (asked; nothing there — no quake within the
 *  reach is an answer) or `unavailable` (could not ask / no answer, with the reason).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). No emoji: marks are js/icons.js line icons.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';
import { NominatimGate } from './nominatim-gate.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { requestFix, FIX_FAILURE } from './locate-me.js';
import { RELATED_DEFAULTS } from './atlas-world-objects.js';   /* «near a point» has one definition: km and hours */
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import * as bus from './bus.js';
import './safe-html.js';
import { whenHost } from './host-door.js';
import { MapState } from './map-state.js';

const GE = () => IntMapGeoEngine;
const finite = (v) => typeof v === 'number' && isFinite(v);
const reasonOf = (e) => (e && e.reason) ? String(e.reason) : 'network';
const esc = (s) => globalThis.IntMapSafe.html(s == null ? '' : String(s));

/* ══ WHAT LEAVES THE DEVICE ═════════════════════════════════════════════════════════════════════════
   0.1° is about 11 km north–south (and less east–west away from the equator): the scale of a town, which is the
   scale both outgoing questions are about — Nominatim is asked at zoom 10 (town), and the weather models behind
   Open-Meteo's best match are 1–11 km grids, so a forecast for the rounded point is the forecast for the area.
   EXPIRES IF a section is added that needs a finer point from a remote source — that section must then say so
   to the reader instead of lowering this. One owner: everything that sends a position reads `sentPoint`. */
const PRIVACY_GRID_DEG = 0.1;
export function sentPoint(pt) {
  const r = (v) => Math.round(v / PRIVACY_GRID_DEG) * PRIVACY_GRID_DEG;
  return { lng: +r(+pt.lng).toFixed(4), lat: +r(+pt.lat).toFixed(4), gridDeg: PRIVACY_GRID_DEG };
}

/* the USGS summary feed: magnitude 2.5 and above, the last 7 days, the whole world. Fetched whole so the
   reader's position is never sent (the FDSN query would take a radius around it). */
const USGS_FEED = { url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson', minMag: 2.5, days: 7 };
/* how the recent news events are read to filter on the device. OBSERVED: the PostgREST server Supabase runs answers
   at most 1000 rows per request (its default `max-rows`), and on 2026-10-03 the 72-hour window of placed events held
   MORE than that (the first version read one page and the card said «only the newest 1000»). So the window is read
   page by page (`.range`) until a page comes back short — the window bounds it by time — with NEWS_PAGES as the last
   fence (a row is ~0.2 kB, so the fence is ~1 MB on a phone); past it the record says `truncated` and the card says
   the reach was cut by count, not by time. EXPIRES IF max-rows changes (NEWS_PAGE) or the window outgrows the fence. */
const NEWS_PAGE = 1000, NEWS_PAGES = 5;

/** great-circle kilometres */
export function km(aLng, aLat, bLng, bLat) {
  const D = Math.PI / 180, dLat = (bLat - aLat) * D, dLng = (bLng - aLng) * D;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * D) * Math.cos(bLat * D) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ── the place ── */
async function placeName(sent, lang) {
  const source = { publisher: 'OpenStreetMap contributors (Nominatim)' };
  const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language='
    + encodeURIComponent(IntMapLang.locale(lang, 'en')) + '&lat=' + sent.lat.toFixed(4) + '&lon=' + sent.lng.toFixed(4);
  try {
    await NominatimGate.nominatimSlot();
    const j = await jsonWithin(url, clockFor(url), { headers: { Accept: 'application/json' } });
    if (j && j.licence) source.licence = String(j.licence);
    if (!j || j.error || !j.address) return { status: 'none', reason: 'no-named-area', source };
    const a = j.address, chain = [];
    Object.keys(a).forEach((k) => { const v = a[k]; if (v == null || v === '' || /^ISO3166/i.test(k) || k === 'country_code' || k === 'postcode') return; if (!chain.includes(String(v))) chain.push(String(v)); });
    return { status: 'ok', name: (j.name && String(j.name)) || chain[0] || null, chain, countryCode: a.country_code ? String(a.country_code).toUpperCase() : null, source };
  } catch (e) { return { status: 'unavailable', reason: reasonOf(e), source }; }
}

/* ── the weather now, and the local time the same answer states ── */
async function weatherNow(sent) {
  const W = window.IntMapWx;
  if (!W || typeof W.point !== 'function') return { status: 'unavailable', reason: 'weather-source-not-loaded' };
  let j = null;
  try { j = await W.point(sent.lat, sent.lng, { uv: false, gusts: false }); } catch (_) { j = null; }
  if (!j || !j.current) return { status: 'unavailable', reason: 'weather-source-unreachable' };
  const c = j.current, d = j.daily || {}, n = (v) => (v == null || !finite(+v)) ? null : +v;
  return { status: 'ok', tempC: n(c.temperature_2m), feelsC: n(c.apparent_temperature), code: n(c.weather_code), windKmh: n(c.wind_speed_10m),
    windDirDeg: n(c.wind_direction_10m), precipMm: n(c.precipitation), humidityPct: n(c.relative_humidity_2m), isDay: c.is_day == null ? null : !!c.is_day,
    todayMaxC: n(d.temperature_2m_max && d.temperature_2m_max[0]), todayMinC: n(d.temperature_2m_min && d.temperature_2m_min[0]),
    precipProbPct: n(d.precipitation_probability_max && d.precipitation_probability_max[0]),
    observedAt: c.time ? String(c.time) : null, timeZone: j.timezone ? String(j.timezone) : null, utcOffsetSeconds: n(j.utc_offset_seconds),
    source: { publisher: String(j._src || 'Open-Meteo') } };
}

/* ── the sun: computed here ── */
function sunAt(pt) {
  try {
    const s = window.IntMapWx && window.IntMapWx.sunTimes ? window.IntMapWx.sunTimes(+pt.lat, +pt.lng) : null;
    if (!s) return { status: 'unavailable', reason: 'sun-model-not-loaded' };
    return { status: 'ok', sunrise: s.sunrise ? s.sunrise.toISOString() : null, sunset: s.sunset ? s.sunset.toISOString() : null,
      daylightSeconds: finite(s.daylightSec) ? Math.round(s.daylightSec) : null, polar: s.polar || null };
  } catch (_) { return { status: 'unavailable', reason: 'sun-model-not-loaded' }; }
}

/* ── earthquakes within the reach: the whole feed, filtered here ── */
async function quakesNear(pt, reachKm) {
  const source = { publisher: 'USGS Earthquake Hazards Program', feed: USGS_FEED.url, minMag: USGS_FEED.minMag, days: USGS_FEED.days };
  try {
    const j = await jsonWithin(USGS_FEED.url, clockFor(USGS_FEED.url));
    if (!j || !Array.isArray(j.features)) return { status: 'unavailable', reason: 'parse', reachKm, source };
    const items = [];
    for (const f of j.features) {
      const g = f && f.geometry && f.geometry.coordinates, p = (f && f.properties) || {};
      if (!g || !finite(+g[0]) || !finite(+g[1])) continue;
      const d = km(+pt.lng, +pt.lat, +g[0], +g[1]);
      if (d > reachKm) continue;
      items.push({ id: String(f.id || ''), mag: finite(+p.mag) ? +p.mag : null, place: p.place ? String(p.place) : null, time: finite(+p.time) ? new Date(+p.time).toISOString() : null,
        km: Math.round(d), depthKm: finite(+g[2]) ? Math.round(+g[2]) : null, lng: +g[0], lat: +g[1], url: p.url ? String(p.url) : null });
    }
    items.sort((a, b) => String(b.time).localeCompare(String(a.time)));
    return { status: items.length ? 'ok' : 'none', reason: items.length ? null : 'none-within-reach', reachKm, count: items.length, scanned: j.features.length, items, source };
  } catch (e) { return { status: 'unavailable', reason: reasonOf(e), reachKm, source }; }
}

/* ── news events within the reach: the recent window, read without a location, filtered here ── */
async function newsNear(pt, reachKm, hours, HOST) {
  const source = { publisher: 'IntMap news events (headlines by their outlets)' };
  const DB = HOST && HOST.DB;
  if (!DB || typeof DB.from !== 'function') return { status: 'unavailable', reason: 'no-database-client', reachKm, hours, source };
  try {
    const since = new Date(Date.now() - hours * 3600000).toISOString();
    const rows = [], items = [];
    let truncated = false;
    for (let p = 0; ; p++) {
      if (p >= NEWS_PAGES) { truncated = true; break; }
      const { data, error } = await DB.from('news_events')
        .select('public_id,representative_title,rep_lng,rep_lat,rep_place_name_en,last_article_at,independent_source_count,primary_category')
        .eq('status', 'active').is('merged_into', null).not('rep_lat', 'is', null).gte('last_article_at', since)
        .order('last_article_at', { ascending: false }).range(p * NEWS_PAGE, p * NEWS_PAGE + NEWS_PAGE - 1);
      if (error) throw Object.assign(new Error(error.message || 'db'), { reason: 'http' });
      const page = data || [];
      rows.push(...page);
      if (page.length < NEWS_PAGE) break;
    }
    for (const r of rows) {
      if (!finite(+r.rep_lng) || !finite(+r.rep_lat)) continue;
      const d = km(+pt.lng, +pt.lat, +r.rep_lng, +r.rep_lat);
      if (d > reachKm) continue;
      items.push({ publicId: String(r.public_id), title: String(r.representative_title || ''), place: r.rep_place_name_en || null, km: Math.round(d),
        lastAt: r.last_article_at || null, outlets: finite(+r.independent_source_count) ? +r.independent_source_count : null, category: r.primary_category || null, lng: +r.rep_lng, lat: +r.rep_lat });
    }
    items.sort((a, b) => a.km - b.km || String(b.lastAt).localeCompare(String(a.lastAt)));
    return { status: items.length ? 'ok' : 'none', reason: items.length ? null : 'none-within-reach', reachKm, hours, scanned: rows.length, truncated, count: items.length, items, source };
  } catch (e) { return { status: 'unavailable', reason: reasonOf(e), reachKm, hours, source }; }
}

/* ── the past: what this place was called, from the renamed-city record ── */
async function pastNames(pt, lang) {
  let HC = window.IntMapHistCities;
  try { if (!HC) { await import('./hist-cities.js'); HC = window.IntMapHistCities; } } catch (_) { HC = null; }
  if (!HC || typeof HC.near !== 'function') return { status: 'unavailable', reason: 'history-record-not-loaded' };
  try { await HC.ensure(); } catch (_) { /* answered below */ }
  if (!HC.ready()) return { status: 'unavailable', reason: 'history-record-unreachable' };
  const rights = (HC.rights && HC.rights()) || [];
  const hits = HC.near(+pt.lng, +pt.lat, lang);
  if (!hits.length) return { status: 'none', reason: 'no-recorded-renaming-here', rights };
  const c = hits[0], seen = new Set();
  const spans = c.spans.filter((s) => { const k = s.name + '|' + s.f + '|' + s.t; if (seen.has(k)) return false; seen.add(k); return true; });
  return { status: 'ok', city: { id: c.id, today: c.today, metres: c.metres, guard: c.guard, cc: c.cc }, spans, rights };
}

/**
 * hereNow({lng,lat,from?,accuracyM?,name?}, HOST, opts?) → ONE plain record (JSON-safe).
 *   opts.onSection(name, section) — called as each section settles (the card renders progressively)
 */
export async function hereNow(pt, HOST, opts) {
  opts = opts || {};
  const lng = +pt.lng, lat = +pt.lat;
  if (!finite(lng) || !finite(lat)) throw new Error('hereNow: no point');
  const tell = (k, v) => { try { if (typeof opts.onSection === 'function') opts.onSection(k, v); } catch (_) { /* the renderer's failure is not the record's */ } return v; };
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  let text = null; try { text = HOST.fmtLL(lng, lat); } catch (_) { text = lat.toFixed(4) + ', ' + lng.toFixed(4); }
  const sent = sentPoint({ lng, lat });
  const reachKm = RELATED_DEFAULTS.km, hours = RELATED_DEFAULTS.hours;
  const out = { at: { lng, lat, text, from: pt.from === 'device' ? 'device' : 'point', accuracyM: finite(+pt.accuracyM) ? Math.round(+pt.accuracyM) : null, name: pt.name ? String(pt.name) : null },
    sent: { point: sent, to: ['nominatim.openstreetmap.org', 'api.open-meteo.com (or api.met.no)'] }, reachKm, asOf: new Date().toISOString() };
  out.sun = tell('sun', sunAt({ lng, lat }));
  const [place, weather, quakes, news, past] = await Promise.all([
    placeName(sent, lang).then((v) => tell('place', v)),
    weatherNow(sent).then((v) => tell('weather', v)),
    quakesNear({ lng, lat }, reachKm).then((v) => tell('quakes', v)),
    newsNear({ lng, lat }, reachKm, hours, HOST).then((v) => tell('news', v)),
    pastNames({ lng, lat }, lang).then((v) => tell('past', v)),
  ]);
  Object.assign(out, { place, weather, quakes, news, past });
  return out;
}

/* ══ RENDERING ══════════════════════════════════════════════════════════════════════════════════════ */
function words(HOST) {
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  const WHY = {
    'no-named-area': L('OpenStreetMap names no area here', 'OpenStreetMap はここに名前のある区域を持っていません'),
    'timeout': L('the source did not answer in time', '取得先が時間内に応答しませんでした'),
    'network': L('the source could not be reached', '取得先に到達できませんでした'),
    'http': L('the source refused the request', '取得先が要求を拒否しました'),
    'parse': L('the source answered with something unreadable', '取得先の応答を読めませんでした'),
    'aborted': L('the request was cancelled', '要求が取り消されました'),
    'weather-source-not-loaded': L('the weather source has not loaded', '天気の取得元が読み込まれていません'),
    'weather-source-unreachable': L('neither weather source answered', 'どちらの天気の取得元も応答しませんでした'),
    'sun-model-not-loaded': L('the sun model has not loaded', '日の出入りの計算が読み込まれていません'),
    'no-database-client': L('the news database is not connected', 'ニュースのデータベースに接続していません'),
    'history-record-not-loaded': L('the historical names record has not loaded', '地名の歴史の記録が読み込まれていません'),
    'history-record-unreachable': L('the historical names record could not be read', '地名の歴史の記録を読めませんでした'),
    'no-recorded-renaming-here': L('IntMap records no former name for this place', 'この場所のかつての名前は IntMap の記録にありません'),
    [FIX_FAILURE.UNSUPPORTED]: L('this browser cannot read the device position', 'このブラウザは端末の位置を読めません'),
    [FIX_FAILURE.BLOCKED]: L('location is blocked for this site — allow it in the browser settings', 'このサイトの位置情報がブロックされています。ブラウザの設定で許可してください'),
    [FIX_FAILURE.DENIED]: L('location permission was not given', '位置情報の許可がありませんでした'),
    [FIX_FAILURE.UNAVAILABLE]: L('the device has no position to give', '端末が位置を取得できませんでした'),
  };
  return { L, why: (c) => WHY[String(c || '')] || String(c || '') };
}
function clock(iso, tz, lang, withDate) {
  if (!iso) return null;
  try { return new Intl.DateTimeFormat(IntMapLang.locale(lang, 'en'), Object.assign(withDate ? { month: 'short', day: 'numeric' } : {}, { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC' })).format(new Date(iso)); } catch (_) { return null; }
}
function ago(iso, L) {
  const t = Date.parse(iso || ''); if (!finite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 60) return L(m + ' min ago', m + '分前');
  const h = Math.round(m / 60); if (h < 48) return L(h + ' h ago', h + '時間前');
  const d = Math.round(h / 24); return L(d + ' days ago', d + '日前');
}
/** a span of the renamed-city record as text: signed YYYYMMDD, `p` = start/end precision ('-' = not stated) */
function spanText(s, lang) {
  const HS = window.IntMapHistScale, tag = IntMapLang.htmlTag(lang);
  const yr = (v) => { const y = Math.trunc(v / 10000); try { return HS.yearText(y, tag); } catch (_) { return String(y); } };
  const openA = !s.f || (s.p && s.p.charAt(0) === '-'), openB = !s.t || (s.p && s.p.charAt(1) === '-');
  if (openA && openB) return '';
  if (openA) return '– ' + yr(s.t);
  if (openB) return yr(s.f) + ' –';
  return yr(s.f) + ' – ' + yr(s.t);
}
function yearOf(y, lang, jpSuffix) { try { return window.IntMapHistScale.yearText(y, IntMapLang.htmlTag(lang), jpSuffix || undefined); } catch (_) { return String(y) + (jpSuffix || ''); } }
/** the year the map is put in for a span: its last stated year (or its first, when the end is open) */
export function spanYear(s) {
  const openA = !s.f || (s.p && s.p.charAt(0) === '-'), openB = !s.t || (s.p && s.p.charAt(1) === '-');
  if (!openB) return Math.trunc(s.t / 10000);
  if (!openA) return Math.trunc(s.f / 10000);
  return null;
}

const SHOWN = 6;   /* rows drawn per list on the card; the rest are counted («+N»), and Atlas receives all of them */

export function hereNowHtml(p, HOST, opts) {
  opts = opts || {};
  /* a list row is a button on the card (it flies, opens, sets the year); in Atlas's bubble nothing listens, so it is
     drawn as a row — a control that does nothing is not drawn */
  const item = (attrs, inner, disabled) => opts.inert ? '<div class="hn-item">' + inner + '</div>' : '<button type="button" class="hn-item" ' + attrs + (disabled ? ' disabled' : '') + '>' + inner + '</button>';
  const { L, why } = words(HOST);
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  const wait = '<span class="hn-why" data-pending>' + esc(L('Reading…', '読み込み中…')) + '</span>';
  const hole = (code) => '<span class="hn-why">' + esc(why(code)) + '</span>';
  const sec = (title, sub, body) => '<div class="hn-sec"><div class="hn-h">' + esc(title) + (sub ? '<span class="hn-sub">' + esc(sub) + '</span>' : '') + '</div>' + body + '</div>';
  const tz = p.weather && p.weather.status === 'ok' ? p.weather.timeZone : null;
  let h = '';
  /* the weather — the first thing a person outdoors wants */
  const w = p.weather;
  let wb;
  if (!w) wb = wait;
  else if (w.status !== 'ok') wb = hole(w.reason);
  else {
    let desc = ''; try { desc = window.IntMapWeather && window.IntMapWeather.describe ? window.IntMapWeather.describe(w.code) : ''; } catch (_) { desc = ''; }
    const t = (c) => { if (!finite(c)) return '—'; try { if (window.fmtTemp) return window.fmtTemp(c); } catch (_) { /* the app's unit setting is optional */ } return Math.round(c) + '°C'; };
    wb = '<div class="hn-big">' + esc(t(w.tempC)) + '<span class="hn-desc">' + esc(desc || L('WMO code ', 'WMO 天気コード ') + w.code) + '</span></div>'
      + '<div class="hn-line">' + esc([finite(w.feelsC) ? L('feels ', '体感 ') + t(w.feelsC) : null, finite(w.windKmh) ? L('wind ', '風 ') + Math.round(w.windKmh) + ' km/h' : null,
        finite(w.humidityPct) ? L('humidity ', '湿度 ') + Math.round(w.humidityPct) + '%' : null].filter(Boolean).join(' · ')) + '</div>'
      + '<div class="hn-line">' + esc([finite(w.todayMaxC) ? L('today ', '今日 ') + t(w.todayMaxC) + ' / ' + t(w.todayMinC) : null,
        finite(w.precipProbPct) ? L('rain chance ', '降水確率 ') + Math.round(w.precipProbPct) + '%' : null].filter(Boolean).join(' · ')) + '</div>';
  }
  const s = p.sun;
  let sunLine = '';
  if (s && s.status === 'ok') {
    if (s.polar === 'day') sunLine = L('the sun does not set today', '今日は日没がありません');
    else if (s.polar === 'night') sunLine = L('the sun does not rise today', '今日は日の出がありません');
    else sunLine = L('sunrise ', '日の出 ') + (clock(s.sunrise, tz, lang) || '—') + L(' · sunset ', ' · 日の入り ') + (clock(s.sunset, tz, lang) || '—') + (tz ? '' : ' UTC');
  }
  const localNow = tz ? clock(new Date().toISOString(), tz, lang) : null;
  h += sec(L('Weather now', 'いまの天気'), localNow ? L('local time ', '現地時刻 ') + localNow : '', wb + (sunLine ? '<div class="hn-line">' + esc(sunLine) + '</div>' : ''));
  /* earthquakes */
  const q = p.quakes;
  let qb;
  if (!q) qb = wait;
  else if (q.status === 'unavailable') qb = hole(q.reason);
  else if (q.status === 'none') qb = '<div class="hn-line">' + esc(L('No earthquake of M' + USGS_FEED.minMag + ' or more within ' + q.reachKm + ' km in the last ' + USGS_FEED.days + ' days.', '過去' + USGS_FEED.days + '日、' + q.reachKm + ' km 以内に M' + USGS_FEED.minMag + ' 以上の地震はありません。')) + '</div>';
  else qb = q.items.slice(0, SHOWN).map((x, i) => item('data-hn="quake" data-i="' + i + '"', '<b class="hn-mag">M' + (finite(x.mag) ? x.mag.toFixed(1) : '?') + '</b><span class="hn-t">' + esc(x.place || '') + '</span><span class="hn-m">' + esc(x.km + ' km · ' + ago(x.time, L) + (finite(x.depthKm) ? L(' · depth ', ' · 深さ ') + x.depthKm + ' km' : '')) + '</span>')).join('')
    + (q.items.length > SHOWN ? '<div class="hn-more">+' + (q.items.length - SHOWN) + '</div>' : '');
  h += sec(L('Earthquakes nearby', '周辺の地震'), q && q.reachKm ? L('within ' + q.reachKm + ' km · ' + USGS_FEED.days + ' days · M' + USGS_FEED.minMag + '+', q.reachKm + ' km 以内 · ' + USGS_FEED.days + '日 · M' + USGS_FEED.minMag + '以上') : '', qb);
  /* news */
  const n = p.news;
  let nb;
  if (!n) nb = wait;
  else if (n.status === 'unavailable') nb = hole(n.reason);
  else if (n.status === 'none') nb = '<div class="hn-line">' + esc(L('No news event placed within ' + n.reachKm + ' km in the last ' + n.hours + ' hours.', '過去' + n.hours + '時間、' + n.reachKm + ' km 以内に位置の付いた出来事はありません。')) + '</div>';
  else nb = n.items.slice(0, SHOWN).map((x, i) => item('data-hn="news" data-i="' + i + '"', '<span class="hn-t">' + esc(x.title) + '</span><span class="hn-m">' + esc([x.place, x.km + ' km', ago(x.lastAt, L), finite(x.outlets) ? L(x.outlets + (x.outlets === 1 ? ' outlet' : ' outlets'), x.outlets + ' 媒体') : null].filter(Boolean).join(' · ')) + '</span>')).join('')
    + (n.items.length > SHOWN ? '<div class="hn-more">+' + (n.items.length - SHOWN) + '</div>' : '');
  if (n && n.truncated) nb += '<div class="hn-why">' + esc(L('Only the newest ' + n.scanned + ' events were read.', '新しい ' + n.scanned + ' 件だけを読みました。')) + '</div>';
  h += sec(L('News nearby', '近くのニュース'), n && n.reachKm ? L('within ' + n.reachKm + ' km · ' + n.hours + ' h', n.reachKm + ' km 以内 · ' + n.hours + '時間') : '', nb);
  /* the past */
  const ps = p.past;
  let pb;
  if (!ps) pb = wait;
  else if (ps.status !== 'ok') pb = hole(ps.reason);
  else pb = ps.spans.map((x, i) => { const yr = spanYear(x), when = spanText(x, lang);
    return item('data-hn="past" data-i="' + i + '"', '<span class="hn-t">' + esc(x.name) + '</span><span class="hn-m">' + esc((when || L('dates not stated', '年代の記載なし')) + (yr != null && !opts.inert ? L(' · see the map in ' + yearOf(yr, lang, ''), ' · ' + yearOf(yr, lang, '年') + 'の地図を見る') : '')) + '</span>', yr == null); }).join('');
  h += sec(L('This place in the past', 'この場所のかつての名前'), ps && ps.status === 'ok' && ps.city.today ? L('recorded as ', '記録上の名前 ') + ps.city.today : '', pb);
  /* who said it, and what left the device */
  const cr = [];
  if (p.place && p.place.source) cr.push(p.place.source.publisher);
  if (w && w.source) cr.push(w.source.publisher);
  if (q && q.source) cr.push(q.source.publisher);
  if (n && n.source) cr.push(n.source.publisher);
  if (ps && ps.rights) ps.rights.forEach((r) => cr.push(r.publisher + (r.licence ? ' (' + r.licence + ')' : '')));
  cr.push(L('sunrise and sunset computed by IntMap', '日の出・日の入りは IntMap の計算'));
  h += '<div class="hn-src">' + esc(L('Sources: ', '出典: ') + cr.join(' · ')) + '</div>';
  h += '<div class="hn-priv">' + icon('lock', { size: 12 }) + ' ' + esc(p.at.from === 'device'
    ? L('Your exact position stays on this device. Only a point rounded to ' + PRIVACY_GRID_DEG + '° (about 11 km) is sent, for the place name and the weather; earthquakes and news are filtered here. Nothing is saved.',
      '正確な現在地はこの端末から出ません。地名と天気のためにだけ ' + PRIVACY_GRID_DEG + '°（約 11 km）に丸めた地点を送り、地震とニュースは端末内で絞り込みます。何も保存しません。')
    : L('For the place name and the weather a point rounded to ' + PRIVACY_GRID_DEG + '° is sent; earthquakes and news are filtered on this device.', '地名と天気には ' + PRIVACY_GRID_DEG + '° に丸めた地点を送り、地震とニュースはこの端末で絞り込みます。')) + '</div>';
  return h;
}

/* ══ THE MAP: the point, and what the card lists, drawn while the card is open ══════════════════════ */
const SRC = 'hn-src', LYR_Q = 'hn-quake', LYR_N = 'hn-news';
function fc(p) {
  const f = [];
  ((p && p.quakes && p.quakes.items) || []).forEach((x) => f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { k: 'q', m: finite(x.mag) ? x.mag : 2.5 } }));
  ((p && p.news && p.news.items) || []).forEach((x) => f.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { k: 'n' } }));
  return { type: 'FeatureCollection', features: f };
}
function draw(p, HOST) {
  try {
    const E = GE(); if (!E || !E.hasRenderer()) return;
    let can = true; try { can = HOST.canDraw(); } catch (_) { can = true; }
    if (!can) return;
    const data = fc(p);
    if (E.layers.hasSource(SRC)) { E.layers.setSourceData(SRC, data); return; }
    if (!data.features.length) return;
    E.layers.addSource(SRC, { type: 'geojson', data });
    E.layers.add({ id: LYR_Q, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'q'], paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 2.5, 4, 7, 14], 'circle-color': '#ff9f0a', 'circle-opacity': 0.75, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
    E.layers.add({ id: LYR_N, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'n'], paint: { 'circle-radius': 5, 'circle-color': '#0a84ff', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
  } catch (_) { /* the card is the answer; the dots are an aid */ }
}
function undraw() { try { const E = GE(); if (E && E.layers.hasSource(SRC)) E.layers.setSourceData(SRC, { type: 'FeatureCollection', features: [] }); } catch (_) { /* nothing drawn */ } }

/* ══ THE CARD ═══════════════════════════════════════════════════════════════════════════════════════ */
const CSS = [
  '.hn-popup{width:360px;}',
  '.hn-sec{margin-top:12px;padding-top:8px;border-top:1px solid rgba(128,128,128,0.16);}',
  '.hn-h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);margin-bottom:5px;}',
  '.hn-sub{font-weight:500;letter-spacing:0;text-transform:none;font-size:11px;}',
  '.hn-big{font-size:28px;font-weight:700;line-height:1.1;display:flex;align-items:baseline;gap:10px;}',
  '.hn-desc{font-size:14px;font-weight:600;color:var(--text-main);}',
  '.hn-line{font-size:12.5px;color:var(--text-main);margin-top:3px;}',
  '.hn-why{font-size:12px;color:var(--text-muted);}',
  '.hn-lead{font-size:12.5px;margin:-2px 0 4px;color:var(--text-muted);}',
  '.hn-item{display:grid;grid-template-columns:auto 1fr;column-gap:8px;align-items:baseline;width:100%;text-align:left;background:none;border:none;border-radius:10px;padding:7px 6px;margin:0 -6px;color:var(--text-main);font:inherit;font-size:12.5px;cursor:pointer;}',
  '.hn-item:hover{background:var(--input-bg);} .hn-item:disabled{cursor:default;opacity:.7;}',
  '.hn-item .hn-t{grid-column:span 1;min-width:0;overflow-wrap:anywhere;font-weight:600;}',
  '.hn-item .hn-m{grid-column:1 / -1;font-size:11px;color:var(--text-muted);}',
  '.hn-item:not(:has(.hn-mag)) .hn-t{grid-column:1 / -1;}',
  '.hn-mag{color:#ff9f0a;font-variant-numeric:tabular-nums;}',
  '.hn-more{font-size:11px;color:var(--text-muted);padding:2px 0;}',
  '.hn-src,.hn-priv{font-size:10.5px;color:var(--text-muted);margin-top:10px;line-height:1.45;}',
  '.hn-priv{display:flex;gap:5px;align-items:flex-start;}',
  '.hn-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}',
  '.hn-actions button{flex:1 1 30%;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 8px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-weight:600;font-size:12px;cursor:pointer;}',
  '.hn-actions .primary{background:var(--primary-fill);color:#fff;}',
].join('\n');
/* the phone's sizes: a finger is 44 px — the rows and the actions are that tall; the close keeps the 32 px box every popup ×
   is drawn with (js/data-layers.js, «one UI for every ×») and takes the finger with a 44 px ::after, the way the legend's
   × does (docs/architecture/09-mobile.md §9.2). The layout boundary is js/ui-device.js's (`media()`), never a number here. */
const PHONE_CSS = '.hn-popup{width:calc(100vw - 24px);} .hn-item{min-height:44px;} .hn-actions button{min-height:44px;font-size:13.5px;}'
  + ' .hn-popup .country-popup-close::after{content:"";position:absolute;inset:-6px;}';
let styled = false;
export function style() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-here-now-css'; st.textContent = CSS + '\n' + (window.IntMapDevice ? window.IntMapDevice.media(PHONE_CSS) : ''); document.head.appendChild(st); }

let card = null, seq = 0, current = null, lead = null, curHost = null;
function ensureCard(HOST) {
  style();
  if (card && document.body.contains(card)) return card;
  const { L } = words(HOST);
  card = document.createElement('div');
  card.className = 'country-popup hn-popup'; card.id = 'hn-popup';
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'hn-title');
  card.innerHTML = '<button class="country-popup-close" id="hn-close" type="button"></button>'
    + '<div class="country-popup-header"><h3 id="hn-title"></h3></div><div id="hn-lead"></div><div id="hn-body" aria-live="polite"></div>'
    + '<div class="hn-actions"><button type="button" data-hn="profile"></button><button type="button" data-hn="atlas"></button><button type="button" class="primary" data-hn="refresh"></button></div>';
  (document.getElementById('map-container') || document.body).appendChild(card);
  const x = card.querySelector('#hn-close'); x.textContent = '×'; x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
  x.addEventListener('click', () => closeHereNow());
  try { HOST.makeDraggable(card, card.querySelector('.country-popup-header')); } catch (_) { /* a fixed card still reads */ }
  card.addEventListener('mousedown', () => { try { HOST.bringToFront(card); } catch (_) { /* order is cosmetic */ } });
  card.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('[data-hn]') : null; if (!b || !current) return;
    const H = curHost || HOST, k = b.dataset.hn, i = +b.dataset.i;
    if (k === 'quake') { const it = current.quakes.items[i]; if (it) flyTo(it.lng, it.lat, 8); }
    else if (k === 'news') { const it = current.news.items[i]; if (it) openNews(it, H); }
    else if (k === 'past') { const it = current.past.spans[i], y = it ? spanYear(it) : null; if (y != null) { try { IntMapTime.setYear(y, { source: 'here-now' }); } catch (_) { /* the clock refuses a year it cannot reach */ } flyTo(current.at.lng, current.at.lat, 9); } }
    else if (k === 'profile') import('./place-dossier.js').then((m) => m.openPlaceDossier(H, { lng: current.at.lng, lat: current.at.lat })).catch(() => {});
    else if (k === 'atlas') { const at = { lng: current.at.lng, lat: current.at.lat }; try { if (window.IntMapAtlas) window.IntMapAtlas.ensure().then((C) => { try { if (C && C.askHere) C.askHere(at); else if (C && C.open) C.open(); } catch (_) { /* Atlas states its own failure */ } }); } catch (_) { /* no Atlas in this build */ } }
    else if (k === 'refresh') { const pt = Object.assign({}, current.at, { accuracyM: current.at.accuracyM }); run(H, pt); }
    else if (k.indexOf('lead:') === 0 && lead && lead.actions) { const a = lead.actions[+k.slice(5)]; if (a && typeof a.run === 'function') { try { a.run(); } catch (_) { /* the action states its own failure */ } } }
  });
  return card;
}
function flyTo(lng, lat, z) { try { const E = GE(); E.camera.flyTo({ center: [lng, lat], zoom: Math.max(z, Math.min(E.camera.getZoom(), z + 2)), duration: 1000 }); } catch (_) { /* no renderer */ } }
async function openNews(it, HOST) {
  try {
    await window.IntMapLazy.need('newsEvents');
    const E = window.IntMapNewsEvents;
    if (E.openByPublicId(it.publicId)) return;
    const { data } = await HOST.DB.from('news_events').select(E.columns()).eq('public_id', it.publicId).limit(1);
    if (data && data[0]) await E.openRow(data[0]);
  } catch (_) { flyTo(it.lng, it.lat, 9); }
}
function paint(HOST) {
  if (!card || !current) return;
  const { L } = words(HOST);
  const p = current, pl = p.place;
  const title = (pl && pl.status === 'ok' && pl.name) ? pl.name : (p.at.name || p.at.text);
  card.querySelector('#hn-title').innerHTML = icon('target') + ' ' + esc(p.at.from === 'device' ? L('Here, now', 'いま、ここ') + ' — ' + title : title);
  const ld = card.querySelector('#hn-lead');
  ld.innerHTML = (pl && pl.status === 'ok' && pl.chain.length > 1 ? '<div class="hn-lead">' + esc(pl.chain.slice(1, 4).join(' · ')) + (p.at.from === 'device' && finite(p.at.accuracyM) ? esc(L(' · ±' + p.at.accuracyM + ' m', ' · 誤差 ±' + p.at.accuracyM + ' m')) : '') + '</div>' : '')
    + (lead ? '<div class="hn-lead">' + esc(lead.text || '') + '</div>' + (lead.actions && lead.actions.length ? '<div class="hn-actions">' + lead.actions.map((a, i) => '<button type="button" data-hn="lead:' + i + '">' + esc(a.label) + '</button>').join('') + '</div>' : '') : '');
  card.querySelector('#hn-body').innerHTML = hereNowHtml(p, HOST);
  card.querySelector('[data-hn="profile"]').innerHTML = icon('note') + ' ' + esc(L('Place profile', '地点プロファイル'));
  const ab = card.querySelector('[data-hn="atlas"]'); ab.innerHTML = icon('chat') + ' ' + esc(L('Ask Atlas', 'Atlasに聞く')); ab.style.display = window.IntMapAtlas ? '' : 'none';
  card.querySelector('[data-hn="refresh"]').textContent = L('Refresh', '更新');
  draw(p, HOST);
}
function place() {
  const mc = document.getElementById('map-container'); if (!card || !mc || card.dataset.placed === '1') return; card.dataset.placed = '1';
  const r = mc.getBoundingClientRect();
  card.style.left = Math.max(12, r.width - card.offsetWidth - 24) + 'px'; card.style.top = '84px';
}

async function run(HOST, pt) {
  const my = ++seq;
  let text = null; try { text = HOST.fmtLL(+pt.lng, +pt.lat); } catch (_) { text = (+pt.lat).toFixed(4) + ', ' + (+pt.lng).toFixed(4); }
  current = { at: { lng: +pt.lng, lat: +pt.lat, text, from: pt.from === 'device' ? 'device' : 'point', accuracyM: finite(+pt.accuracyM) ? Math.round(+pt.accuracyM) : null, name: pt.name || null } };
  ensureCard(HOST); card.style.display = 'block'; paint(HOST); place();
  try { HOST.bringToFront(card); } catch (_) { /* cosmetic */ }
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
  const done = await hereNow(pt, HOST, { onSection: (k, v) => { if (my !== seq || !current) return; current[k] = v; paint(HOST); } });
  if (my !== seq) return done;
  current = done; paint(HOST);
  return done;
}

/**
 * openHereNow(HOST, opts?) — the card.
 *   opts.point {lng,lat,name?}  a point (the context menu, a shared photo); absent → the device position
 *   opts.lead  {text, actions:[{label, run}]}  a line above the sections and its buttons (a shared photo's date)
 * → the finished record, or { ok:false, reason } when the device position could not be read
 */
export async function openHereNow(HOST, opts) {
  opts = opts || {}; curHost = HOST; lead = opts.lead || null;
  let pt = opts.point;
  if (!pt) {
    ensureCard(HOST); card.style.display = 'block';
    const { L, why } = words(HOST);
    current = null;
    card.querySelector('#hn-title').innerHTML = icon('target') + ' ' + esc(L('Here, now', 'いま、ここ'));
    card.querySelector('#hn-lead').innerHTML = '';
    card.querySelector('#hn-body').innerHTML = '<div class="hn-line" data-pending>' + esc(L('Reading this device\'s position…', 'この端末の位置を読み取っています…')) + '</div>';
    place();
    try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
    const fix = await requestFix();
    if (!fix.ok) {
      card.querySelector('#hn-body').innerHTML = '<div class="hn-line">' + esc(why(fix.reason)) + '</div><div class="hn-why">' + esc(L('You can still open «Here, now» for any point: long-press the map ▸ Live info.', '地図を長押し ▸ 現地の情報 から、任意の地点の「いま、ここ」を開けます。')) + '</div>';
      return { ok: false, reason: fix.reason };
    }
    /* the dot and its accuracy circle from the SAME reading (js/locate-me.js: a second read in the same context may never return) */
    try { if (window.IntMapLocate && window.IntMapLocate.start) window.IntMapLocate.start({ fly: false, fix }); } catch (_) { /* the card still answers */ }
    pt = { lng: fix.lng, lat: fix.lat, from: 'device', accuracyM: fix.acc };
  }
  flyTo(+pt.lng, +pt.lat, 9);
  return run(HOST, pt);
}
function closeHereNow() { seq++; current = null; lead = null; undraw(); if (card) card.style.display = 'none'; }

/* ══ OPENED BY A QUERY: the installed icon's shortcut (`?here=1`, manifest.webmanifest) ═════════════════ */
/** resolves when the renderer can be asked to move (or after 30 s, so a door never waits forever) */
export function whenMapReady() {
  return new Promise((res) => {
    const t0 = Date.now();
    const ok = () => { try { return GE().hasRenderer() && GE().ready(); } catch (_) { return false; } };
    const tick = () => { if (ok() || Date.now() - t0 > 30000) res(); else setTimeout(tick, 150); };
    tick();
  });
}
export async function bootFromUrl() {
  /* the query is spent: a reload is an ordinary start */
  try { const q = new URLSearchParams(location.search); q.delete('here'); MapState.address(q.toString()); } catch (_) { /* cosmetic */ }   /* the address bar's one door (js/map-state.js) */

  const HOST = await whenHost();
  await whenMapReady();
  return openHereNow(HOST);
}
