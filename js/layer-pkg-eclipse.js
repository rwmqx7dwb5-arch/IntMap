/* ============================================================================
 *  IntMap · js/layer-pkg-eclipse.js — LAYER PACKAGE: where the next solar eclipse falls (dl-eclipse)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of the row whose declaration says `pkg: 'eclipse'`
 *  (js/layers/dl-eclipse.js): the track of the Moon's shadow across the ground for one solar eclipse —
 *  the band of totality or annularity (filled), its central line, the northern and southern limits of the
 *  partial eclipse (dashed) and the point of greatest eclipse — and the card a tap on any of them opens.
 *
 *  NOTHING IS FETCHED AND NOTHING IS TABULATED. Which eclipse: js/space-events.js `eclipses` searches the
 *  app's own ephemeris for the next solar eclipse after the clock's instant. Where it falls:
 *  js/space-eclipse-path.js `solarEclipsePath` intersects the umbral and penumbral cones with the WGS-84
 *  ellipsoid (that file's header states its error budget against JPL Horizons and NASA: the greatest point
 *  within tens of km, mostly along the track). This file only draws what those two return.
 *
 *  WHICH ECLIPSE. By default the one whose greatest phase is the first at or after (clock − SPAN_BACK_MS): an
 *  eclipse under way stays on the map until its last contact can have passed, and then the next one replaces
 *  it — move the clock and the layer answers for the instant. `show(msOfMax)` (window.IntMapEclipseLayer, and
 *  js/sky-almanac.js's 「通過帯を地図に表示」) pins one eclipse instead; `follow()` hands it back to the clock.
 *    SPAN_BACK_MS = 4 h — js/space-eclipse-path.js `SPAN`: every phase of a solar eclipse on the Earth lies
 *    within ±4 h of greatest. Lapses with that constant (the same reason, written there).
 *
 *  ⚠ THE ±180° MERIDIAN. js/space-eclipse-path.js keeps every line's longitudes CONTINUOUS (they may run past
 *  ±180°, its `notes` say so). A polygon handed to the renderer like that is drawn across the whole map or not
 *  at all, so `splitLine` / `splitRing` below cut every line and the umbral ring at each odd multiple of 180°
 *  and move each piece back into [−180°, 180°]. The ring is split as a simple polygon by a vertical line (the
 *  crossings paired along the line), not clipped edge by edge, so a piece is never joined to another through
 *  a zero-width corridor along the meridian. tests/space-almanac-panel-checks.test.mjs holds it on eclipses
 *  that really cross it (2033-03-30, 2035-09-02): every piece valid, every longitude in range, the area kept.
 *
 *  ⚠ LAZY: nothing is computed or drawn until the row is switched on (`on`), and `off` removes everything it added.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { IntMapSpaceEvents } from './space-events.js';     /* the search */
import { IntMapEclipsePath } from './space-eclipse-path.js'; /* the geometry */

const HOUR = 3600000;
const SPAN_BACK_MS = 4 * HOUR;
/* how far ahead the search looks: eclipse seasons come every ~173 days and each has at least one solar
   eclipse, so a year always holds one (Meeus, Astronomical Algorithms ch. 54) */
const SEARCH_DAYS = 366;
const ROW = 'dl-eclipse', SRC = 'imf-eclipse-src';
const FILL = 'imf-eclipse-umbra', EDGE = 'imf-eclipse-umbra-edge', CENTRAL = 'imf-eclipse-central', PEN = 'imf-eclipse-penumbra', GREAT = 'imf-eclipse-greatest';
const LAYERS = [FILL, EDGE, PEN, CENTRAL, GREAT];
/* the layers a tap reads (the edge is drawn under the fill's reader) */
const READ = [FILL, PEN, CENTRAL, GREAT];

/* ══ THE ±180° MERIDIAN ═══════════════════════════════════════════════════════════════════════════ */
/* where a longitude can be cut back into [−180, 180]: the odd multiples of 180 */
const slabOf = (/** @type {number} */ x) => Math.floor((x + 180) / 360);
const SNAP = 1e-7;
const snap = (/** @type {number} */ x) => (Math.abs(x - 180) < SNAP ? 180 : Math.abs(x + 180) < SNAP ? -180 : x);

/** a line with continuous longitudes → lines inside [−180, 180], cut where it crosses an odd multiple of 180
    @param {number[][]} coords @returns {number[][][]} */
export function splitLine(coords) {
  const out = [];
  if (!coords || coords.length < 2) return out;
  let cur = [], k = slabOf(coords[0][0]);
  const put = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ slab) => cur.push([snap(x - 360 * slab), y]);
  put(coords[0][0], coords[0][1], k);
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1], b = coords[i], kb = slabOf(b[0]);
    while (k !== kb) {                                         /* one crossing per boundary between the two slabs */
      const c = kb > k ? 360 * k + 180 : 360 * k - 180;
      const f = (c - a[0]) / (b[0] - a[0]), y = a[1] + f * (b[1] - a[1]);
      put(c, y, k);
      if (cur.length >= 2) out.push(cur);
      k += kb > k ? 1 : -1;
      cur = []; put(c, y, k);
    }
    put(b[0], b[1], k);
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

/* a simple ring (closed, continuous longitudes) split by the vertical line x = c into the rings on each side.
   The line's crossings, sorted along it, pair up into the stretches that lie inside the polygon; walking one
   side, an exit is followed by the jump along the line to the crossing it is paired with. */
function cutRing(/** @type {number[][]} */ ring, /** @type {number} */ c) {
  const pts = ring.slice(0, -1);
  const n = pts.length;
  /* a vertex exactly on the line would make two crossings coincide; move the line by a hair instead */
  if (pts.some((p) => p[0] === c)) c += 1e-9;
  const side = (/** @type {number[]} */ p) => (p[0] < c ? -1 : 1);
  /** @type {{ p: number[], s: number }[]} */ const aug = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    aug.push({ p: a, s: side(a) });
    if (side(a) !== side(b)) {
      const f = (c - a[0]) / (b[0] - a[0]);
      aug.push({ p: [c, a[1] + f * (b[1] - a[1])], s: 0 });
    }
  }
  const on = aug.map((v, i) => (v.s === 0 ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return side(pts[0]) < 0 ? { left: [ring], right: [] } : { left: [], right: [ring] };
  const partner = new Map();
  const sorted = on.slice().sort((i, j) => aug[i].p[1] - aug[j].p[1]);
  for (let i = 0; i + 1 < sorted.length; i += 2) { partner.set(sorted[i], sorted[i + 1]); partner.set(sorted[i + 1], sorted[i]); }
  const m = aug.length;
  const trace = (/** @type {number} */ want) => {
    const used = new Set(), rings = [];
    for (let s0 = 0; s0 < m; s0++) {
      if (aug[s0].s !== want || used.has(s0)) continue;
      const r = [];
      let k = s0;
      for (let guard = 0; guard < 2 * m + 2; guard++) {
        r.push(aug[k].p); used.add(k);
        let nx = (k + 1) % m;
        if (aug[k].s === 0 && aug[nx].s !== want && partner.has(k)) {   /* leaving this side: along the line to the pair */
          k = partner.get(k); r.push(aug[k].p); used.add(k); nx = (k + 1) % m;
        }
        k = nx;
        if (k === s0) break;
      }
      const clean = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
      if (clean.length >= 3) { clean.push(clean[0].slice()); rings.push(clean); }
    }
    return rings;
  };
  return { left: trace(-1), right: trace(1) };
}
/** twice the signed planar area of a closed ring (x = longitude, y = latitude) */
export function ringArea2(/** @type {number[][]} */ ring) {
  let a = 0;
  for (let i = 0; i + 1 < ring.length; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return a;
}
/** a simple closed ring with continuous longitudes → rings inside [−180, 180], one per piece
    @param {number[][]} ring @returns {number[][][]} */
export function splitRing(ring) {
  if (!ring || ring.length < 4) return [];
  let lo = Infinity, hi = -Infinity;
  for (const p of ring) { lo = Math.min(lo, p[0]); hi = Math.max(hi, p[0]); }
  let pieces = [ring.map((p) => [p[0], p[1]])];
  for (let c = 360 * slabOf(lo) + 180; c < hi; c += 360) {
    const next = [];
    for (const r of pieces) { const { left, right } = cutRing(r, c); next.push(...left, ...right); }
    pieces = next;
  }
  const out = [];
  for (const r of pieces) {
    if (Math.abs(ringArea2(r)) < 1e-12) continue;            /* a sliver of no area is not a piece of the band */
    let mn = Infinity, mx = -Infinity;
    for (const p of r) { mn = Math.min(mn, p[0]); mx = Math.max(mx, p[0]); }
    const k = slabOf((mn + mx) / 2);
    out.push(r.map((p) => [snap(p[0] - 360 * k), p[1]]));
  }
  return out;
}

/* ══ WHAT IS DRAWN ════════════════════════════════════════════════════════════════════════════════ */
const lines = (/** @type {any} */ g) => (!g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);
const multi = (/** @type {number[][][]} */ parts) => (parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts });

/** one eclipse path (js/space-eclipse-path.js `solarEclipsePath`) → the FeatureCollection this layer draws.
    Every feature carries `role` (umbra · central · penumbra · greatest), the eclipse's `id` (the ms of its
    greatest phase) and `name` (the shared place reader hands a tap on only when it has one). */
export function eclipseToFeatures(/** @type {any} */ path, /** @type {string} */ name) {
  const feats = [];
  if (!path || !path.kind) return { type: 'FeatureCollection', features: feats };
  const props = (/** @type {string} */ role) => ({ id: String(Math.round(path.ms)), role, name: name || '', kind: path.kind });
  if (path.umbra && path.umbra.coordinates && path.umbra.coordinates[0]) {
    for (const ring of splitRing(path.umbra.coordinates[0])) feats.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: props('umbra') });
  }
  const central = splitLine((path.central || []).map((p) => [p[0], p[1]]));
  if (central.length) feats.push({ type: 'Feature', geometry: multi(central), properties: props('central') });
  for (const [g, role] of [[path.penumbraNorth, 'penumbra'], [path.penumbraSouth, 'penumbra']]) {
    const parts = [];
    for (const l of lines(g)) parts.push(...splitLine(l.map((p) => [p[0], p[1]])));
    if (parts.length) feats.push({ type: 'Feature', geometry: multi(parts), properties: props(/** @type {string} */ (role)) });
  }
  if (path.greatest && Number.isFinite(path.greatest.lng)) {
    feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [snap(((path.greatest.lng + 540) % 360) - 180), path.greatest.lat] }, properties: props('greatest') });
  }
  return { type: 'FeatureCollection', features: feats };
}

/* ══ THE PIN — shared by every caller, before or after the row is on ═════════════════════════════════ */
/* The pin is module state, not the instance's: js/sky-almanac.js asks for an eclipse before the row has ever been
   switched (so before js/data-layers.js has run the factory), and the factory reads it when it does. */
let pinnedMs = /** @type {number | null} */ (null);
/** @type {Set<() => void>} */ const redraws = new Set();
/** the eclipse whose greatest phase is nearest `msOfMax` is drawn, whatever the clock says; switches the row on */
export function showEclipse(/** @type {number} */ msOfMax) {
  if (!Number.isFinite(+msOfMax)) return false;
  pinnedMs = +msOfMax;
  if (redraws.size) { for (const r of redraws) r(); return true; }
  try {
    const cb = /** @type {HTMLInputElement | null} */ (document.getElementById(ROW));
    if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); return true; }
  } catch (_) { /* no Layers list in this page: nothing to switch */ }
  return false;
}
/** the layer answers for the clock's instant again */
function followClock() { pinnedMs = null; for (const r of redraws) r(); return true; }
let lastState = /** @type {any} */ ({ on: false });
try { window.IntMapEclipseLayer = { show: showEclipse, follow: followClock, state: () => Object.assign({ pinned: pinnedMs }, lastState) }; } catch (_) { /* node */ }

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function eclipsePackage(K) {
  const { GE, HOST, opacities } = K;
  const text = IntMapLang.pick(() => HOST.lang);
  const LA = IntMapLang.pickArgs();   /* the translation tuple builder, bound here so scripts/i18n-audit.mjs counts the row's name */
  const escape = (/** @type {any} */ v) => window.IntMapSafe.html(String(v == null ? '' : v));
  const tag = () => IntMapLang.htmlTag(HOST.lang);

  let enabled = false, pending = /** @type {any} */ (null), popup = /** @type {any} */ (null), legendEl = /** @type {any} */ (null);
  /** @type {{ ms: number, from: number, path: any, pinned: boolean } | null} */ let cur = null;
  let lastFail = '';
  let opacity = typeof opacities.eclipse === 'number' ? opacities.eclipse : 0.8;
  /** @type {(() => void)[]} */ let stops = [];

  function close() { if (popup) popup.remove(); popup = null; }

  const kindName = (/** @type {string} */ k, /** @type {boolean} */ nonCentral) => {
    const n = k === 'total' ? text('Total solar eclipse', '皆既日食') : k === 'annular' ? text('Annular solar eclipse', '金環日食')
      : k === 'hybrid' ? text('Hybrid solar eclipse', '金環皆既日食') : text('Partial solar eclipse', '部分日食');
    return nonCentral ? n + ' ' + text('(non-central)', '（非中心食）') : n;
  };
  const fmtUTC = (/** @type {number} */ ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const fmtLocal = (/** @type {number} */ ms) => { try { return new Intl.DateTimeFormat(tag(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)); } catch (_) { return fmtUTC(ms); } };
  const nameOf = (/** @type {any} */ p) => kindName(p.kind, !!p.nonCentral) + ' · ' + new Date(p.ms).toISOString().slice(0, 10);

  /* ── which eclipse, and its path ────────────────────────────────────────────────────────────── */
  function resolve() {
    if (pinnedMs != null) {
      /* solarEclipsePath searches greatest within ±6 h of its seed: a pin within that of the held one is the same eclipse */
      if (cur && cur.pinned && Math.abs(cur.ms - pinnedMs) < 6 * HOUR) return cur;
      const path = IntMapEclipsePath.solarEclipsePath(pinnedMs);
      return (cur = { ms: path.ms, from: pinnedMs, path, pinned: true });
    }
    const t = IntMapTime.nowMs(), from = t - SPAN_BACK_MS;
    /* the answer stands while the instant is between where it was searched from and its own greatest + SPAN_BACK */
    if (cur && !cur.pinned && cur.from <= from && from <= cur.ms) return cur;
    const found = IntMapSpaceEvents.eclipses(from, SEARCH_DAYS, true)[0];
    if (!found) return (cur = null);
    const path = IntMapEclipsePath.solarEclipsePath(found.ms);
    return (cur = { ms: path.ms, from, path, pinned: false });
  }

  /* ── drawing ──────────────────────────────────────────────────────────────────────────────── */
  const paintOf = () => ({
    [FILL]: { 'fill-color': '#5e5ce6', 'fill-opacity': 0.32 * opacity },
    [EDGE]: { 'line-color': '#5e5ce6', 'line-width': 1.2, 'line-opacity': 0.9 * opacity },
    [CENTRAL]: { 'line-color': '#ff375f', 'line-width': 1.8, 'line-opacity': opacity },
    [PEN]: { 'line-color': '#ff9f0a', 'line-width': 1.4, 'line-opacity': 0.85 * opacity, 'line-dasharray': [3, 2] },
    [GREAT]: { 'circle-radius': 6, 'circle-color': '#ffd60a', 'circle-opacity': opacity, 'circle-stroke-color': '#1c1c1e', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': opacity },
  });
  function ensure(/** @type {any} */ fc) {
    const L = GE().layers;
    if (!L.hasSource(SRC)) L.addSource(SRC, { type: 'geojson', data: fc, attribution: 'IntMap — computed (JPL approximate elements, ELP-2000/82)' });
    else L.setSourceData(SRC, fc);
    const p = paintOf();
    const role = (/** @type {string} */ r) => ['==', ['get', 'role'], r];
    if (!L.has(FILL)) L.add({ id: FILL, type: 'fill', source: SRC, filter: role('umbra'), paint: p[FILL] });
    if (!L.has(EDGE)) L.add({ id: EDGE, type: 'line', source: SRC, filter: role('umbra'), paint: p[EDGE] });
    if (!L.has(PEN)) L.add({ id: PEN, type: 'line', source: SRC, filter: role('penumbra'), layout: { 'line-cap': 'round' }, paint: p[PEN] });
    if (!L.has(CENTRAL)) L.add({ id: CENTRAL, type: 'line', source: SRC, filter: role('central'), layout: { 'line-cap': 'round' }, paint: p[CENTRAL] });
    if (!L.has(GREAT)) L.add({ id: GREAT, type: 'circle', source: SRC, filter: role('greatest'), paint: p[GREAT] });
  }
  function remove() {
    close();
    for (const id of LAYERS.slice().reverse()) { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { /* gone with the style */ } }
    try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) { /* gone with the style */ }
  }
  function draw() {
    if (!enabled) return;
    let c = null;
    try { c = resolve(); lastFail = ''; } catch (e) {
      console.warn('eclipse path', e);
      lastFail = text('The eclipse path could not be computed', '日食の通過帯を計算できませんでした');
      try { layerState.report(ROW, e, { told: true }); } catch (_) { /* the record is the row's own business */ }
      legend(); return;
    }
    const fc = c ? eclipseToFeatures(c.path, nameOf(c.path)) : { type: 'FeatureCollection', features: [] };
    const drawable = HOST.canDraw ? HOST.canDraw() : GE().ready();
    if (drawable) { try { ensure(fc); } catch (e) { console.warn('eclipse draw', e); } }
    lastState = { on: true, ms: c ? c.ms : null, kind: c ? c.path.kind : null, features: fc.features.length, pinned: pinnedMs };
    try { layerState.report(ROW, c ? 'ok' : 'nodata'); } catch (_) { /* the record is the row's own business */ }
    legend();
  }

  /* ── the facts of one eclipse, shared by the legend and the card ──────────────────────────────── */
  function facts(/** @type {any} */ p) {
    const nf = (/** @type {number} */ d) => new Intl.NumberFormat(tag(), { maximumFractionDigits: d });
    const g = p.greatest || {};
    const pos = Number.isFinite(g.lat) ? nf(1).format(Math.abs(g.lat)) + '°' + (g.lat < 0 ? 'S' : 'N') + ' ' + nf(1).format(Math.abs(((g.lng + 540) % 360) - 180)) + '°' + ((((g.lng + 540) % 360) - 180) < 0 ? 'W' : 'E') : '—';
    const dur = (/** @type {number} */ s) => Math.floor(s / 60) + text('min ', '分') + nf(0).format(Math.round(s % 60)) + text('s', '秒');
    const rows = [
      [text('Greatest eclipse', '最大食'), fmtUTC(p.ms) + ' (' + fmtLocal(p.ms) + ')'],
      [text('Point of greatest eclipse', '最大食の地点'), pos],
    ];
    if (g.durationS != null) rows.push([p.kind === 'annular' ? text('Annularity there', 'そこでの金環継続') : text('Totality there', 'そこでの皆既継続'), dur(g.durationS)]);
    if (g.widthKm != null) rows.push([text('Path width there', 'そこでの帯の幅'), nf(0).format(g.widthKm) + ' km']);
    if (Number.isFinite(g.sunAltDeg)) rows.push([text('Sun’s altitude there', 'そこでの太陽高度'), nf(0).format(g.sunAltDeg) + '°']);
    if (Number.isFinite(p.gamma)) rows.push(['γ', nf(4).format(p.gamma)]);
    return rows;
  }
  const NOTE = () => text('Computed by IntMap from the JPL approximate elements and ELP-2000/82 (Meeus); differs from NASA’s published values by tens of km.',
    '計算: IntMap が JPL 近似要素と ELP-2000/82 から計算（NASA の公表値との差 数十 km）。');
  const partialNote = () => text('A partial eclipse only: no part of the Earth sees the Sun wholly covered or a ring, so only the limits of the partial eclipse are drawn.',
    '部分日食のみ: 太陽が完全に隠れる場所も金環になる場所も地球上に無いため、部分食の南北限界だけを描いています。');

  /* ── the legend (the shared generic legend box: title, opacity, drag, ×) ───────────────────── */
  function legend() {
    if (!legendEl) return;
    let body = legendEl.querySelector('.imf-legend');
    if (!body) { body = document.createElement('div'); body.className = 'imf-legend'; body.style.cssText = 'font-size:11px;line-height:1.5;margin-top:6px;'; const h = legendEl.querySelector('h4'); if (h) h.after(body); else legendEl.appendChild(body); }
    const lines2 = [];
    const p = cur && cur.path;
    if (lastFail) lines2.push('<div style="color:#ff453a">' + escape(lastFail) + '</div>');
    else if (!p) lines2.push('<div style="color:var(--text-muted)">' + escape(text('No solar eclipse was found within a year of the clock.', '時計の時点から 1 年以内に日食が見つかりませんでした。')) + '</div>');
    else {
      lines2.push('<div style="font-weight:600">' + escape(nameOf(p)) + '</div>');
      lines2.push('<table style="border-collapse:collapse;font-size:11px;margin-top:3px"><tbody>' + facts(p).map(([k, v]) => '<tr><td style="color:var(--text-muted);padding-right:8px;vertical-align:top">' + escape(k) + '</td><td>' + escape(v) + '</td></tr>').join('') + '</tbody></table>');
      const sw = (/** @type {string} */ css, /** @type {string} */ label) => '<div style="display:flex;align-items:center;gap:6px"><span style="flex:0 0 22px;' + css + '"></span><span>' + escape(label) + '</span></div>';
      const keys = [];
      if (p.kind !== 'partial') {
        keys.push(sw('height:9px;border-radius:3px;background:rgba(94,92,230,.45);border:1px solid #5e5ce6', p.kind === 'annular' ? text('Path of annularity', '金環食の帯') : text('Path of totality', '皆既食の帯')));
        if (p.central && p.central.length) keys.push(sw('height:0;border-top:2px solid #ff375f', text('Central line', '中心線')));
      }
      keys.push(sw('height:0;border-top:2px dashed #ff9f0a', text('Northern and southern limits of the partial eclipse', '部分食の南北限界')));
      keys.push(sw('height:10px;width:10px;flex-basis:10px;border-radius:50%;background:#ffd60a;border:1.5px solid #1c1c1e', text('Point of greatest eclipse', '最大食の地点')));
      lines2.push('<div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">' + keys.join('') + '</div>');
      if (p.kind === 'partial') lines2.push('<div style="margin-top:5px">' + escape(partialNote()) + '</div>');
      lines2.push('<div style="margin-top:5px;color:var(--text-muted)">' + escape(pinnedMs != null ? text('Showing the eclipse that was asked for.', '指定された日食を表示しています。') : text('The next solar eclipse after the clock’s instant.', '時計の時点の次の日食です。')) + '</div>');
      if (pinnedMs != null) lines2.push('<button type="button" class="imf-ecl-follow" style="margin-top:5px;padding:4px 10px;border-radius:8px;border:1px solid var(--glass-border,rgba(128,128,128,.25));background:var(--input-bg);color:var(--text-main);font-size:11px;cursor:pointer">' + escape(text('Follow the clock', '時計に従う')) + '</button>');
    }
    lines2.push('<div style="font-size:10px;margin-top:5px;color:var(--text-muted)">' + escape(NOTE()) + '</div>');
    body.innerHTML = lines2.join('');
    const b = body.querySelector('.imf-ecl-follow');
    if (b) b.addEventListener('click', () => followClock());
  }

  /* ── the card ─────────────────────────────────────────────────────────────────────────────── */
  function card(/** @type {any} */ p) {
    const row = (/** @type {string} */ k, /** @type {string} */ v) => '<tr><td style="color:var(--text-muted);padding-right:8px;vertical-align:top">' + escape(k) + '</td><td>' + escape(v) + '</td></tr>';
    return '<div style="min-width:240px;max-width:320px;padding-right:20px"><strong>' + escape(nameOf(p)) + '</strong>'
      + '<table style="border-collapse:collapse;font-size:12px;margin-top:4px"><tbody>' + facts(p).map(([k, v]) => row(k, v)).join('') + '</tbody></table>'
      + (p.kind === 'partial' ? '<p style="font-size:11px;margin:6px 0">' + escape(partialNote()) + '</p>' : '')
      + '<p style="font-size:11px;color:var(--text-muted);margin:6px 0 0">' + escape(NOTE()) + '</p></div>';
  }
  function open(/** @type {any} */ f, /** @type {any} */ e) {
    const p = cur && cur.path;
    if (!p || !f || !f.properties || String(f.properties.id) !== String(Math.round(p.ms))) return false;
    const at = e && e.lngLat ? e.lngLat : (p.greatest ? { lng: p.greatest.lng, lat: p.greatest.lat } : null);
    if (!at) return false;
    close();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '340px', className: 'plc-popup' })
      .setLngLat({ lng: at.lng, lat: at.lat }).setHTML(card(p)));
    return !!popup;
  }

  /* ── the switch ───────────────────────────────────────────────────────────────────────────── */
  function on() {
    if (enabled) return pending;
    enabled = true;
    pending = K.whenStyleReady().then(() => {
      if (!enabled) return undefined;
      try { ensure({ type: 'FeatureCollection', features: [] }); } catch (e) { console.warn('eclipse layers', e); }
      for (const id of READ) stops.push(window.IntMapPlaceReaders.register(id, { open, close }));
      try { legendEl = window._registerLayerOpacity('eclipse', LA('Solar eclipse path', '日食の通過帯'), LAYERS, ROW); } catch (_) { legendEl = null; }
      const again = () => { try { draw(); } catch (_) { /* drawn on the next change */ } };
      redraws.add(again); stops.push(() => { redraws.delete(again); });
      stops.push(IntMapTime.on(again), bus.on('intmap-lang', again));
      /* a basemap change rebuilds the style and takes the layer with it: put it back from what is held */
      const restyle = () => { if (enabled && !GE().layers.has(FILL)) draw(); };
      GE().events.on('styledata', restyle);
      stops.push(() => { GE().events.off('styledata', restyle); });
      draw();
      return undefined;
    }).catch((e) => {
      console.warn('Eclipse path could not be drawn', e);
      try { layerState.report(ROW, e); } catch (_) { /* the report is the row's own business */ }
    });
    return pending;
  }
  function off() {
    enabled = false; pending = null;
    for (const stop of stops.splice(0)) { try { stop(); } catch (_) { /* already detached */ } }
    remove();
    try { window._hideGenericLegend('eclipse'); } catch (_) { /* no legend yet */ }
    legendEl = null; lastFail = ''; lastState = { on: false };
  }

  return { rows: { [ROW]: {
    on, off,
    opacity: (/** @type {number} */ v) => {
      opacity = v;
      try { const p = paintOf(); for (const id of LAYERS) { if (!GE().layers.has(id)) continue; for (const [k, val] of Object.entries(p[id])) if (/opacity/.test(k)) GE().layers.setPaint(id, k, val); } } catch (_) { /* not drawn yet: `opacity` is read when it is */ }
    },
  } } };
}
