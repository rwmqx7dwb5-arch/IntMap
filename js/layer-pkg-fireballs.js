/* ============================================================================
 *  IntMap · js/layer-pkg-fireballs.js — LAYER PACKAGE: bright meteors / fireballs (dl-fireballs)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of the row whose declaration says `pkg: 'fireballs'`
 *  (js/layers/dl-fireballs.js): every fireball NASA/JPL CNEOS lists with a position, drawn where it was seen —
 *  the dot's size the radiated energy's logarithm, its colour the year — and the card a tap opens.
 *
 *  THE UPSTREAM (measured 2026-11-17): https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true&sort=-date answered
 *  200 application/json with NO Access-Control-Allow-Origin (an Origin of the Pages site was sent), so the page cannot
 *  read it and the app's own relay does (supabase/functions/_shared/fetch-relay-policy.js, rule `jpl-ssd-api`).
 *  888 events with a position (1,074 without the filter), 63,900 B in 0.93 s; the newest was 2026-10-04 and the oldest
 *  1988-04-15. The whole record is read once and the clock's instant filters it here — so scrubbing the clock costs
 *  no request, and the answer is kept for the session and not read again within REFRESH_MS.
 *    REFRESH_MS = 1 h — CNEOS adds events a few times a month (the newest of the 888 is five weeks old); lapses if it
 *    starts to publish in near real time.
 *  The sensors' record states each event's time (UTC), its position and — when available — altitude and speed, and
 *  two energies: the total radiated energy (units of 10^10 J) and the impact energy estimated from it (kt of TNT).
 *  A field the record leaves empty is shown as «not reported», never as zero.
 *
 *  WHAT THE LAYER SAYS ABOUT TIME. It is a dated record: the events up to the clock's instant are drawn and none after
 *  it (a future fireball is not a thing anyone can state); the legend picks how far back — the whole record, one
 *  year, 30 days. Before the first event of the record (the legend says which year) nothing is drawn and the row says
 *  «no data for this date». The row's `record` declaration (js/layer-time-decl.js) names `fireballsToFeatures` as where
 *  the instant is applied.
 *
 *  ⚠ LAZY: nothing is fetched or drawn until the row is switched on (`on`), and `off` removes everything it added.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { jsonWithin, untilObserved } from './fetch-deadline.js';
import { clockFor, ownRelayUrl } from './proxy-fetch.js';

const DAY = 86400000;
const REFRESH_MS = 3600000;
const ROW = 'dl-fireballs', SRC = 'imf-fireball-src', DOTS = 'imf-fireball-dots';
/** how far back from the instant the legend lets the reader draw: all of the record, a year, 30 days */
export const SPANS = Object.freeze({ all: null, '1y': 365 * DAY, '30d': 30 * DAY });
const FIREBALL_URL = 'https://ssd-api.jpl.nasa.gov/fireball.api?req-loc=true&sort=-date';

const num = (/** @type {any} */ v) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return v == null ? null : Number.isFinite(n) ? n : null; };

/** the fireball API's answer → [{ ts, lat, lon, energy, impact, alt, vel }], newest first. The columns are found by the
    NAMES the answer declares in `fields` (never by position); a row with no usable time or position is dropped. */
export function parseFireballs(/** @type {any} */ j) {
  const f = (j && Array.isArray(j.fields)) ? j.fields : [];
  const at = (/** @type {string} */ k) => f.indexOf(k);
  const ix = { date: at('date'), energy: at('energy'), impact: at('impact-e'), lat: at('lat'), latDir: at('lat-dir'), lon: at('lon'), lonDir: at('lon-dir'), alt: at('alt'), vel: at('vel') };
  if (ix.date < 0 || ix.lat < 0 || ix.latDir < 0 || ix.lon < 0 || ix.lonDir < 0) return [];
  const out = [];
  for (const r of (j && Array.isArray(j.data)) ? j.data : []) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(r[ix.date]));
    if (!m) continue;
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);   /* a year ≥ 1988 (the record), so Date.UTC's two-digit rule cannot apply */
    const la = num(r[ix.lat]), lo = num(r[ix.lon]);
    if (la == null || lo == null || (r[ix.latDir] !== 'N' && r[ix.latDir] !== 'S') || (r[ix.lonDir] !== 'E' && r[ix.lonDir] !== 'W')) continue;
    out.push({
      ts, lat: r[ix.latDir] === 'S' ? -la : la, lon: r[ix.lonDir] === 'W' ? -lo : lo,
      energy: ix.energy >= 0 ? num(r[ix.energy]) : null, impact: ix.impact >= 0 ? num(r[ix.impact]) : null,
      alt: ix.alt >= 0 ? num(r[ix.alt]) : null, vel: ix.vel >= 0 ? num(r[ix.vel]) : null,
    });
  }
  return out.sort((a, b) => b.ts - a.ts);
}

/** the events up to the instant (and no more than `span` ms before it), as a FeatureCollection — the ONE place the clock's
    instant is applied. `name` is on every feature (the shared place reader hands a tap on only when it has one);
    `e` is the impact energy in kt, `yr` the decimal UTC year. */
export function fireballsToFeatures(/** @type {any[]} */ events, /** @type {number} */ tMs, /** @type {number | null} */ span) {
  const feats = [];
  for (const ev of events || []) {
    if (ev.ts > tMs || (span != null && ev.ts < tMs - span)) continue;
    const y = new Date(ev.ts).getUTCFullYear(), y0 = Date.UTC(y, 0, 1), y1 = Date.UTC(y + 1, 0, 1);
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ev.lon, ev.lat] },
      properties: { id: String(ev.ts), name: new Date(ev.ts).toISOString().slice(0, 10), e: ev.impact == null ? 0.05 : ev.impact, yr: y + (ev.ts - y0) / (y1 - y0) } });
  }
  return { type: 'FeatureCollection', features: feats };
}

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function fireballsPackage(K) {
  const { GE, HOST, opacities, satToast } = K;
  const text = IntMapLang.pick(() => HOST.lang);
  const LA = IntMapLang.pickArgs();   /* the translation tuple builder, bound here so scripts/i18n-audit.mjs counts the row's name */
  const escape = (/** @type {any} */ v) => window.IntMapSafe.html(String(v == null ? '' : v));
  const tag = () => IntMapLang.htmlTag(HOST.lang);

  let enabled = false, pending = null, popup = null, legendEl = null, span = 'all';
  /** @type {any[] | null} */ let events = null;
  let readAt = 0, drawn = 0, lastFail = '';
  let opacity = typeof opacities.fireballs === 'number' ? opacities.fireballs : 0.85;
  /** @type {(() => void)[]} */ let stops = [];

  const instant = () => IntMapTime.nowMs();
  function close() { if (popup) popup.remove(); popup = null; }

  /* ── reading CNEOS, through the app's own relay: the host sends no ACAO, so a direct read is refused in every page ── */
  async function read() {
    const via = ownRelayUrl(FIREBALL_URL);
    if (!via) throw Object.assign(new Error('no relay'), { reason: 'network', url: FIREBALL_URL });
    const j = await untilObserved((scale) => jsonWithin(via, clockFor(FIREBALL_URL, 'relay') * scale, undefined, { idle: true }), { base: 1500, wanted: () => enabled });
    const list = parseFireballs(j);
    if (!list.length) throw Object.assign(new Error('no fireballs in the answer'), { reason: 'parse', status: 200, url: FIREBALL_URL });
    return list;
  }
  async function load() {
    if (events && Date.now() - readAt < REFRESH_MS) return events;
    events = await read(); readAt = Date.now();
    return events;
  }

  /* ── drawing ──────────────────────────────────────────────────────────────────────────────── */
  const range = () => { const ys = (events || []).map((e) => new Date(e.ts).getUTCFullYear()); return ys.length ? { lo: Math.min(...ys), hi: Math.max(...ys) + 1 } : { lo: 1988, hi: 2030 }; };
  /** the colour ramp is the record's own years, read from what was loaded — a year older or newer than any event is never a stop */
  const RAMP = ['#5e5ce6', '#ff375f', '#ff9f0a', '#ffd60a'];
  const ramp = () => { const { lo, hi } = range(), st = (hi - lo) / 3; return ['interpolate', ['linear'], ['get', 'yr'], ...RAMP.flatMap((c, i) => [lo + st * i, c])]; };
  /* radius in px = 2.5 + 2.4·log10(1 + 10·E), E the impact energy in kt: 0.1 kt → 3.2 px, 1 kt → 5.0, 10 kt → 7.3, the 441 kt of
     Chelyabinsk (2013) → 11.3. Observation 2026-11-17: the record's median is 0.2 kt and 95 % are under 5 kt, so a linear
     scale would draw the one big event and nothing else. Lapses if the sensors' range changes by orders of magnitude. */
  const radiusAt = (/** @type {number} */ k) => ['*', k, ['+', 2.5, ['*', 2.4, ['log10', ['+', 1, ['*', 10, ['get', 'e']]]]]]];
  const dotPaint = () => ({
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, radiusAt(0.7), 5, radiusAt(1), 9, radiusAt(1.6)],
    'circle-color': ramp(), 'circle-opacity': 0.8 * opacity,
    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.8, 'circle-stroke-opacity': opacity,
    'circle-pitch-alignment': 'map',
  });
  function ensure(/** @type {any} */ fc) {
    if (!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC, { type: 'geojson', data: fc, attribution: 'NASA/JPL CNEOS — Fireball Data API' });
    else GE().layers.setSourceData(SRC, fc);
    if (!GE().layers.has(DOTS)) GE().layers.add({ id: DOTS, type: 'circle', source: SRC, layout: { 'circle-sort-key': ['-', 0, ['get', 'e']] }, paint: dotPaint() });
    else { const p = dotPaint(); GE().layers.setPaint(DOTS, 'circle-color', p['circle-color']); }
  }
  function remove() {
    close();
    try { if (GE().layers.has(DOTS)) GE().layers.remove(DOTS); } catch (_) { /* gone with the style */ }
    try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) { /* gone with the style */ }
  }
  function draw() {
    if (!enabled || !events) return;
    const t = instant(), fc = fireballsToFeatures(events, t, /** @type {any} */ (SPANS)[span]);
    drawn = fc.features.length; lastFail = '';
    const drawable = HOST.canDraw ? HOST.canDraw() : GE().ready();
    if (drawable) { try { ensure(fc); } catch (e) { console.warn('fireballs draw', e); } }
    close();
    /* before the record begins the row says so, rather than showing an empty map as if it were an answer */
    const first = events.length ? events[events.length - 1].ts : 0;
    try { layerState.report(ROW, t < first ? 'nodata' : 'ok'); } catch (_) { /* the record is the row's own business */ }
    legend(t, first);
  }

  function fail(/** @type {any} */ e) {
    lastFail = text('NASA/JPL fireball data could not be loaded', 'NASA/JPL の火球データを取得できませんでした');
    try { satToast(lastFail); } catch (_) { /* a toast is the reader's cue, not the layer's state */ }
    try { layerState.report(ROW, e, { told: true }); } catch (_) { /* the record is the row's own business */ }
    legend(instant(), 0);
  }

  /* ── the legend (the shared generic legend box: title, opacity, drag, ×) ───────────────────── */
  function legend(/** @type {number} */ t, /** @type {number} */ first) {
    if (!legendEl) return;
    let body = legendEl.querySelector('.imf-legend');
    if (!body) { body = document.createElement('div'); body.className = 'imf-legend'; body.style.cssText = 'font-size:11px;line-height:1.5;margin-top:6px;'; const h = legendEl.querySelector('h4'); if (h) h.after(body); else legendEl.appendChild(body); }
    const { lo, hi } = range();
    const sel = '<select class="imf-span" aria-label="' + escape(text('Fireballs to show', '表示する火球の期間')) + '" style="padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,.25));background:var(--input-bg);color:var(--text-main);font-size:10.5px">'
      + [['all', text('Whole record', '全期間')], ['1y', text('Past year', '過去 1 年')], ['30d', text('Past 30 days', '過去 30 日')]]
        .map(([k, v]) => '<option value="' + escape(k) + '"' + (k === span ? ' selected' : '') + '>' + escape(v) + '</option>').join('') + '</select>';
    const lines = [
      '<label style="display:flex;align-items:center;gap:6px">' + escape(text('Show', '表示')) + ' ' + sel + '</label>',
      '<div style="margin-top:6px;height:8px;border-radius:4px;background:linear-gradient(90deg,' + escape(RAMP.join(',')) + ')"></div>',
      '<div style="display:flex;justify-content:space-between;color:var(--text-muted)"><span>' + escape(lo) + '</span><span>' + escape(text('colour: year', '色: 年')) + '</span><span>' + escape(hi - 1) + '</span></div>',
      '<div style="color:var(--text-muted)">' + escape(text('Size: logarithm of the impact energy (kt of TNT).', '大きさ: 衝突エネルギー（TNT換算 kt）の対数。')) + '</div>',
    ];
    if (events) {
      if (t < first) lines.push('<div style="margin-top:4px">' + escape(text('The record begins in ' + new Date(first).getUTCFullYear() + '; nothing is stated before it.', 'この記録は ' + new Date(first).getUTCFullYear() + ' 年に始まります。それ以前は何も述べられていません。')) + '</div>');
      else lines.push('<div style="margin-top:4px">' + escape(text(drawn + ' of ' + events.length + ' fireballs up to the clock', '時計の時点までの火球 ' + events.length + ' 件のうち ' + drawn + ' 件')) + '</div>');
    } else if (!lastFail) lines.push('<div style="margin-top:4px;color:var(--text-muted)">' + escape(text('Loading fireballs…', '火球を読み込み中…')) + '</div>');
    if (lastFail) lines.push('<div style="margin-top:4px;color:#ff453a">' + escape(lastFail) + '</div>');
    lines.push('<div style="font-size:10px;margin-top:4px;color:var(--text-muted)">NASA/JPL CNEOS</div>');
    body.innerHTML = lines.join('');
    const s = body.querySelector('.imf-span');
    if (s) s.addEventListener('change', () => { span = /** @type {any} */ (s).value; draw(); });
  }

  /* ── the card ─────────────────────────────────────────────────────────────────────────────── */
  function card(/** @type {any} */ ev) {
    const nf = (/** @type {number} */ d) => new Intl.NumberFormat(tag(), { maximumFractionDigits: d });
    const miss = text('not reported', '記載なし');
    const row = (/** @type {string} */ k, /** @type {string} */ v) => '<tr><td style="color:var(--text-muted);padding-right:8px;vertical-align:top">' + escape(k) + '</td><td>' + escape(v) + '</td></tr>';
    const iso = new Date(ev.ts).toISOString();
    const pos = nf(1).format(Math.abs(ev.lat)) + '°' + (ev.lat < 0 ? 'S' : 'N') + ' ' + nf(1).format(Math.abs(ev.lon)) + '°' + (ev.lon < 0 ? 'W' : 'E');
    const joules = ev.energy == null ? miss : (ev.energy * 1e10).toExponential(2).replace('e+', ' × 10^') + ' J';
    return '<div style="min-width:240px;max-width:320px;padding-right:20px"><strong>' + escape(text('Fireball', '火球')) + ' · ' + escape(iso.slice(0, 10)) + '</strong>'
      + '<table style="border-collapse:collapse;font-size:12px;margin-top:4px"><tbody>'
      + row(text('Time (UTC)', '日時 (UTC)'), iso.slice(0, 19).replace('T', ' '))
      + row(text('Position', '位置'), pos)
      + row(text('Altitude', '高度'), ev.alt == null ? miss : nf(1).format(ev.alt) + ' km')
      + row(text('Speed', '速度'), ev.vel == null ? miss : nf(1).format(ev.vel) + ' km/s')
      + row(text('Radiated energy', '放射エネルギー'), joules)
      + row(text('Estimated impact energy', '推定衝突エネルギー'), ev.impact == null ? miss : nf(ev.impact < 10 ? 2 : 0).format(ev.impact) + ' kt TNT')
      + '</tbody></table>'
      + '<p style="font-size:11px;color:var(--text-muted);margin:6px 0">' + escape(text('Detected by US Government sensors; altitude and speed are given only when they were measured.', '米国政府のセンサーによる検出。高度と速度は測定できたものだけが記載されます。')) + '</p>'
      + '<div style="font-size:10px;margin-top:6px">' + escape(text('Source', '出典')) + ': <a href="https://cneos.jpl.nasa.gov/fireballs/" target="_blank" rel="noopener noreferrer">NASA/JPL CNEOS Fireball Data</a></div></div>';
  }
  function open(/** @type {any} */ id, /** @type {any} */ at) {
    const ev = events && events.find((e) => String(e.ts) === String(id));
    if (!ev) return false;
    let lng = ev.lon;
    if (at && Number.isFinite(at.lng)) { while (lng - at.lng > 180) lng -= 360; while (lng - at.lng < -180) lng += 360; }
    close();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '340px', className: 'plc-popup' })
      .setLngLat({ lng, lat: ev.lat }).setHTML(card(ev)));
    return !!popup;
  }

  /* ── the switch ───────────────────────────────────────────────────────────────────────────── */
  function on() {
    if (enabled) return pending;
    enabled = true;
    pending = K.whenStyleReady().then(() => {
      if (!enabled) return undefined;
      const fromFeature = (/** @type {any} */ f, /** @type {any} */ e) => open(f && f.properties && f.properties.id, e && e.lngLat);
      try { ensure({ type: 'FeatureCollection', features: [] }); } catch (e) { console.warn('fireballs layers', e); }
      stops.push(window.IntMapPlaceReaders.register(DOTS, { open: fromFeature, close }));
      try { legendEl = window._registerLayerOpacity('fireballs', LA('Fireballs (bolides)', '火球（ボライド）'), [DOTS], ROW); } catch (_) { legendEl = null; }
      legend(instant(), 0);
      stops.push(IntMapTime.on(draw), bus.on('intmap-lang', () => { try { draw(); } catch (_) { /* repainted on the next move */ } }));
      /* a basemap change rebuilds the style and takes the layer with it: put it back from what is held */
      const restyle = () => { if (enabled && events && !GE().layers.has(DOTS)) draw(); };
      GE().events.on('styledata', restyle);
      stops.push(() => { GE().events.off('styledata', restyle); });
      return load().then(() => { draw(); }, (e) => { if (enabled && !(e && e.reason === 'aborted')) fail(e); });
    }).catch((e) => {
      console.warn('Fireballs could not load', e);
      try { layerState.report(ROW, e); } catch (_) { /* the report is the row's own business */ }
    });
    return pending;
  }
  function off() {
    enabled = false; pending = null;
    for (const stop of stops.splice(0)) { try { stop(); } catch (_) { /* already detached */ } }
    remove();
    try { window._hideGenericLegend('fireballs'); } catch (_) { /* no legend yet */ }
    legendEl = null; drawn = 0; lastFail = '';
  }

  return { rows: { [ROW]: {
    on, off,
    opacity: (/** @type {number} */ v) => {
      opacity = v;
      try { if (GE().layers.has(DOTS)) { const p = dotPaint(); for (const k of ['circle-opacity', 'circle-stroke-opacity']) GE().layers.setPaint(DOTS, k, p[k]); } } catch (_) { /* not drawn yet: `opacity` is read when it is */ }
    },
  } } };
}
