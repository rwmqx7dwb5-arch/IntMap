/* ============================================================================
 *  IntMap · js/layer-pkg-histurban.js — LAYER PACKAGE: historical city populations (dl-histurban)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of the row whose declaration says `pkg: 'histurban'`
 *  (js/layers/dl-histurban.js). What a city shows in a year is NOT decided here: js/hist-urban.js
 *  (`activeAt` / `stateAt` / `historyOf`) is the one place the display rule lives, and this file draws what
 *  it answers. The record is data/hist-urban.json — Reba, Reitsma & Seto (2016), the geocoded tables of
 *  Chandler and Modelski, CC BY 4.0.
 *
 *  WHAT IS DRAWN, for the clock's year T (astronomical; nothing at the live clock):
 *    · one CIRCLE per stated figure at the city's point — area ∝ population; where both books state the same
 *      year there are two concentric circles, neither chosen over the other. Its fill fades with the figure's
 *      age inside its window (the years the record does not state anything newer for cities of that listing).
 *    · one LABEL per city: the name (« ?» when the geocoders' rank of the point is 2 or 3), then the stated
 *      figure(s) and the year they were STATED — never the clock's year.
 *  A city whose name the map already writes (a Pleiades place of js/hist-places.js, or the base map's city label
 *  renamed by js/hist-cities.js) shows only the figure: the name is there already. Both are asked by IDENTITY
 *  (`pl` / `hc` of the record), never by spelling.
 *
 *  ⚠ LAZY: nothing is fetched or drawn until the row is switched on (`on`), and `off` removes everything it added.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { activeAt, historyOf, loadRecord, namesOf } from './hist-urban.js';
import { readWithin } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function histurbanPackage(K) {
  const { GE, HOST, opacities } = K;
  const CIRCLES = 'imhu-circles', LABELS = 'imhu-labels', SRC_C = 'imhu-circles-src', SRC_L = 'imhu-labels-src', CITY = 'ofm-city';
  const empty = () => ({ type: 'FeatureCollection', features: [] });
  const text = (/** @type {string} */ en, /** @type {string} */ jp) => IntMapLang.t(HOST.lang, en, jp);
  const escape = (/** @type {any} */ v) => window.IntMapSafe.html(String(v == null ? '' : v));
  const HS = () => window.IntMapHistScale;
  const tag = () => IntMapLang.htmlTag(HOST.lang);

  /** @type {any} */ let data = null;
  let pending = null, enabled = false, painting = false, key = '', published = '', popup = null;
  let opacity = typeof opacities.histurban === 'number' ? opacities.histurban : 0.85;
  /** @type {(() => void)[]} */ let stops = [];
  let fcCircles = empty(), fcLabels = empty();
  /** @type {Map<string, any>} */ const byId = new Map();

  function when() {
    if (!enabled) return null;
    return !IntMapTime.isLive() ? IntMapTime.when() : null;
  }
  /** the places the map already names at this moment, by identity (js/hist-places.js) */
  function placeIds() {
    const out = new Set();
    try { const fc = window.IntMapHistPlaces && window.IntMapHistPlaces.currentFC(); for (const f of (fc && fc.features) || []) out.add(f.id != null ? f.id : f.properties && f.properties.id); } catch (_) { /* no places layer: nothing is named there */ }
    return out;
  }
  function close() { if (popup) popup.remove(); popup = null; }

  /* ⚠ `name` is on every feature because the shared place reader (js/map-ui.js onLabel) hands a tap to a reader only when the
     feature has one — the same property js/hist-places.js carries. */
  function build(/** @type {number} */ year) {
    const nf = new Intl.NumberFormat(tag());
    const named = placeIds();
    const circles = [], labels = [];
    for (const { city, state } of activeAt(data, year)) {
      const w = data.window[state.year];
      const age = Number.isFinite(w) && w > 0 ? Math.min(0.999, Math.max(0, (year - state.year) / w)) : 0;
      for (const f of state.figures) {
        circles.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [city.lon, city.lat] }, properties: { id: city.id, name: city.n, p: f.population, age } });
      }
      const doubtful = state.figures.some(f => f.certainty >= 2);
      /* the name is already on the map: a Pleiades place of this city, or the base map's city label (hist-cities) */
      const nameShown = (city.pl && named.has(city.pl)) || !!city.hc;
      const figs = state.figures.map(f => nf.format(f.population)).join(' / ') + ' (' + HS().yearText(state.year, tag()) + ')';
      const top = Math.max(...state.figures.map(f => f.population));
      labels.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [city.lon, city.lat] },
        properties: { id: city.id, name: city.n, text: nameShown ? figs : city.n + (doubtful ? ' ?' : '') + '\n' + figs, sort: -top } });
    }
    return { circles: { type: 'FeatureCollection', features: circles }, labels: { type: 'FeatureCollection', features: labels }, named: named.size };
  }

  /* area ∝ population: radius = k(zoom)·√p, k read at the zoom (an interpolate must be the expression's root, so the
     stops carry the product). Observation 2026-10-04 (a satellite base, z4.2): k = 0.012 left a 125 k city a barely visible 4 px dot, so k(z4) = 0.03 — 3.8 M ≈ 58 px, 125 k ≈ 10 px, 30 k ≈ 5 px. Lapses if the base map's land colour changes. */
  const radius = () => ['interpolate', ['linear'], ['zoom'], ...[[1, 0.01], [4, 0.03], [8, 0.07], [12, 0.18]].flatMap(([z, k]) => [z, ['max', 1.5, ['*', ['sqrt', ['get', 'p']], k]]])];
  const fade = ['-', 1, ['*', 0.6, ['get', 'age']]];
  const circlePaint = () => ({
    'circle-radius': radius(), 'circle-pitch-alignment': 'map',
    'circle-color': '#e8590c', 'circle-opacity': ['*', 0.6 * opacity, fade],
    'circle-stroke-color': '#7a2e0a', 'circle-stroke-width': 0.8, 'circle-stroke-opacity': ['*', opacity, fade],
  });

  /* Copy values, not policy: the city label's own typography is the reference (as js/hist-places.js). */
  function apply() {
    if (painting) return;
    painting = true;
    try {
      const date = when();
      const next = date ? [date.getUTCFullYear(), HOST.lang].join('|') : '';
      if (popup && (!date || next !== key)) close();
      const drawable = HOST.canDraw ? HOST.canDraw() : GE().ready();
      if (!drawable) return;
      if (!date || !data) { remove(); key = ''; published = ''; return; }
      if (!GE().layers.has(CITY)) return;
      const built = build(date.getUTCFullYear());
      const stamp = next + '|' + built.named;
      if (stamp !== published || !GE().layers.hasSource(SRC_L)) { fcCircles = built.circles; fcLabels = built.labels; }
      key = next;
      const fresh = !GE().layers.hasSource(SRC_C);
      if (fresh) {
        GE().layers.addSource(SRC_C, { type: 'geojson', data: fcCircles, attribution: 'Reba, Reitsma & Seto (2016), CC BY 4.0' });
        GE().layers.addSource(SRC_L, { type: 'geojson', data: fcLabels });
      } else if (stamp !== published) { GE().layers.setSourceData(SRC_C, fcCircles); GE().layers.setSourceData(SRC_L, fcLabels); }
      published = stamp;
      if (!GE().layers.has(CIRCLES)) GE().layers.add({ id: CIRCLES, type: 'circle', source: SRC_C, layout: { 'circle-sort-key': ['*', -1, ['get', 'p']] }, paint: circlePaint() }, CITY);
      const layout = { visibility: 'visible', 'text-field': ['get', 'text'], 'symbol-sort-key': ['get', 'sort'],
        'text-font': window.IntMapMapTypography.readerFont(), 'text-size': window.IntMapLabelScale.place('city'), 'text-optional': true };
      for (const prop of ['text-max-width', 'text-variable-anchor', 'text-radial-offset', 'text-justify', 'text-padding']) {
        const v = GE().layers.getLayout(CITY, prop);
        if (v !== undefined) layout[prop] = v;
      }
      const paint = { 'text-opacity': opacity };
      for (const prop of ['text-color', 'text-halo-color', 'text-halo-width']) {
        const v = GE().layers.getPaint(CITY, prop);
        if (v !== undefined) paint[prop] = v;
      }
      if (!GE().layers.has(LABELS)) {
        GE().layers.add({ id: LABELS, source: SRC_L, type: 'symbol', layout, paint }, CITY);
      } else {
        for (const [p, v] of Object.entries(layout)) if (JSON.stringify(GE().layers.getLayout(LABELS, p)) !== JSON.stringify(v)) GE().layers.setLayout(LABELS, p, v);
        for (const [p, v] of Object.entries(paint)) if (JSON.stringify(GE().layers.getPaint(LABELS, p)) !== JSON.stringify(v)) GE().layers.setPaint(LABELS, p, v);
      }
    } finally { painting = false; }
  }
  function remove() {
    close();
    for (const id of [LABELS, CIRCLES]) { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { /* gone with the style */ } }
    for (const id of [SRC_L, SRC_C]) { try { if (GE().layers.hasSource(id)) GE().layers.removeSource(id); } catch (_) { /* gone with the style */ } }
  }

  /* ── the card ─────────────────────────────────────────────────────────────────────────────── */
  function card(/** @type {any} */ city, /** @type {number} */ year, /** @type {any} */ state) {
    const t = tag(), yt = (/** @type {number} */ y) => HS().yearText(y, t);
    const nf = new Intl.NumberFormat(t);
    const countries = [...new Set(city.r.map((/** @type {any} */ r) => r.c).filter(Boolean))].join(', ');
    const hist = historyOf(data, city);
    const shown = (/** @type {any} */ h) => state && h.year === state.year;
    const rows = hist.map((/** @type {any} */ h) => '<tr' + (shown(h) ? ' style="background:rgba(194,118,58,.22);font-weight:600"' : '') + '><td>' + escape(yt(h.year)) + '</td><td style="text-align:right">'
      + escape(nf.format(h.population)) + '</td><td>' + escape(h.label) + '</td><td style="text-align:center">' + escape(h.certainty) + '</td></tr>').join('');
    const W = state ? data.window[state.year] : null;
    const shownLine = state ? text(
      'Shown for ' + yt(year) + ': the figure stated for ' + yt(state.year) + '. Around ' + yt(state.year)
        + ' the record states a city again after a median of ' + W + ' years, so this figure is shown until ' + yt(state.until - 1) + '; nothing is interpolated.',
      yt(year) + ' に表示: ' + yt(state.year) + ' に述べられた数値です。' + yt(state.year) + ' ごろ、この記録が同じ都市を次に述べるまでの中央値は ' + W
        + ' 年なので、この数値は ' + yt(state.until - 1) + ' まで表示されます（補間はしていません）。') : '';
    const tables = [...new Set(hist.map((/** @type {any} */ h) => h.table))].map(k => data.tables.find((/** @type {any} */ x) => x.key === k)).filter(Boolean);
    const thresholds = tables.map((/** @type {any} */ x) => '<p style="font-size:11px;color:var(--text-muted);margin:4px 0"><b>' + escape(x.label) + '</b>: ' + escape(text(x.threshold[0], x.threshold[1])) + '</p>').join('');
    const same = (city.same || []).map((/** @type {string} */ id) => byId.get(id)).filter(Boolean).map((/** @type {any} */ c) => c.n);
    const note = (/** @type {string} */ s) => '<p style="font-size:11px;color:var(--text-muted);margin:6px 0">' + escape(s) + '</p>';
    const s = data.source;
    return '<div style="min-width:240px;max-width:320px;padding-right:20px"><strong>' + escape(city.n) + '</strong>'
      + '<div style="color:var(--text-muted)">' + escape(namesOf(city).join(' · ')) + (countries ? ' — ' + escape(countries) : '') + '</div>'
      + (shownLine ? note(shownLine) : '')
      + '<div style="max-height:34vh;overflow:auto"><table style="border-collapse:collapse;width:100%;font-size:12px"><thead><tr style="color:var(--text-muted);text-align:left"><th>' + escape(text('Year', '年')) + '</th><th style="text-align:right">'
      + escape(text('Population', '人口')) + '</th><th>' + escape(text('Book', '典拠')) + '</th><th>' + escape(text('Location', '位置')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + note(text('Location certainty is the geocoders’ rank: 1 = the point was confirmed by three sources, 2 = by two, 3 = least certain. It rates the point, not the population figure.',
        '位置の確度はジオコーダーによる順位です: 1 = 3 つの情報源で地点を確認、2 = 2 つで確認、3 = 最も不確か。評価するのは地点であって、人口の数値ではありません。'))
      + thresholds
      + note(text('A city absent from a table is “not listed” there, which is not the same as “did not exist”.', 'ある表に都市が載っていないことは「収録されていない」という意味で、「存在しなかった」という意味ではありません。'))
      + (same.length ? note(text('Same coordinates as ' + same.join(', ') + ' in this dataset — the point may be that place’s geocode.', 'このデータセットでは ' + same.join('、') + ' と同じ座標です。地点はその場所のジオコードかもしれません。')) : '')
      + '<div style="font-size:10px;margin-top:6px">' + escape(s.publisher) + ' · <a href="' + escape(s.url) + '" target="_blank" rel="noopener noreferrer">' + escape(text('Source', '出典')) + '</a> · '
      + '<a href="' + escape(s.licenceUrl) + '" target="_blank" rel="noopener noreferrer">' + escape(s.licence) + '</a></div></div>';
  }
  function open(/** @type {any} */ id, /** @type {any} */ at) {
    const date = when(), city = byId.get(id);
    if (!data || !city || !date) return false;
    const year = date.getUTCFullYear();
    const state = (activeAt(data, year).find(e => e.city === city) || {}).state || null;
    let lng = city.lon;
    if (at && Number.isFinite(at.lng)) { while (lng - at.lng > 180) lng -= 360; while (lng - at.lng < -180) lng += 360; }
    close();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '340px', className: 'plc-popup' })
      .setLngLat({ lng, lat: city.lat }).setHTML(card(city, year, state)));
    return !!popup;
  }

  /* (layer-packages ⑥) the switch returns its request, pending until the renderer can draw: the readers, the listeners
     and the record's fetch all wait for it, so nothing is registered, fetched or drawn before the row can show */
  function on() {
    if (enabled) return pending;
    enabled = true;
    pending = K.whenStyleReady().then(() => {
      if (!enabled) return undefined;
      const fromFeature = (/** @type {any} */ f, /** @type {any} */ e) => open(f && f.properties && f.properties.id, e && e.lngLat);
      for (const id of [LABELS, CIRCLES]) stops.push(window.IntMapPlaceReaders.register(id, { open: fromFeature, close }));
      stops.push(IntMapTime.on(apply), bus.on('intmap-lang', apply));
      GE().events.on('styledata', apply); GE().events.on('load', apply);
      stops.push(() => { GE().events.off('styledata', apply); GE().events.off('load', apply); });
      return loadRecord(document.baseURI, { readWithin, clockFor }).then(d => {
        data = d;
        for (const c of d.cities) byId.set(c.id, c);
        if (enabled) apply();
      });
    }).catch(e => {
      console.warn('Historical urban populations could not load', e);
      try { layerState.report('dl-histurban', e); } catch (_) { /* the report is the row's own business */ }
      off();
    });
    return pending;
  }
  function off() {
    enabled = false; pending = null;
    for (const stop of stops.splice(0)) { try { stop(); } catch (_) { /* already detached */ } }
    remove();
    key = ''; published = '';
  }

  return { rows: { 'dl-histurban': {
    on, off,
    opacity: (/** @type {number} */ v) => {
      opacity = v;
      try {
        if (GE().layers.has(CIRCLES)) { const p = circlePaint(); for (const k of ['circle-opacity', 'circle-stroke-opacity']) GE().layers.setPaint(CIRCLES, k, p[k]); }
        if (GE().layers.has(LABELS)) GE().layers.setPaint(LABELS, 'text-opacity', v);
      } catch (_) { /* not drawn yet: `opacity` is read when it is */ }
    },
  } } };
}
