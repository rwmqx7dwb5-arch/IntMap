/* ============================================================================
 *  IntMap · THE PLACE CARD — everything the map knows about one point, and what is happening there now
 *  (place-dossier · mobile-next · place-card-unify)
 * ----------------------------------------------------------------------------
 *  ONE card and ONE record for a point. Until place-card-unify there were two: the place profile (this file:
 *  name, country, elevation, the layers that are on, local time and the sun) and «Here, now» (js/here-now.js:
 *  the weather, earthquakes and news nearby, the former names). They opened from the same long-press menu as two
 *  cards, and each had its own reverse geocode, its own time zone read, its own sunrise text and its own table of
 *  reason codes. Now there is this card, reached from:
 *
 *    · the long-press / right-click menu ▸ «About the place» (js/tool-panel.js)   — a point on the map
 *    · the search card's «Place profile» (js/search-geocode.js)                    — a point on the map
 *    · «Here, now» under the empty search field (js/here-entry.js), the installed icon's shortcut (`?here=1`,
 *      manifest.webmanifest → src/main.js → bootFromUrl)                           — the DEVICE position
 *    · the share sheet / a photo's place (js/share-inbox.js openHereNow)           — a SHARED point
 *    · Atlas: `research.placeProfile` and `research.hereNow` (js/atlas-cap-research.js) — both are kept, both are
 *      handed this same record; hereNow is the one that may read the device position (confirm `explicit`)
 *
 *  THE SECTIONS, and where each value comes from:
 *    · this point    coordinates (HOST.fmtLL); the name and administrative chain (OpenStreetMap through Nominatim
 *                    reverse, behind the app's one queue js/nominatim-gate.js and the host's deadline
 *                    js/proxy-fetch.js clockFor); the country (Natural Earth admin-0, HOST.countryGeo, hit-tested
 *                    with window._imPipGeo); the elevation (the `elevation` registration of window.IntMapLayers)
 *    · time and sun  the time zone the weather source states (window.IntMapWx.point) and IntMap's own sunrise
 *                    equation (window.IntMapWx.sunTimes)
 *    · now           the weather now (the SAME IntMapWx.point answer — one request gives both), the earthquakes and
 *                    the news events within RELATED_DEFAULTS (js/events-near.js: the app's one reader of each)
 *    · the past      what this place was called — window.IntMapHistCities.near (the record the Chronos labels read)
 *    · layers        window.IntMapLayers.sampleAt — the reading register Atlas's `data.layerValues` reads
 *    · statistics    only when the caller hands over a metric set and its formatter (Atlas does); the card opens
 *                    the country card instead
 *    · related       js/atlas-world-objects.js — the index research.related answers from
 *
 *  ══ WHERE THE POINT CAME FROM DECIDES WHAT LEAVES THE DEVICE ═════════════════════════════════════════════
 *    `point`   a point the reader picked on the map: it is sent as picked, to the place-name and weather
 *              sources and to the tile sources the layer readings use (the profile's rule since it shipped).
 *    `device` / `shared`   the reader's own position, or the place a photo / link they shared names: what LEAVES
 *              the device is a point rounded to PRIVACY_GRID_DEG, and only to the two sources that cannot answer
 *              without one (the place name, the weather). The elevation and the layer values are NOT read for it
 *              (their tiles would name the spot) and the card says so with a reason. Earthquakes and news are
 *              fetched without a position and filtered here (js/events-near.js). Nothing is stored.
 *              privacy.html / js/legal-text.js state the same.
 *
 *  ⚠ NOTHING HERE IS A LIST OF LAYERS — the registrations and the layer declarations decide (no-ad-hoc §2-4).
 *  ⚠ A HOLE IS SAID, NOT HIDDEN: every section is `ok`, `none` (asked; nothing there) or `unavailable` (could not
 *  ask / no answer, with the reason) — .agents/rules/one-pass-or-a-reason.md §5.
 *  ⚠ THE CARD READS THE SAME OBJECT ATLAS IS HANDED: `placeProfile()` builds one JSON-safe record, `profileHtml()`
 *  draws it for the card and for Atlas's bubble, `profileSpeech()` reads it aloud (js/map-reader.js).
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). Marks are js/icons.js line icons, never emoji.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { NominatimGate } from './nominatim-gate.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { dataLayers } from './layer-manifest.js';
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import { worldObjects, RELATED_DEFAULTS } from './atlas-world-objects.js';   /* «near a point» has one definition (km and hours), and «Related» reads the index Atlas does */
import { readQuakes, readNewsEvents, QUAKE_FEED } from './events-near.js';   /* the one reader of the USGS feed and of the news window */
import { requestFix, FIX_FAILURE } from './locate-me.js';
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { whenHost } from './host-door.js';
import { MapState } from './map-state.js';
import * as bus from './bus.js';   /* the declared events (js/bus.js) — MAP_ANSWER_EVENT is raised through it */
import './safe-html.js';
const WO = worldObjects;   /* the one session index (js/atlas-world-objects.js) */
const GE = () => IntMapGeoEngine;

const esc = (s) => { try { return window.IntMapSafe.html(s == null ? '' : String(s)); } catch (_) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'); } };
const finite = (v) => typeof v === 'number' && isFinite(v);
/* why nothing arrived, in the vocabulary js/fetch-deadline.js throws with ('timeout' | 'network' | 'http' | 'parse' | 'aborted') */
const reasonOf = (e) => (e && e.reason) ? String(e.reason) : 'network';

/* ══ WHAT LEAVES THE DEVICE ═════════════════════════════════════════════════════════════════════════
   0.1° is about 11 km north–south (and less east–west away from the equator): the scale of a town, which is the
   scale both outgoing questions are about — Nominatim is asked at zoom 10 (town) for such a point, and the weather
   models behind Open-Meteo's best match are 1–11 km grids, so a forecast for the rounded point is the forecast for
   the area. EXPIRES IF a section is added that needs a finer point from a remote source — that section must then
   say so to the reader instead of lowering this. One owner: everything that sends such a position reads `sentPoint`. */
const PRIVACY_GRID_DEG = 0.1;
export function sentPoint(pt) {
  const r = (v) => Math.round(v / PRIVACY_GRID_DEG) * PRIVACY_GRID_DEG;
  return { lng: +r(+pt.lng).toFixed(4), lat: +r(+pt.lat).toFixed(4), gridDeg: PRIVACY_GRID_DEG };
}
/** the origins whose exact position stays on the device (the rest — `point` — is a point the reader picked on the map) */
const KEPT = new Set(['device', 'shared']);
export function keepsPosition(from) { return KEPT.has(String(from || '')); }
/* the zoom Nominatim is asked at: 14 (neighbourhood) for a picked point — the chain then names the district; 10 (town)
   for a kept position — asking a finer zoom of a rounded point would name a neighbourhood the reader is not in */
const ZOOM_POINT = 14, ZOOM_KEPT = 10;

/* ── the name and the administrative chain ─────────────────────────────────────────────────────── */
/* The `address` object Nominatim returns is ordered from the most specific unit to the country, which IS the chain —
   no table of which key is which level. ISO 3166-2 keys and the two-letter country code are identifiers rather than
   names, so they travel as fields. `licence` is the upstream's own sentence, carried. */
async function placeName(q, lang, kept) {
  const zoom = kept ? ZOOM_KEPT : ZOOM_POINT, dp = kept ? 4 : 6;
  const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=' + zoom + '&addressdetails=1&accept-language='
    + encodeURIComponent(IntMapLang.locale(lang, 'en')) + '&lat=' + (+q.lat).toFixed(dp) + '&lon=' + (+q.lng).toFixed(dp);
  const source = { publisher: 'OpenStreetMap contributors (Nominatim)' };
  try {
    await NominatimGate.nominatimSlot();   /* queues: a card is worth waiting a second for (js/nominatim-gate.js) */
    const j = await jsonWithin(url, clockFor(url), { headers: { Accept: 'application/json' } });
    source.licence = (j && j.licence) || null;
    if (!j || j.error || !j.address) return { status: 'none', reason: 'no-named-area', source };
    const a = j.address, chain = [], ids = {};
    Object.keys(a).forEach((k) => {
      const v = a[k]; if (v == null || v === '') return;
      if (/^ISO3166/i.test(k) || k === 'country_code') { ids[k] = String(v); return; }
      if (k === 'postcode') return;
      if (!chain.some((c) => c.name === String(v))) chain.push({ key: k, name: String(v) });
    });
    return { status: 'ok', name: (j.name && String(j.name)) || (chain[0] && chain[0].name) || null, chain, zoom,
      /* a postcode belongs to a picked point; for a kept position it would be a finer place than was sent */
      postcode: kept ? null : (a.postcode || null), countryCode: a.country_code ? String(a.country_code).toUpperCase() : null, ids,
      osm: (j.osm_type && j.osm_id != null) ? (String(j.osm_type) + '/' + j.osm_id) : null, source };
  } catch (e) {
    return { status: 'unavailable', reason: reasonOf(e), source };
  }
}

/* ── the country ───────────────────────────────────────────────────────────────────────────────── */
async function countryAt(pt, HOST, opts) {
  const source = { publisher: 'Natural Earth (admin 0)' };
  try {
    const ensure = (opts && typeof opts.ensureCountries === 'function') ? opts.ensureCountries
      : (() => (typeof HOST.loadCountryData === 'function' ? HOST.loadCountryData() : null));
    await Promise.resolve(ensure());
  } catch (_) { /* the shapes may still be there from an earlier load; asked below */ }
  const geo = HOST.countryGeo, pip = window._imPipGeo;
  if (!geo || !Array.isArray(geo.features) || typeof pip !== 'function') return { status: 'unavailable', reason: 'country-shapes-not-loaded', source };
  let f = null;
  for (const ft of geo.features) { try { if (ft && ft.geometry && pip(+pt.lng, +pt.lat, ft.geometry)) { f = ft; break; } } catch (_) { /* a malformed shape is not this one */ } }
  if (!f) return { status: 'none', reason: 'outside-every-country', source };
  const code = String(f.id), s = (HOST.countryStats || {})[code] || null;
  let name = code; try { name = HOST.cName(s, code) || code; } catch (_) { name = (s && (s.nameEn || s.nameJp)) || code; }
  const out = { status: 'ok', code, name, region: (s && s.region) || null, subregion: (s && s.subregion) || null,
    capital: (s && s.capital) || null, flag: (s && s.flag) || null, recognised: s ? s.sov !== false : null, source, stats: null };
  /* the statistics are read from the metric set the CALLER holds, with the caller's formatter — the set and the one
     place that knows each metric's unit are Atlas's (js/atlas-metrics.js, js/atlas-console.js fmtVal) */
  if (s && opts && opts.metrics && typeof opts.metrics === 'object') {
    const lab = (typeof opts.label === 'function') ? opts.label : ((x) => Array.isArray(x) ? x[0] : String(x));
    const fmt = (typeof opts.format === 'function') ? opts.format : null;
    out.stats = [];
    Object.keys(opts.metrics).forEach((k) => {
      const m = opts.metrics[k]; let v = null;
      try { v = m && typeof m.get === 'function' ? m.get(s) : null; } catch (_) { v = null; }
      if (v == null || !finite(+v)) return;
      let text = null; try { text = fmt ? fmt(k, +v) : null; } catch (_) { text = null; }
      out.stats.push({ key: k, label: lab(m.label), value: +v, text: (text != null && text !== '') ? String(text) : String(+v) });
    });
  }
  return out;
}

/* ── the layers: the reading register, and the panel rows it cannot read ───────────────────────── */
/* the DEM tile under the point is asked for with the elevation registration's OWN zoom (demElevAt with no zoom
   argument is exactly what js/map-ui.js `elevation.measure` calls); the callback fires when the tile lands */
function warmElevation(pt, HOST) {
  return new Promise((res) => {
    let done = false; const fin = () => { if (!done) { done = true; res(); } };
    try {
      if (typeof HOST.demElevAt !== 'function') { fin(); return; }
      const v = HOST.demElevAt(+pt.lng, +pt.lat, fin);
      if (v != null) fin();
    } catch (_) { fin(); }
    /* the same deadline the aircraft card gives the same tile (js/aircraft-detail.js warmDEMTiles 9000) */
    setTimeout(fin, 9000);
  });
}

async function layerReadings(pt, HOST) {
  const LY = window.IntMapLayers;
  if (!LY || typeof LY.sampleAt !== 'function') return { status: 'unavailable', reason: 'layer-registry-not-loaded', rows: [], elevation: null };
  await warmElevation(pt, HOST);
  let got = [];
  try { got = await LY.sampleAt(+pt.lng, +pt.lat); } catch (_) { got = []; }
  const stateOf = (id) => { try { return LY.state(id) || {}; } catch (_) { return {}; } };
  const rows = [], seen = new Set();
  let elevation = null;
  (got || []).forEach((r) => {
    if (!r || !r.id) return; seen.add(r.id);
    const st = stateOf(r.id);
    const row = { id: r.id, label: r.label || st.label || r.id, source: st.source || null, time: st.time || null };
    if (st.rights) row.rights = st.rights;
    if (r.failed) { row.status = 'unavailable'; row.reason = 'sampler-failed'; }
    else if (r.value == null) { row.status = 'none'; row.reason = 'no-value-here'; }
    else {
      row.status = 'ok'; row.text = String(r.value);
      if (finite(r.number)) { row.value = r.number; if (r.unit != null) row.unit = r.unit; }
      if (r.code != null) row.code = r.code;
      if (finite(r.direction)) row.direction = r.direction;
    }
    /* the elevation registration is always on (js/map-ui.js `on:()=>true`): it is the point's elevation, not a layer
       the reader chose, so it heads the card and is not repeated among the layers */
    if (r.id === 'elevation') elevation = row; else rows.push(row);
  });
  /* registrations that are on and have no point door — they hold FEATURES (earthquakes, cameras…) */
  let active = [];
  try { active = LY.active() || []; } catch (_) { active = []; }
  active.forEach((id) => {
    if (seen.has(id)) return; seen.add(id);
    const st = stateOf(id);
    rows.push({ id, label: st.label || id, status: 'unreadable', reason: 'features-not-a-value', source: st.source || null, time: st.time || null });
  });
  /* panel rows that are switched on and register NO reading at all — found from the declarations. A row is answered
     for when its declaration names a registered id (`registry`), or by the register's OWN convention for a row that
     names none: js/map-ui.js isOn(id) reads the checkbox `dl-`+id or id. ⚠ WHAT IS SAID IS EXACTLY WHAT IS KNOWN:
     the declaration names no reader — the reason says «declares no point reader», not «has no value». */
  let listed = [];
  try { listed = LY.list() || []; } catch (_) { listed = []; }
  let decls = [];
  try { decls = dataLayers(); } catch (_) { decls = []; }
  decls.forEach((d) => {
    let cb = null; try { cb = document.getElementById(d.id); } catch (_) { cb = null; }
    if (!cb || !cb.checked) return;
    const regs = (Array.isArray(d.registry) && d.registry.length) ? d.registry : [d.id, String(d.id).replace(/^dl-/, '')];
    if (regs.some((x) => listed.indexOf(x) >= 0)) return;   /* the register answers for it (above) */
    const lab = cb.closest ? (cb.closest('label') || cb.closest('.lyr-row')) : null;
    let text = ''; try { const sp = lab && lab.querySelector('span[data-i18n], span.ec-lbl, span[id$="-lbl"], .geo-label'); text = String((sp ? sp.textContent : (lab ? lab.textContent : '')) || '').replace(/\s+/g, ' ').trim(); } catch (_) { text = ''; }
    rows.push({ id: d.id, label: text || d.id, status: 'unreadable', reason: 'no-point-reader-declared', source: null, time: null });
  });
  return { status: 'ok', rows, elevation, reason: null };
}

/* ── the time zone and the weather: ONE answer from the weather source; the sun computed here ───────── */
/* `exact` is where the sun is computed (on the device — nothing is sent); `q` is the point the weather source is
   asked about (the picked point, or the rounded one). Before the cards were one, the same request was made twice. */
async function timeAndWeather(exact, q) {
  const W = window.IntMapWx;
  const time = { status: 'ok', timeZone: null, utcOffsetSeconds: null, zoneSource: null, sun: null };
  try {
    const s = W && typeof W.sunTimes === 'function' ? W.sunTimes(+exact.lat, +exact.lng) : null;
    if (s) time.sun = { sunrise: s.sunrise ? s.sunrise.toISOString() : null, sunset: s.sunset ? s.sunset.toISOString() : null,
      transit: s.transit ? s.transit.toISOString() : null, daylightSeconds: finite(s.daylightSec) ? Math.round(s.daylightSec) : null,
      polar: s.polar || null, source: { publisher: 'IntMap', method: 'sunrise equation (js/wx-source.js sunTimes)' } };
  } catch (_) { /* answered as a reason below */ }
  if (!time.sun) time.sunWhy = 'sun-model-not-loaded';
  if (!W || typeof W.point !== 'function') {
    time.zoneWhy = 'weather-source-unreachable';
    if (!time.sun) time.status = 'unavailable';
    return { time, weather: { status: 'unavailable', reason: 'weather-source-not-loaded' } };
  }
  let j = null;
  try { j = await W.point(+q.lat, +q.lng, { uv: false, gusts: false }); } catch (_) { j = null; }
  const src = j ? String(j._src || j.source || 'weather-source') : null;
  if (j && j.timezone && finite(j.utc_offset_seconds)) {
    time.timeZone = String(j.timezone); time.utcOffsetSeconds = j.utc_offset_seconds;
    time.zoneSource = { publisher: String(j._src || 'Open-Meteo') };
  } else time.zoneWhy = j ? ('zone-not-stated-by:' + src) : 'weather-source-unreachable';
  if (!time.sun && !time.timeZone) time.status = 'unavailable';
  if (!j || !j.current) return { time, weather: { status: 'unavailable', reason: 'weather-source-unreachable' } };
  const c = j.current, d = j.daily || {}, n = (v) => (v == null || !finite(+v)) ? null : +v;
  return { time, weather: { status: 'ok', tempC: n(c.temperature_2m), feelsC: n(c.apparent_temperature), code: n(c.weather_code), windKmh: n(c.wind_speed_10m),
    windDirDeg: n(c.wind_direction_10m), precipMm: n(c.precipitation), humidityPct: n(c.relative_humidity_2m), isDay: c.is_day == null ? null : !!c.is_day,
    todayMaxC: n(d.temperature_2m_max && d.temperature_2m_max[0]), todayMinC: n(d.temperature_2m_min && d.temperature_2m_min[0]),
    precipProbPct: n(d.precipitation_probability_max && d.precipitation_probability_max[0]),
    observedAt: c.time ? String(c.time) : null, timeZone: time.timeZone, utcOffsetSeconds: time.utcOffsetSeconds,
    source: { publisher: String(j._src || 'Open-Meteo') } } };
}

/* ── now: earthquakes and news within the reach (js/events-near.js — read without a position, filtered here) ── */
async function quakesNear(pt, reachKm) {
  const r = await readQuakes({ area: { point: pt, radiusKm: reachKm }, days: QUAKE_FEED.days, minMag: QUAKE_FEED.minMag });
  return { status: r.state, reason: r.reason, reachKm, days: r.window.days, minMag: r.window.minMag, count: r.items.length, scanned: r.scanned,
    items: r.items.map((x) => ({ id: x.id, mag: x.mag, place: x.place, time: x.time, km: Math.round(x.km), depthKm: finite(x.depthKm) ? Math.round(x.depthKm) : null, lng: x.lng, lat: x.lat, url: x.url })),
    fetchedAt: r.fetchedAt, source: r.source };
}
async function newsNear(pt, reachKm, hours, HOST) {
  const r = await readNewsEvents({ db: HOST && HOST.DB, area: { point: pt, radiusKm: reachKm }, hours });
  return { status: r.state, reason: r.reason, reachKm, hours, scanned: r.scanned, truncated: r.truncated, count: r.items.length,
    items: r.items.map((x) => Object.assign({}, x, { km: Math.round(x.km) })), source: r.source };
}

/* ── the past: what this place was called, from the renamed-city record (a file this page already has) ── */
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
 * placeProfile({lng,lat,name?,from?,accuracyM?}, HOST, opts?) → the card's record (JSON-safe) — the ONE gatherer.
 *   pt.from          'point' (picked on the map — the default) | 'device' | 'shared'  (see the header: what leaves)
 *   opts.focus       'now' puts the «now» sections first on the card (default: 'now' for a kept position)
 *   opts.onSection(name, section)  called as each section settles — the card renders progressively
 *   opts.ensureCountries()         how to make sure the country shapes are loaded (Atlas: K.ensureData)
 *   opts.metrics / label / format  a country metric set { key: {label, get} }, its label reader and formatter (Atlas)
 */
export async function placeProfile(pt, HOST, opts) {
  opts = opts || {};
  const lng = +pt.lng, lat = +pt.lat;
  if (!finite(lng) || !finite(lat)) throw new Error('placeProfile: no point');
  const tell = (k, v) => { try { if (typeof opts.onSection === 'function') opts.onSection(k, v); } catch (_) { /* a renderer's failure is not the record's */ } return v; };
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  const from = keepsPosition(pt.from) ? String(pt.from) : 'point', kept = keepsPosition(from);
  const out = recordHead({ lng, lat, name: pt.name, from, accuracyM: pt.accuracyM }, HOST, opts);
  const q = out.sent.point, exact = { lng, lat };
  const reachKm = out.reachKm, hours = out.hours;
  const [place, country, layers, tw, quakes, news, past] = await Promise.all([
    placeName(q, lang, kept).then((v) => tell('place', v)),
    countryAt(exact, HOST, opts).then((v) => tell('country', v)),
    /* a kept position is not read against the layer tiles: their requests would name the spot */
    (kept ? Promise.resolve({ status: 'unavailable', reason: 'position-kept-on-device', rows: [], elevation: null }) : layerReadings(exact, HOST)).then((v) => tell('layers', v)),
    timeAndWeather(exact, q).then((v) => { tell('time', v.time); tell('weather', v.weather); return v; }),
    quakesNear(exact, reachKm).then((v) => tell('quakes', v)),
    newsNear(exact, reachKm, hours, HOST).then((v) => tell('news', v)),
    pastNames(exact, lang).then((v) => tell('past', v)),
  ]);
  Object.assign(out, { place, country, time: tw.time, weather: tw.weather, quakes, news, past });
  out.elevation = layers.elevation || { status: 'unavailable', reason: layers.reason || 'no-elevation-registration' };
  out.layers = { status: layers.status, reason: layers.reason || null, rows: layers.rows };
  return out;
}
/** the same record with the «now» sections first — `research.hereNow` and the device / shared doors */
export function hereNow(pt, HOST, opts) { return placeProfile(pt, HOST, Object.assign({}, opts || {}, { focus: 'now' })); }

/** the part of the record known before anything is asked (the card draws it at once) */
function recordHead(pt, HOST, opts) {
  const lng = +pt.lng, lat = +pt.lat, from = keepsPosition(pt.from) ? String(pt.from) : 'point', kept = keepsPosition(from);
  let text = null; try { text = HOST.fmtLL(lng, lat); } catch (_) { text = lat.toFixed(5) + ', ' + lng.toFixed(5); }
  const q = kept ? sentPoint({ lng, lat }) : { lng, lat, gridDeg: null };
  return { at: { lng, lat, text, from, accuracyM: finite(+pt.accuracyM) ? Math.round(+pt.accuracyM) : null, name: pt.name ? String(pt.name) : null },
    asked: pt.name ? String(pt.name) : null, focus: (opts && opts.focus === 'now') || kept ? 'now' : 'place',
    sent: { point: q, to: ['nominatim.openstreetmap.org', 'api.open-meteo.com (or api.met.no)'].concat(kept ? [] : ['the tile sources of the layers that are on']) },
    reachKm: RELATED_DEFAULTS.km, hours: RELATED_DEFAULTS.hours, asOf: new Date().toISOString() };
}

/* ══ RENDERING — the card, Atlas's bubble and the screen reader read the same record through these ═════════ */
function words(HOST) {
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  /* the reason codes the gatherers above (and js/events-near.js) write, said to a reader */
  const WHY = {
    'no-named-area': L('OpenStreetMap names no area here', 'OpenStreetMap はここに名前のある区域を持っていません'),
    'timeout': L('the source did not answer in time', '取得先が時間内に応答しませんでした'),
    'network': L('the source could not be reached', '取得先に到達できませんでした'),
    'http': L('the source refused the request', '取得先が要求を拒否しました'),
    'parse': L('the source answered with something unreadable', '取得先の応答を読めませんでした'),
    'aborted': L('the request was cancelled', '要求が取り消されました'),
    'country-shapes-not-loaded': L('the country boundaries have not loaded', '国境データが読み込まれていません'),
    'outside-every-country': L('outside every country boundary (open sea or unclaimed land)', 'どの国の境界にも入っていません（公海・帰属未定の土地）'),
    'layer-registry-not-loaded': L('the layer register has not loaded', 'レイヤーの読み取り窓口が読み込まれていません'),
    'no-elevation-registration': L('no elevation source is registered', '標高の取得元が登録されていません'),
    'sampler-failed': L('the layer could not be read here', 'この地点でレイヤーを読めませんでした'),
    'no-value-here': L('no value at this point (or its tile is not loaded)', 'この地点に値がありません（またはタイルが未読み込み）'),
    'features-not-a-value': L('shows features, not a value at a point', '地物を表示するレイヤーで、地点の値はありません'),
    'no-point-reader-declared': L('this layer declares no point reader', 'このレイヤーは地点の値の読み手を宣言していません'),
    'position-kept-on-device': L('not read for a position from this device — long-press the map ▸ About the place to read it for a point', '端末の位置からは読みません（地図を長押し ▸ 地点について で、選んだ地点の値を読めます）'),
    'sun-model-not-loaded': L('the sun model has not loaded', '日の出入りの計算が読み込まれていません'),
    'weather-source-not-loaded': L('the weather source has not loaded', '天気の取得元が読み込まれていません'),
    'weather-source-unreachable': L('neither weather source answered', 'どちらの天気の取得元も応答しませんでした'),
    'no-database-client': L('the news database is not connected', 'ニュースのデータベースに接続していません'),
    'history-record-not-loaded': L('the historical names record has not loaded', '地名の歴史の記録が読み込まれていません'),
    'history-record-unreachable': L('the historical names record could not be read', '地名の歴史の記録を読めませんでした'),
    'no-recorded-renaming-here': L('IntMap records no former name for this place', 'この場所のかつての名前は IntMap の記録にありません'),
    [FIX_FAILURE.UNSUPPORTED]: L('this browser cannot read the device position', 'このブラウザは端末の位置を読めません'),
    [FIX_FAILURE.BLOCKED]: L('location is blocked for this site — allow it in the browser settings', 'このサイトの位置情報がブロックされています。ブラウザの設定で許可してください'),
    [FIX_FAILURE.DENIED]: L('location permission was not given', '位置情報の許可がありませんでした'),
    [FIX_FAILURE.UNAVAILABLE]: L('the device has no position to give', '端末が位置を取得できませんでした'),
  };
  const why = (code) => {
    const c = String(code || '');
    if (c.indexOf('zone-not-stated-by:') === 0) return L('the source that answered (' + c.slice(19) + ') states no time zone', '応答した取得先（' + c.slice(19) + '）はタイムゾーンを示していません');
    return WHY[c] || c;
  };
  return { L, why };
}
function clock(iso, tz, lang, withDate) {
  if (!iso) return null;
  try { return new Intl.DateTimeFormat(IntMapLang.locale(lang, 'en'), Object.assign(withDate ? { month: 'short', day: 'numeric' } : {}, { hour: '2-digit', minute: '2-digit', timeZone: tz || 'UTC' })).format(new Date(iso)); } catch (_) { return null; }
}
function offsetText(sec) {
  if (!finite(sec)) return '';
  const s = sec < 0 ? '−' : '+', a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  return 'UTC' + s + h + (m ? ':' + String(m).padStart(2, '0') : '');
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

/** the record as HTML — the card's body, and Atlas's bubble (`opts.inert`: no controls, nothing listens there) */
export function profileHtml(p, HOST, opts) {
  opts = opts || {};
  const { L, why } = words(HOST);
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  const wait = '<span class="pd-why" data-pending>' + esc(L('Reading…', '読み込み中…')) + '</span>';
  const waitN = '<span class="hn-why" data-pending>' + esc(L('Reading…', '読み込み中…')) + '</span>';
  const row = (k, vHtml, meta) => '<div class="acp-row"><span class="acp-k">' + esc(k) + '</span><span class="acp-v">' + vHtml + (meta ? '<span class="pd-meta">' + esc(meta) + '</span>' : '') + '</span></div>';
  const hole = (code) => '<span class="pd-why">' + esc(why(code)) + '</span>';
  const holeN = (code) => '<span class="hn-why">' + esc(why(code)) + '</span>';
  const sec = (title, body) => body ? '<div class="acp-sec">' + esc(title) + '</div>' + body : '';
  const secN = (title, sub, body) => '<div class="hn-sec"><div class="hn-h">' + esc(title) + (sub ? '<span class="hn-sub">' + esc(sub) + '</span>' : '') + '</div>' + body + '</div>';
  /* a list row is a button on the card (it flies, opens, sets the year); in Atlas's bubble it is a row */
  const item = (attrs, inner, disabled) => opts.inert ? '<div class="hn-item">' + inner + '</div>' : '<button type="button" class="hn-item" ' + attrs + (disabled ? ' disabled' : '') + '>' + inner + '</button>';
  const t = p.time, tz = t && t.timeZone ? t.timeZone : null;
  let h = '';
  /* ── the chain ── */
  const pl = p.place;
  if (opts.withChain !== false) {
    const acc = p.at && p.at.from === 'device' && finite(p.at.accuracyM) ? L(' · ±' + p.at.accuracyM + ' m', ' · 誤差 ±' + p.at.accuracyM + ' m') : '';
    if (!pl) h += '<div class="pd-sub">' + wait + '</div>';
    else if (pl.status === 'ok' && pl.chain && pl.chain.length) h += '<div class="pd-sub">' + esc(pl.chain.map((c) => c.name).join(' · ') + acc) + '</div>';
    else h += '<div class="pd-sub">' + hole(pl.reason) + '</div>';
  }
  /* ── now: the weather, the earthquakes and the news within the reach ── */
  let now = '';
  const w = p.weather;
  let wb;
  if (!w) wb = waitN;
  else if (w.status !== 'ok') wb = holeN(w.reason);
  else {
    let desc = ''; try { desc = window.IntMapWeather && window.IntMapWeather.describe ? window.IntMapWeather.describe(w.code) : ''; } catch (_) { desc = ''; }
    const tc = (c) => { if (!finite(c)) return '—'; try { if (window.fmtTemp) return window.fmtTemp(c); } catch (_) { /* the app's unit setting is optional */ } return Math.round(c) + '°C'; };
    wb = '<div class="hn-big">' + esc(tc(w.tempC)) + '<span class="hn-desc">' + esc(desc || L('WMO code ', 'WMO 天気コード ') + w.code) + '</span></div>'
      + '<div class="hn-line">' + esc([finite(w.feelsC) ? L('feels ', '体感 ') + tc(w.feelsC) : null, finite(w.windKmh) ? L('wind ', '風 ') + Math.round(w.windKmh) + ' km/h' : null,
        finite(w.humidityPct) ? L('humidity ', '湿度 ') + Math.round(w.humidityPct) + '%' : null].filter(Boolean).join(' · ')) + '</div>'
      + '<div class="hn-line">' + esc([finite(w.todayMaxC) ? L('today ', '今日 ') + tc(w.todayMaxC) + ' / ' + tc(w.todayMinC) : null,
        finite(w.precipProbPct) ? L('rain chance ', '降水確率 ') + Math.round(w.precipProbPct) + '%' : null].filter(Boolean).join(' · ')) + '</div>';
  }
  const localNow = tz ? clock(new Date().toISOString(), tz, lang) : null;
  now += secN(L('Weather now', 'いまの天気'), localNow ? L('local time ', '現地時刻 ') + localNow : '', wb);
  const q = p.quakes, qd = (q && q.days) || QUAKE_FEED.days, qm = (q && q.minMag) || QUAKE_FEED.minMag;
  let qb;
  if (!q) qb = waitN;
  else if (q.status === 'unavailable') qb = holeN(q.reason);
  else if (q.status === 'none') qb = '<div class="hn-line">' + esc(L('No earthquake of M' + qm + ' or more within ' + q.reachKm + ' km in the last ' + qd + ' days.', '過去' + qd + '日、' + q.reachKm + ' km 以内に M' + qm + ' 以上の地震はありません。')) + '</div>';
  else qb = q.items.slice(0, SHOWN).map((x, i) => item('data-hn="quake" data-i="' + i + '"', '<b class="hn-mag">M' + (finite(x.mag) ? x.mag.toFixed(1) : '?') + '</b><span class="hn-t">' + esc(x.place || '') + '</span><span class="hn-m">' + esc(x.km + ' km · ' + ago(x.time, L) + (finite(x.depthKm) ? L(' · depth ', ' · 深さ ') + x.depthKm + ' km' : '')) + '</span>')).join('')
    + (q.items.length > SHOWN ? '<div class="hn-more">+' + (q.items.length - SHOWN) + '</div>' : '');
  now += secN(L('Earthquakes nearby', '周辺の地震'), q && q.reachKm ? L('within ' + q.reachKm + ' km · ' + qd + ' days · M' + qm + '+', q.reachKm + ' km 以内 · ' + qd + '日 · M' + qm + '以上') : '', qb);
  const n = p.news;
  let nb;
  if (!n) nb = waitN;
  else if (n.status === 'unavailable') nb = holeN(n.reason);
  else if (n.status === 'none') nb = '<div class="hn-line">' + esc(L('No news event placed within ' + n.reachKm + ' km in the last ' + n.hours + ' hours.', '過去' + n.hours + '時間、' + n.reachKm + ' km 以内に位置の付いた出来事はありません。')) + '</div>';
  else nb = n.items.slice(0, SHOWN).map((x, i) => item('data-hn="news" data-i="' + i + '"', '<span class="hn-t">' + esc(x.title) + '</span><span class="hn-m">' + esc([x.place, x.km + ' km', ago(x.lastAt, L), finite(x.outlets) ? L(x.outlets + (x.outlets === 1 ? ' outlet' : ' outlets'), x.outlets + ' 媒体') : null].filter(Boolean).join(' · ')) + '</span>')).join('')
    + (n.items.length > SHOWN ? '<div class="hn-more">+' + (n.items.length - SHOWN) + '</div>' : '');
  if (n && n.truncated) nb += '<div class="hn-why">' + esc(L('Only the newest ' + n.scanned + ' events were read.', '新しい ' + n.scanned + ' 件だけを読みました。')) + '</div>';
  now += secN(L('News nearby', '近くのニュース'), n && n.reachKm ? L('within ' + n.reachKm + ' km · ' + n.hours + ' h', n.reachKm + ' km 以内 · ' + n.hours + '時間') : '', nb);
  if (p.focus === 'now') h += now;
  /* ── this point ── */
  let here = row(L('Coordinates', '座標'), esc(p.at.text));
  const el = p.elevation;
  if (!el) here += row(L('Elevation', '標高'), wait);
  else if (el.status === 'ok' && finite(el.value)) {
    let tx = el.text; try { tx = HOST.fmtElevVal(Math.abs(el.value)); } catch (_) { /* the registration's own text */ }
    here += row(el.value < 0 ? L('Sea depth', '水深') : L('Elevation', '標高'), esc(tx), el.source || null);
  } else here += row(L('Elevation', '標高'), hole(el.reason));
  const c = p.country;
  if (!c) here += row(L('Country', '国'), wait);
  else if (c.status === 'ok') {
    let flag = ''; try { flag = c.flag ? window.IntMapSafe.flag(c.flag) + ' ' : ''; } catch (_) { flag = ''; }
    here += row(L('Country', '国'), flag + esc(c.name), [c.code, c.capital ? (L('capital ', '首都 ') + c.capital) : null].filter(Boolean).join(' · '));
  } else here += row(L('Country', '国'), hole(c.reason));
  if (pl && pl.status === 'ok' && pl.postcode) here += row(L('Postcode', '郵便番号'), esc(pl.postcode));
  h += sec(L('This point', 'この地点'), here);
  /* ── time and the sun ── */
  let tb = '';
  if (!t) tb = row(L('Local time', '現地時刻'), wait);
  else {
    if (t.timeZone) tb += row(L('Local time', '現地時刻'), esc(clock(new Date().toISOString(), t.timeZone, lang) || '—'), t.timeZone + ' · ' + offsetText(t.utcOffsetSeconds));
    else tb += row(L('Local time', '現地時刻'), hole(t.zoneWhy));
    const s = t.sun, zl = tz ? '' : ' UTC';
    if (s && s.polar === 'day') tb += row(L('Sun', '太陽'), esc(L('Above the horizon all day', '一日中沈みません')));
    else if (s && s.polar === 'night') tb += row(L('Sun', '太陽'), esc(L('Below the horizon all day', '一日中昇りません')));
    else if (s) {
      tb += row(L('Sunrise', '日の出'), esc((clock(s.sunrise, tz, lang) || '—') + zl));
      tb += row(L('Sunset', '日の入り'), esc((clock(s.sunset, tz, lang) || '—') + zl));
    } else tb += row(L('Sunrise / sunset', '日の出・日の入り'), hole(t.sunWhy));
    if (s && finite(s.daylightSeconds)) { const hh = Math.floor(s.daylightSeconds / 3600), mm = Math.round((s.daylightSeconds % 3600) / 60); tb += row(L('Daylight', '昼の長さ'), esc(hh + L(' h ', '時間') + mm + L(' min', '分'))); }
  }
  h += sec(L('Time and sun', '時刻と太陽'), tb);
  if (p.focus !== 'now') h += now;
  /* ── the past ── */
  const ps = p.past;
  let pb;
  if (!ps) pb = waitN;
  else if (ps.status !== 'ok') pb = holeN(ps.reason);
  else pb = ps.spans.map((x, i) => { const yr = spanYear(x), when = spanText(x, lang);
    return item('data-hn="past" data-i="' + i + '"', '<span class="hn-t">' + esc(x.name) + '</span><span class="hn-m">' + esc((when || L('dates not stated', '年代の記載なし')) + (yr != null && !opts.inert ? L(' · see the map in ' + yearOf(yr, lang, ''), ' · ' + yearOf(yr, lang, '年') + 'の地図を見る') : '')) + '</span>', yr == null); }).join('');
  h += secN(L('This place in the past', 'この場所のかつての名前'), ps && ps.status === 'ok' && ps.city.today ? L('recorded as ', '記録上の名前 ') + ps.city.today : '', pb);
  /* ── the layers that are on ── */
  const ly = p.layers;
  let lb = '';
  if (!ly) lb = '<div class="acp-row">' + wait + '</div>';
  else if (ly.status !== 'ok') lb = '<div class="acp-row">' + hole(ly.reason) + '</div>';
  else if (!ly.rows.length) lb = '<div class="acp-row"><span class="pd-why">' + esc(L('No data layer is on. Switch layers on and their values here are listed.', 'データレイヤーがオフです。オンにすると、この地点の値がここに並びます。')) + '</span></div>';
  else ly.rows.forEach((r) => {
    const meta = [r.source, r.time].filter(Boolean).join(' · ');
    lb += row(r.label, r.status === 'ok' ? esc(r.text) : hole(r.reason), meta || null);
  });
  h += sec(L('Layers on the map', '表示中のレイヤー'), lb);
  /* ── statistics (only when the caller asked with a metric set) ── */
  if (c && c.status === 'ok' && Array.isArray(c.stats) && c.stats.length) h += sec(L('Country statistics', '国の統計') + ' — ' + c.name, c.stats.map((s) => row(s.label, esc(s.text))).join(''));
  /* ── who said it, and what left the device ── */
  const credits = [];
  const add = (x) => { if (x && credits.indexOf(x) < 0) credits.push(x); };
  if (pl && pl.source) add(pl.source.publisher + (pl.source.licence ? ' — ' + pl.source.licence : ''));
  if (c && c.source) add(c.source.publisher);
  if (t && t.zoneSource) add(t.zoneSource.publisher + ' (' + L('time zone', 'タイムゾーン') + ')');
  if (w && w.source) add(w.source.publisher);
  if (q && q.source) add(q.source.publisher);
  if (n && n.source) add(n.source.publisher);
  if (ps && ps.rights) ps.rights.forEach((r) => add(r.publisher + (r.licence ? ' (' + r.licence + ')' : '')));
  if (t && t.sun) add(L('Sunrise and sunset computed by IntMap', '日の出・日の入りは IntMap の計算'));
  if (credits.length) h += '<div class="acp-src">' + esc(L('Sources: ', '出典: ') + credits.join(' · ')) + '</div>';
  if (p.at && keepsPosition(p.at.from)) h += '<div class="hn-priv">' + icon('lock', { size: 12 }) + ' ' + esc(p.at.from === 'device'
    ? L('Your exact position stays on this device. Only a point rounded to ' + PRIVACY_GRID_DEG + '° (about 11 km) is sent, for the place name and the weather; earthquakes and news are filtered here. Nothing is saved.',
      '正確な現在地はこの端末から出ません。地名と天気のためにだけ ' + PRIVACY_GRID_DEG + '°（約 11 km）に丸めた地点を送り、地震とニュースは端末内で絞り込みます。何も保存しません。')
    : L('For the place name and the weather a point rounded to ' + PRIVACY_GRID_DEG + '° is sent; earthquakes and news are filtered on this device.', '地名と天気には ' + PRIVACY_GRID_DEG + '° に丸めた地点を送り、地震とニュースはこの端末で絞り込みます。')) + '</div>';
  return h;
}

/** (keyboard-and-offline) the SAME record as plain sentences, for a screen reader — js/map-reader.js speaks it.
    Nothing is gathered here and nothing is decided: every clause is a field of the record `placeProfile` built,
    and a section the source could not answer says so in the words the card uses (a hole is said, not hidden). */
export function profileSpeech(p, HOST) {
  const { L, why } = words(HOST);
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  const out = [];
  const pl = p.place, c = p.country, el = p.elevation, t = p.time, ly = p.layers;
  if (pl && pl.status === 'ok' && pl.chain && pl.chain.length) out.push(pl.chain.map((x) => x.name).join(', ') + '.');
  else if (pl) out.push(L('Place name unavailable: ', '地名を取得できません: ') + why(pl.reason) + '.');
  if (c && c.status === 'ok') out.push(L('Country: ', '国: ') + c.name + (c.capital ? L(', capital ', '、首都 ') + c.capital : '') + '.');
  else if (c) out.push(L('Country: ', '国: ') + why(c.reason) + '.');
  if (el && el.status === 'ok' && finite(el.value)) {
    let txt = el.text; try { txt = HOST.fmtElevVal(Math.abs(el.value)); } catch (_) { /* the registration's own text */ }
    out.push((el.value < 0 ? L('Sea depth ', '水深 ') : L('Elevation ', '標高 ')) + txt + '.');
  } else if (el) out.push(L('Elevation: ', '標高: ') + why(el.reason) + '.');
  if (t && t.timeZone) out.push(L('Local time ', '現地時刻 ') + (clock(new Date().toISOString(), t.timeZone, lang) || '') + ' (' + t.timeZone + ').');
  if (t && t.sun && !t.sun.polar && t.sun.sunrise) out.push(L('Sunrise ', '日の出 ') + (clock(t.sun.sunrise, t.timeZone, lang) || '') + L(', sunset ', '、日の入り ') + (clock(t.sun.sunset, t.timeZone, lang) || '') + '.');
  if (ly && ly.status === 'ok') {
    const ok = ly.rows.filter((r) => r.status === 'ok'), rest = ly.rows.filter((r) => r.status !== 'ok');
    ok.forEach((r) => out.push(r.label + ': ' + r.text + '.'));
    if (rest.length) out.push(L(rest.length + ' layer(s) on have no value at this point: ', 'オンのレイヤーのうち ' + rest.length + ' 件はこの地点に値がありません: ') + rest.map((r) => r.label).join(L(', ', '、')) + '.');
    if (!ly.rows.length) out.push(L('No data layer is on.', 'データレイヤーはオンになっていません。'));
  } else if (ly) out.push(L('Layer values: ', 'レイヤーの値: ') + why(ly.reason) + '.');
  return out.join(' ');
}

/* ══ THE MAP: the quakes and news the card lists, drawn while the card is open ═════════════════════ */
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
/* the «now» and «past» lists (.hn-*) — injected the first time a card or an Atlas bubble draws them, the way «Here, now»
   always did; the card's frame, rows and actions (.pd-*) are in css/intmap.css. The action row wraps: four doors do not
   fit one line on a phone. */
const CSS = [
  '.pd-popup .pd-actions{flex-wrap:wrap;} .pd-popup .pd-actions button{flex:1 1 40%;}',
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
  '.hn-priv{font-size:10.5px;color:var(--text-muted);margin-top:10px;line-height:1.45;display:flex;gap:5px;align-items:flex-start;}',
  '.hn-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}',
  '.hn-actions button{flex:1 1 30%;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 8px;border:none;border-radius:10px;background:var(--input-bg);color:var(--text-main);font-weight:600;font-size:12px;cursor:pointer;}',
].join('\n');
/* the phone's sizes: a finger is 44 px — the rows and the actions are that tall; the close keeps the 32 px box every popup ×
   is drawn with (js/data-layers.js, «one UI for every ×») and takes the finger with a 44 px ::after, the way the legend's
   × does (docs/architecture/09-mobile.md §9.2). The layout boundary is js/ui-device.js's (`media()`), never a number here. */
const PHONE_CSS = '.hn-item{min-height:44px;} .hn-actions button{min-height:44px;font-size:13.5px;} .pd-correct{min-height:44px;}'
  + ' .pd-popup .country-popup-close::after{content:"";position:absolute;inset:-6px;}';
let styled = false;
export function placeCardStyle() { if (styled) return; styled = true; const st = document.createElement('style'); st.id = 'im-place-card-css'; st.textContent = CSS + '\n' + (window.IntMapDevice ? window.IntMapDevice.media(PHONE_CSS) : ''); document.head.appendChild(st); }

let card = null, seq = 0, current = null, lead = null, curHost = null;
function ensureCard(HOST) {
  placeCardStyle();
  if (card && document.body.contains(card)) return card;
  const { L } = words(HOST);
  card = document.createElement('div');
  card.className = 'country-popup pd-popup'; card.id = 'pd-popup';
  card.setAttribute('role', 'dialog'); card.setAttribute('aria-labelledby', 'pd-title');
  card.innerHTML = '<button class="country-popup-close" id="pd-close" type="button"></button>'
    + '<div class="country-popup-header"><h3 id="pd-title"></h3></div><div id="pd-lead"></div><div id="pd-body" aria-live="polite"></div>'
    + '<div class="pd-actions"><button type="button" class="primary" data-pd="country"></button><button type="button" data-pd="related"></button><button type="button" data-pd="atlas"></button><button type="button" data-pd="refresh"></button></div><div id="pd-related" class="pd-related" hidden></div>'
    + '<button type="button" class="pd-correct" data-pd="correct"></button>';
  (document.getElementById('map-container') || document.body).appendChild(card);
  const x = card.querySelector('#pd-close'); x.textContent = '×'; x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
  x.addEventListener('click', () => closePlaceCard());
  try { HOST.makeDraggable(card, card.querySelector('.country-popup-header')); } catch (_) { /* a fixed card still reads */ }
  card.addEventListener('mousedown', () => { try { HOST.bringToFront(card); } catch (_) { /* order is cosmetic */ } });
  card.addEventListener('click', (ev) => {
    const H = curHost || HOST;
    const n = ev.target && ev.target.closest ? ev.target.closest('[data-hn]') : null;
    if (n && current) {
      const k = n.dataset.hn, i = +n.dataset.i;
      if (k === 'quake') { const it = current.quakes && current.quakes.items[i]; if (it) flyTo(it.lng, it.lat, 8); }
      else if (k === 'news') { const it = current.news && current.news.items[i]; if (it) openNews(it, H); }
      else if (k === 'past') { const it = current.past && current.past.spans[i], y = it ? spanYear(it) : null; if (y != null) { try { IntMapTime.setYear(y, { source: 'here-now' }); } catch (_) { /* the clock refuses a year it cannot reach */ } flyTo(current.at.lng, current.at.lat, 9); } }
      else if (k.indexOf('lead:') === 0 && lead && lead.actions) { const a = lead.actions[+k.slice(5)]; if (a && typeof a.run === 'function') { try { a.run(); } catch (_) { /* the action states its own failure */ } } }
      return;
    }
    const b = ev.target && ev.target.closest ? ev.target.closest('[data-pd]') : null; if (!b || !current) return;
    if (b.dataset.pd === 'country') { const c = current.country; if (c && c.status === 'ok') { try { H.showCountryDetail(c.code, c.name); } catch (_) { /* the country card is the app's */ } } }
    else if (b.dataset.pd === 'related') showRelated(H);
    else if (b.dataset.pd === 'refresh') run(H, Object.assign({}, current.at), current.focus);
    /* (community-next) «something here is wrong» — js/map-corrections.js, fetched by this click. The card hands over what it
       already read: the place name, the country code and the layer rows (they become the layers the reader may name). */
    else if (b.dataset.pd === 'correct') {
      const p = current, pl = p.place, c = p.country;
      const placeLabel = (pl && pl.status === 'ok' && pl.chain && pl.chain.length) ? pl.chain.slice(0, 3).map((x) => x.name).join(', ') : null;
      import('./map-corrections.js').then((m) => m.openCorrection(HOST, { lng: p.at.lng, lat: p.at.lat, placeLabel, country: (c && c.status === 'ok') ? c.code : null, profile: p }))
        .catch(() => { try { HOST.imToast(words(HOST).L('The report form could not be loaded', '報告フォームを読み込めませんでした')); } catch (_) { /* nothing to say it with */ } });
    }
    else if (b.dataset.pd === 'atlas') {
      const at = { lng: current.at.lng, lat: current.at.lat };
      try { if (window.IntMapAtlas) window.IntMapAtlas.ensure().then((C) => { try { if (C && C.askHere) C.askHere(at); else if (C && C.open) C.open(); } catch (_) { /* Atlas states its own failure */ } }); } catch (_) { /* no Atlas in this build */ }
    }
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
/* (world-objects) «Related» — the point this card is about, as a real-world object, and what the session holds that belongs
   with it. The rule and the rendering are js/atlas-world-objects.js's — the same ones research.related answers with. */
function showRelated(HOST) {
  const box = card && card.querySelector('#pd-related'); if (!box || !current) return;
  const { L } = words(HOST);
  const me = WO.register(WO.fromPlaceProfile(current))[0];
  let news = []; try { news = WO.fromLoadedNews((typeof HOST.globalData !== 'undefined' && HOST.globalData) || []); } catch (_) { /* no news loaded → the index alone */ }
  const res = me ? WO.related(me, { extra: news }) : { items: [], total: 0 };
  const groups = WO.relatedGroups(res, { L, perType: 4 });
  const html = window.IntMapSafe.markup;   /* (safe-dom-template) every value below is escaped for where it lands */
  box.hidden = false; box.dataset.at = current.at.text;
  box.innerHTML = html`<div class="acp-src" style="margin-top:10px;">${L('Related to this point', 'この地点に関連') + ' — ' + L('within ' + RELATED_DEFAULTS.km + ' km', RELATED_DEFAULTS.km + ' km 以内')}</div>${res.total ? groups.map((g) => html`<div style="font-size:12px;margin:5px 0 1px;"><b>${g.type}</b>: ${g.count}</div>${g.items.map((x) => html`<div style="font-size:11.5px;line-height:1.5;padding-left:8px;">${x.name} <span style="color:var(--text-muted);">${x.why + (x.distanceKm != null ? ' · ' + x.distanceKm + ' km' : '') + (x.gapHours != null ? ' · ' + x.gapHours + ' h' : '')}</span></div>`)}${g.more ? html`<div style="font-size:10.5px;color:var(--text-muted);padding-left:8px;">… +${g.more}</div>` : ''}`) : html`<div style="font-size:11.5px;color:var(--text-muted);">${L('Nothing IntMap holds is tied to this point within that reach.', 'この地点に結び付く対象は、その範囲に IntMap にありません。')}</div>`}`;
}
function paintCard(HOST) {
  if (!card || !current) return;
  const { L } = words(HOST);
  const p = current, pl = p.place, nowFirst = p.focus === 'now';
  const name = (pl && pl.status === 'ok' && pl.name) ? pl.name : (p.asked || p.at.name || p.at.text);
  card.querySelector('#pd-title').innerHTML = icon(nowFirst ? 'target' : 'pin') + ' ' + esc(p.at.from === 'device' ? L('Here, now', 'いま、ここ') + ' — ' + name : name);
  card.querySelector('#pd-lead').innerHTML = lead ? '<div class="hn-lead">' + esc(lead.text || '') + '</div>' + (lead.actions && lead.actions.length ? '<div class="hn-actions">' + lead.actions.map((a, i) => '<button type="button" data-hn="lead:' + i + '">' + esc(a.label) + '</button>').join('') + '</div>' : '') : '';
  card.querySelector('#pd-body').innerHTML = profileHtml(p, HOST);
  const cb = card.querySelector('[data-pd="country"]'), ab = card.querySelector('[data-pd="atlas"]'), rb = card.querySelector('[data-pd="related"]');
  rb.innerHTML = icon('target') + ' ' + esc(L('Related to this point', 'この地点に関連')); const rbox = card.querySelector('#pd-related'); if (rbox && rbox.dataset.at !== p.at.text) { rbox.hidden = true; rbox.innerHTML = ''; }   /* a new point clears the section; a section filling in does not */
  cb.innerHTML = icon('flag') + ' ' + esc(L('Country statistics', '国の統計'));
  cb.disabled = !(p.country && p.country.status === 'ok');
  ab.innerHTML = icon('chat') + ' ' + esc(L('Ask Atlas', 'Atlasに聞く'));
  card.querySelector('[data-pd="refresh"]').textContent = L('Refresh', '更新');
  const xb = card.querySelector('[data-pd="correct"]'); if (xb) xb.innerHTML = icon('flag') + ' ' + esc(L('Something here is wrong? Report it', 'ここの地図に誤りがありますか？ 報告する'));
  ab.style.display = window.IntMapAtlas ? '' : 'none';   /* no Atlas in this build → no door to it */
  draw(p, HOST);
}
function placeCard() {
  const mc = document.getElementById('map-container'); if (!card || !mc) return;
  if (card.dataset.placed === '1') return; card.dataset.placed = '1';   /* first open only — then where the reader dragged it */
  const r = mc.getBoundingClientRect();
  card.style.left = Math.max(12, r.width - card.offsetWidth - 24) + 'px';
  card.style.top = '84px';
}

/** open the card on a point; the sections fill in as they arrive. Returns the finished record. */
async function run(HOST, pt, focus) {
  const my = ++seq;
  ensureCard(HOST);
  current = Object.assign(recordHead(pt, HOST, { focus }), { place: null, country: null, elevation: null, layers: null, time: null, weather: null, quakes: null, news: null, past: null });
  card.style.display = 'block';
  paintCard(HOST); placeCard();
  try { HOST.bringToFront(card); } catch (_) { /* order is cosmetic */ }
  /* (mobile-shell-flow) the card IS the answer and it is on the map — the phone's sheet comes down to show it */
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
  const done = await placeProfile(pt, HOST, {
    focus,
    onSection: (k, v) => {
      if (my !== seq || !current) return;
      if (k === 'layers') { current.elevation = v.elevation || { status: 'unavailable', reason: v.reason || 'no-elevation-registration' }; current.layers = { status: v.status, reason: v.reason, rows: v.rows }; }
      else current[k] = v;
      paintCard(HOST);
    },
  });
  if (my !== seq) return done;
  current = done; paintCard(HOST);
  return done;
}

/** the card on a point the reader picked on the map (the long-press menu, the search card) */
export async function openPlaceDossier(HOST, pt) {
  const lng = +(pt && pt.lng), lat = +(pt && pt.lat);
  if (!finite(lng) || !finite(lat)) return null;
  curHost = HOST; lead = null;
  return run(HOST, { lng, lat, name: pt.name || null, from: 'point' }, 'place');
}

/**
 * openHereNow(HOST, opts?) — the same card with «now» first.
 *   opts.point {lng,lat,name?,from?}  a shared point (a photo, a link: `from` defaults to 'shared' — its exact position stays
 *                                     here); absent → the device position
 *   opts.lead  {text, actions:[{label, run}]}  a line above the sections and its buttons (a shared photo's date)
 * → the finished record, or { ok:false, reason } when the device position could not be read
 */
export async function openHereNow(HOST, opts) {
  opts = opts || {}; curHost = HOST; lead = opts.lead || null;
  let pt = opts.point ? Object.assign({ from: 'shared' }, opts.point) : null;
  if (!pt) {
    ensureCard(HOST); card.style.display = 'block';
    const { L, why } = words(HOST);
    current = null; undraw();
    card.querySelector('#pd-title').innerHTML = icon('target') + ' ' + esc(L('Here, now', 'いま、ここ'));
    card.querySelector('#pd-lead').innerHTML = '';
    card.querySelector('#pd-body').innerHTML = '<div class="hn-line" data-pending>' + esc(L('Reading this device\'s position…', 'この端末の位置を読み取っています…')) + '</div>';
    placeCard();
    try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
    const fix = await requestFix();
    if (!fix.ok) {
      card.querySelector('#pd-body').innerHTML = '<div class="hn-line">' + esc(why(fix.reason)) + '</div><div class="hn-why">' + esc(L('You can still open «Here, now» for any point: long-press the map ▸ Live info.', '地図を長押し ▸ 現地の情報 から、任意の地点の「いま、ここ」を開けます。')) + '</div>';
      return { ok: false, reason: fix.reason };
    }
    /* the dot and its accuracy circle from the SAME reading (js/locate-me.js: a second read in the same context may never return) */
    try { if (window.IntMapLocate && window.IntMapLocate.start) window.IntMapLocate.start({ fly: false, fix }); } catch (_) { /* the card still answers */ }
    pt = { lng: fix.lng, lat: fix.lat, from: 'device', accuracyM: fix.acc };
  }
  flyTo(+pt.lng, +pt.lat, 9);
  return run(HOST, pt, 'now');
}
function closePlaceCard() { seq++; current = null; lead = null; undraw(); if (card) card.style.display = 'none'; }

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
