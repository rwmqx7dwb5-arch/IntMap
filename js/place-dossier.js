/* ============================================================================
 *  IntMap · PLACE DOSSIER — everything the map knows about one point, on one card  (place-dossier)
 * ----------------------------------------------------------------------------
 *  Before this file there was no door that answered 「この地点について、地図が知っていることを全部」.
 *  A country click opened the country card, `research.askHere` handed the point to a model to write
 *  prose about, and the values of the layers the reader had switched on could only be read one at a
 *  time by hovering. The dossier is the one card (and the one Atlas capability, `research.placeProfile`
 *  in js/atlas-cap-research.js) that gathers what IntMap ALREADY computes for a point:
 *
 *    · coordinates                 HOST.fmtLL — the readout's own formatting
 *    · name and administrative chain   OpenStreetMap through Nominatim reverse, behind the app's one
 *                                  Nominatim queue (js/nominatim-gate.js) and the host's own deadline
 *                                  (js/proxy-fetch.js clockFor)
 *    · country                     the Natural Earth admin-0 shapes the Countries tab is built from
 *                                  (HOST.countryGeo / HOST.countryStats), hit-tested with the app's one
 *                                  point-in-polygon (window._imPipGeo — holes included)
 *    · elevation / depth           the `elevation` registration of window.IntMapLayers (the terrarium DEM)
 *    · the layers that are on      window.IntMapLayers.sampleAt — the SAME reading register Atlas's
 *                                  `data.layerValues` and the GIS kernel read (js/map-ui.js)
 *    · local time, sunrise, sunset the time zone Open-Meteo states for the point (window.IntMapWx.point)
 *                                  and IntMap's own sunrise equation (window.IntMapWx.sunTimes)
 *    · country statistics          only when the caller hands over a metric set and its formatter —
 *                                  Atlas does (js/atlas-metrics.js through K); the card opens the
 *                                  existing country card instead of re-writing its rows here.
 *
 *  ⚠ NOTHING HERE IS A LIST OF LAYERS. Which layers are read is decided by the registrations
 *  (`IntMapLayers.active()` / `sampleAt`), and which panel rows have no point reader at all is decided by
 *  the layer declarations (js/layer-manifest.js `dataLayers()` and each declaration's `registry`). A layer
 *  added tomorrow appears on the card by existing (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
 *  ⚠ A HOLE IS SAID, NOT HIDDEN. Every section carries a status — `ok`, `none` (the source was asked and
 *  holds nothing there: open sea has no country) or `unavailable` (the source could not be asked or did
 *  not answer, with the reason). A layer that is on and cannot be read at a point is a row saying so, not
 *  a missing row, because a missing row reads as 「そこには何も無かった」
 *  ([[intmap-data-must-not-claim-an-author-it-lacks]], .agents/rules/one-pass-or-a-reason.md §5:
 *  「could not observe」 is not 「failed」).
 *  ⚠ THE CARD READS THE SAME OBJECT ATLAS IS HANDED. `placeProfile()` builds one plain, JSON-safe record;
 *  `profileHtml()` and the card render it, and Atlas receives it as the call's `exec` — so what the reader
 *  sees and what Atlas can quote cannot drift apart ([[intmap-two-readers-one-field-list]]).
 *
 *  Strings IntMap writes here are en + jp (CONSTITUTION.md §7). The CSS lives in css/intmap.css (.pd-*);
 *  the card is a `.country-popup`, so it inherits the detail-card look, its drag and its phone sheet.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { icon } from './icons.js';   /* (icon-system) the one icon set — js/icons.js */
import { NominatimGate } from './nominatim-gate.js';
import { jsonWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';
import { dataLayers } from './layer-manifest.js';
import { MAP_ANSWER_EVENT } from './mobile-sheet.js';
import { worldObjects, RELATED_DEFAULTS } from './atlas-world-objects.js';   /* (world-objects) the card's «Related» section reads the same index Atlas does */
const WO = worldObjects;   /* the one session index (js/atlas-world-objects.js) */
import * as bus from './bus.js';   /* the declared events (js/bus.js) — MAP_ANSWER_EVENT is raised through it */

const esc = (s) => { try { return window.IntMapSafe.html(s == null ? '' : String(s)); } catch (_) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';'); } };
const finite = (v) => typeof v === 'number' && isFinite(v);
/* why nothing arrived, in the vocabulary js/fetch-deadline.js throws with ('timeout' | 'network' | 'http' | 'parse' | 'aborted') */
const reasonOf = (e) => (e && e.reason) ? String(e.reason) : 'network';

/* ── the name and the administrative chain ─────────────────────────────────────────────────────── */
/* Nominatim reverse at zoom 14 (neighbourhood): the `address` object it returns is ordered from the
   most specific unit to the country, which IS the chain — no table of which key is which level. The
   ISO 3166-2 keys and the two-letter country code are identifiers rather than names, so they travel as
   fields and are not shown as links of the chain. `licence` is the upstream's own sentence, carried. */
async function placeName(pt, lang) {
  const url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language='
    + encodeURIComponent(IntMapLang.locale(lang, 'en')) + '&lat=' + (+pt.lat).toFixed(6) + '&lon=' + (+pt.lng).toFixed(6);
  try {
    await NominatimGate.nominatimSlot();   /* queues: a dossier is worth waiting a second for (js/nominatim-gate.js) */
    const j = await jsonWithin(url, clockFor(url), { headers: { Accept: 'application/json' } });
    const source = { publisher: 'OpenStreetMap contributors (Nominatim)', licence: (j && j.licence) || null };
    if (!j || j.error || !j.address) return { status: 'none', reason: 'no-named-area', source };
    const a = j.address, chain = [], ids = {};
    Object.keys(a).forEach((k) => {
      const v = a[k]; if (v == null || v === '') return;
      if (/^ISO3166/i.test(k) || k === 'country_code') { ids[k] = String(v); return; }
      if (k === 'postcode') return;
      if (!chain.some((c) => c.name === String(v))) chain.push({ key: k, name: String(v) });
    });
    return { status: 'ok', name: (j.name && String(j.name)) || (chain[0] && chain[0].name) || null, chain,
      postcode: a.postcode || null, countryCode: a.country_code ? String(a.country_code).toUpperCase() : null, ids,
      osm: (j.osm_type && j.osm_id != null) ? (String(j.osm_type) + '/' + j.osm_id) : null, source };
  } catch (e) {
    return { status: 'unavailable', reason: reasonOf(e), source: { publisher: 'OpenStreetMap contributors (Nominatim)' } };
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
  /* the statistics are read from the metric set the CALLER holds, with the caller's formatter — the set
     and the one place that knows each metric's unit are Atlas's (js/atlas-metrics.js, js/atlas-console.js
     fmtVal); nothing here restates either */
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
/* the DEM tile under the point is asked for with the elevation registration's OWN zoom (demElevAt with no
   zoom argument is exactly what js/map-ui.js `elevation.measure` calls), so the value read afterwards is
   the one that registration answers; the callback fires when the tile lands. A tile that never lands is a
   row with no value — said as such below. */
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
    /* the elevation registration is always on (js/map-ui.js `on:()=>true`): it is the point's elevation,
       not a layer the reader chose, so it heads the card and is not repeated among the layers */
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
  /* panel rows that are switched on and register NO reading at all — found from the declarations. A row is
     answered for when its declaration names a registered id (`registry`), or by the register's OWN convention
     for a row that names none: js/map-ui.js isOn(id) reads the checkbox `dl-`+id or id, so the checkbox
     `dl-climate` belongs to the registration `climate` (the same bridge Atlas's layerDoor reads backwards).
     ⚠ WHAT IS SAID IS EXACTLY WHAT IS KNOWN: the declaration names no reader. A row whose values another
     registration reads in aggregate without declaring so (a country fill is read inside the country
     choropleth row) is still listed — the reason says «declares no point reader», not «has no value». */
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

/* ── local time and the sun ───────────────────────────────────────────────────────────────────── */
async function timeAndSun(pt) {
  const W = window.IntMapWx, out = { status: 'ok', timeZone: null, utcOffsetSeconds: null, zoneSource: null, sun: null };
  try {
    const s = W && typeof W.sunTimes === 'function' ? W.sunTimes(+pt.lat, +pt.lng) : null;
    if (s) out.sun = { sunrise: s.sunrise ? s.sunrise.toISOString() : null, sunset: s.sunset ? s.sunset.toISOString() : null,
      transit: s.transit ? s.transit.toISOString() : null, daylightSeconds: finite(s.daylightSec) ? Math.round(s.daylightSec) : null,
      polar: s.polar || null, source: { publisher: 'IntMap', method: 'sunrise equation (js/wx-source.js sunTimes)' } };
  } catch (_) { /* answered as unavailable below */ }
  if (!out.sun) out.sunWhy = 'sun-model-not-loaded';
  try {
    const j = W && typeof W.point === 'function' ? await W.point(+pt.lat, +pt.lng) : null;
    if (j && j.timezone && finite(j.utc_offset_seconds)) {
      out.timeZone = String(j.timezone); out.utcOffsetSeconds = j.utc_offset_seconds;
      out.zoneSource = { publisher: String(j._src || 'Open-Meteo') };
    } else out.zoneWhy = j ? ('zone-not-stated-by:' + String(j._src || j.source || 'weather-source')) : 'weather-source-unreachable';
  } catch (_) { out.zoneWhy = 'weather-source-unreachable'; }
  if (!out.sun && !out.timeZone) out.status = 'unavailable';
  return out;
}

/**
 * placeProfile({lng,lat,name?}, HOST, opts?) → the dossier as ONE plain record (JSON-safe).
 *   opts.onSection(name, section)  called as each section settles — the card renders progressively
 *   opts.ensureCountries()         how to make sure the country shapes are loaded (Atlas: K.ensureData)
 *   opts.metrics / label / format  a country metric set { key: {label, get} }, its label reader and its
 *                                  formatter — given by Atlas; the card leaves statistics to the country card
 */
export async function placeProfile(pt, HOST, opts) {
  opts = opts || {};
  const lng = +pt.lng, lat = +pt.lat;
  if (!finite(lng) || !finite(lat)) throw new Error('placeProfile: no point');
  const tell = (k, v) => { try { if (typeof opts.onSection === 'function') opts.onSection(k, v); } catch (_) { /* a renderer's failure is not the profile's */ } return v; };
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  let coordText = null; try { coordText = HOST.fmtLL(lng, lat); } catch (_) { coordText = lat.toFixed(5) + ', ' + lng.toFixed(5); }
  const out = { at: { lng, lat, text: coordText }, asked: String(pt.name || '') || null, asOf: new Date().toISOString() };
  const [place, country, layers, time] = await Promise.all([
    placeName({ lng, lat }, lang).then((v) => tell('place', v)),
    countryAt({ lng, lat }, HOST, opts).then((v) => tell('country', v)),
    layerReadings({ lng, lat }, HOST).then((v) => tell('layers', v)),
    timeAndSun({ lng, lat }).then((v) => tell('time', v)),
  ]);
  out.place = place; out.country = country; out.time = time;
  out.elevation = layers.elevation || { status: 'unavailable', reason: layers.reason || 'no-elevation-registration' };
  out.layers = { status: layers.status, reason: layers.reason || null, rows: layers.rows };
  return out;
}

/* ── rendering — the card and Atlas's bubble draw the same record through these ─────────────────── */
function words(HOST) {
  const L = IntMapLang.pick(() => { try { return HOST.lang; } catch (_) { return 'en'; } });
  /* the reason codes the gatherers above write, said to a reader */
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
    'sun-model-not-loaded': L('the sun model has not loaded', '日の出入りの計算が読み込まれていません'),
    'weather-source-unreachable': L('the time-zone source could not be reached', 'タイムゾーンの取得先に到達できませんでした'),
  };
  const why = (code) => {
    const c = String(code || '');
    if (c.indexOf('zone-not-stated-by:') === 0) return L('the source that answered (' + c.slice(19) + ') states no time zone', '応答した取得先（' + c.slice(19) + '）はタイムゾーンを示していません');
    return WHY[c] || c;
  };
  return { L, why };
}
function clock(iso, tz, lang) {
  if (!iso) return null;
  try { return new Intl.DateTimeFormat(IntMapLang.locale(lang, 'en'), Object.assign({ hour: '2-digit', minute: '2-digit' }, tz ? { timeZone: tz } : { timeZone: 'UTC' })).format(new Date(iso)); } catch (_) { return null; }
}
function offsetText(sec) {
  if (!finite(sec)) return '';
  const s = sec < 0 ? '−' : '+', a = Math.abs(sec), h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  return 'UTC' + s + h + (m ? ':' + String(m).padStart(2, '0') : '');
}

/** the record as HTML — the card's body, and Atlas's bubble */
export function profileHtml(p, HOST, opts) {
  opts = opts || {};
  const { L, why } = words(HOST);
  let lang = 'en'; try { lang = HOST.lang || 'en'; } catch (_) { lang = 'en'; }
  const wait = '<span class="pd-why" data-pending>' + esc(L('Reading…', '読み込み中…')) + '</span>';
  const row = (k, vHtml, meta) => '<div class="acp-row"><span class="acp-k">' + esc(k) + '</span><span class="acp-v">' + vHtml + (meta ? '<span class="pd-meta">' + esc(meta) + '</span>' : '') + '</span></div>';
  const hole = (code) => '<span class="pd-why">' + esc(why(code)) + '</span>';
  const sec = (title, body) => body ? '<div class="acp-sec">' + esc(title) + '</div>' + body : '';
  let h = '';
  /* ── the point ── */
  const pl = p.place;
  if (opts.withChain !== false) {
    if (!pl) h += '<div class="pd-sub">' + wait + '</div>';
    else if (pl.status === 'ok' && pl.chain && pl.chain.length) h += '<div class="pd-sub">' + esc(pl.chain.map((c) => c.name).join(' · ')) + '</div>';
    else h += '<div class="pd-sub">' + hole(pl.reason) + '</div>';
  }
  let here = row(L('Coordinates', '座標'), esc(p.at.text));
  const el = p.elevation;
  if (!el) here += row(L('Elevation', '標高'), wait);
  else if (el.status === 'ok' && finite(el.value)) {
    let t = el.text; try { t = HOST.fmtElevVal(Math.abs(el.value)); } catch (_) { /* the registration's own text */ }
    here += row(el.value < 0 ? L('Sea depth', '水深') : L('Elevation', '標高'), esc(t), el.source || null);
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
  const t = p.time;
  let tb = '';
  if (!t) tb = row(L('Local time', '現地時刻'), wait);
  else {
    if (t.timeZone) tb += row(L('Local time', '現地時刻'), esc(clock(new Date().toISOString(), t.timeZone, lang) || '—'), t.timeZone + ' · ' + offsetText(t.utcOffsetSeconds));
    else tb += row(L('Local time', '現地時刻'), hole(t.zoneWhy));
    const s = t.sun, tz = t.timeZone, zl = tz ? '' : ' UTC';
    if (s && s.polar === 'day') tb += row(L('Sun', '太陽'), esc(L('Above the horizon all day', '一日中沈みません')));
    else if (s && s.polar === 'night') tb += row(L('Sun', '太陽'), esc(L('Below the horizon all day', '一日中昇りません')));
    else if (s) {
      tb += row(L('Sunrise', '日の出'), esc((clock(s.sunrise, tz, lang) || '—') + zl));
      tb += row(L('Sunset', '日の入り'), esc((clock(s.sunset, tz, lang) || '—') + zl));
    } else tb += row(L('Sunrise / sunset', '日の出・日の入り'), hole(t.sunWhy));
    if (s && finite(s.daylightSeconds)) { const hh = Math.floor(s.daylightSeconds / 3600), mm = Math.round((s.daylightSeconds % 3600) / 60); tb += row(L('Daylight', '昼の長さ'), esc(hh + L(' h ', '時間') + mm + L(' min', '分'))); }
  }
  h += sec(L('Time and sun', '時刻と太陽'), tb);
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
  /* ── who said it ── */
  const credits = [];
  const add = (x) => { if (x && credits.indexOf(x) < 0) credits.push(x); };
  if (pl && pl.source) add(pl.source.publisher + (pl.source.licence ? ' — ' + pl.source.licence : ''));
  if (c && c.source) add(c.source.publisher);
  if (t && t.zoneSource) add(t.zoneSource.publisher + ' (' + L('time zone', 'タイムゾーン') + ')');
  if (t && t.sun) add(L('Sunrise and sunset computed by IntMap', '日の出・日の入りは IntMap の計算'));
  if (credits.length) h += '<div class="acp-src">' + esc(L('Sources: ', '出典: ') + credits.join(' · ')) + '</div>';
  return h;
}

/* ── the card ──────────────────────────────────────────────────────────────────────────────────── */
/** (keyboard-and-offline) the SAME record as plain sentences, for a screen reader — js/map-reader.js speaks it.
    Nothing is gathered here and nothing is decided: every clause is a field of the record `placeProfile` built,
    and a section the source could not answer says so in the words the card uses (a hole is said, not hidden).
    ⚠ The card (profileHtml) and this read ONE object, so what is heard and what is seen cannot drift apart. */
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

let card = null, seq = 0, current = null;
function ensureCard(HOST) {
  if (card && document.body.contains(card)) return card;
  const { L } = words(HOST);
  card = document.createElement('div');
  card.className = 'country-popup pd-popup'; card.id = 'pd-popup';
  card.setAttribute('role', 'dialog');
  card.innerHTML = '<button class="country-popup-close" id="pd-close" type="button"></button>'
    + '<div class="country-popup-header"><h3 id="pd-title"></h3></div><div id="pd-body"></div>'
    + '<div class="pd-actions"><button type="button" class="primary" data-pd="country"></button><button type="button" data-pd="related"></button><button type="button" data-pd="atlas"></button></div><div id="pd-related" class="pd-related" hidden></div>'
    + '<button type="button" class="pd-correct" data-pd="correct"></button>';
  (document.getElementById('map-container') || document.body).appendChild(card);
  const x = card.querySelector('#pd-close'); x.textContent = '×'; x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
  x.addEventListener('click', () => closePlaceDossier());
  try { HOST.makeDraggable(card, card.querySelector('.country-popup-header')); } catch (_) { /* a fixed card still reads */ }
  card.addEventListener('mousedown', () => { try { HOST.bringToFront(card); } catch (_) { /* order is cosmetic */ } });
  card.addEventListener('click', (ev) => {
    const b = ev.target && ev.target.closest ? ev.target.closest('[data-pd]') : null; if (!b || !current) return;
    if (b.dataset.pd === 'country') { const c = current.country; if (c && c.status === 'ok') { try { HOST.showCountryDetail(c.code, c.name); } catch (_) { /* the country card is the app's */ } } }
    else if (b.dataset.pd === 'related') showRelated(HOST);
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
/* (world-objects) «Related» — the point this card is about, as a real-world object, and what the session holds that belongs
   with it: the facilities and quakes an Atlas impact analysis surfaced, plus the articles and events in the news now loaded.
   The rule and the rendering are js/atlas-world-objects.js's — the same ones research.related answers with. */
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
  const p = current, pl = p.place;
  const title = (pl && pl.status === 'ok' && pl.name) ? pl.name : (p.asked || p.at.text);
  card.querySelector('#pd-title').innerHTML = icon('pin') + ' ' + esc(title);
  card.querySelector('#pd-body').innerHTML = profileHtml(p, HOST);
  const cb = card.querySelector('[data-pd="country"]'), ab = card.querySelector('[data-pd="atlas"]'), rb = card.querySelector('[data-pd="related"]');
  rb.innerHTML = icon('target') + ' ' + esc(L('Related to this point', 'この地点に関連')); const rbox = card.querySelector('#pd-related'); if (rbox && rbox.dataset.at !== p.at.text) { rbox.hidden = true; rbox.innerHTML = ''; }   /* a new point clears the section; a section filling in does not */
  cb.innerHTML = icon('flag') + ' ' + esc(L('Country statistics', '国の統計'));
  cb.disabled = !(p.country && p.country.status === 'ok');
  ab.innerHTML = icon('chat') + ' ' + esc(L('Ask Atlas', 'Atlasに聞く'));
  const xb = card.querySelector('[data-pd="correct"]'); if (xb) xb.innerHTML = icon('flag') + ' ' + esc(L('Something here is wrong? Report it', 'ここの地図に誤りがありますか？ 報告する'));
  ab.style.display = window.IntMapAtlas ? '' : 'none';   /* no Atlas in this build → no door to it */
}
function placeCard() {
  const mc = document.getElementById('map-container'); if (!card || !mc) return;
  if (card.dataset.placed === '1') return; card.dataset.placed = '1';   /* first open only — then where the reader dragged it */
  const r = mc.getBoundingClientRect();
  card.style.left = Math.max(12, r.width - card.offsetWidth - 24) + 'px';
  card.style.top = '84px';
}

/** open the card on a point; the sections fill in as they arrive. Returns the finished record. */
export async function openPlaceDossier(HOST, pt) {
  const lng = +(pt && pt.lng), lat = +(pt && pt.lat);
  if (!finite(lng) || !finite(lat)) return null;
  const my = ++seq;
  ensureCard(HOST);
  let coordText = null; try { coordText = HOST.fmtLL(lng, lat); } catch (_) { coordText = lat.toFixed(5) + ', ' + lng.toFixed(5); }
  current = { at: { lng, lat, text: coordText }, asked: (pt && pt.name) ? String(pt.name) : null, place: null, country: null, elevation: null, layers: null, time: null };
  card.style.display = 'block';
  paintCard(HOST); placeCard();
  try { HOST.bringToFront(card); } catch (_) { /* order is cosmetic */ }
  /* (mobile-shell-flow) the card IS the answer and it is on the map — the phone's sheet comes down to show it */
  try { bus.emit(MAP_ANSWER_EVENT, { kind: 'card' }); } catch (_) { /* no sheet */ }
  const done = await placeProfile({ lng, lat, name: pt.name }, HOST, {
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
function closePlaceDossier() { seq++; current = null; if (card) card.style.display = 'none'; }
