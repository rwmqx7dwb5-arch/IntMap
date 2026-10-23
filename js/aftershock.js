/* ============================================================================
 *  IntMap · js/aftershock.js — AFTERSHOCK FORECAST, ON THE MAP AND THE CLOCK  (wave4-science)
 * ----------------------------------------------------------------------------
 *  «Will there be more, and how big?» — the question after every large earthquake, answered with the quantitative
 *  aftershock forecast seismology issues operationally (Reasenberg & Jones 1989; the global recipe and parameters USGS
 *  published, Page et al. 2016), for ANY earthquake of M5 or more in the USGS catalogue — not only the few USGS forecasts
 *  itself. The earthquake popup's «Aftershock forecast», the earthquake record's selected quake, the Tools list, a link
 *  `?as=<ComCat id>`, the IntMapOS command `aftershock.open` and Atlas `sim.aftershocks` all open the same card:
 *    · the chance of at least one aftershock of M3+, M5+, M6+, M7+ and «as large as this one» in the next day, week,
 *      month and year, each with the 95 % range of the number — the probability and its uncertainty together;
 *    · what the forecast stands on: the tectonic regime and its generic parameters, the aftershock zone, the catalogue's
 *      completeness, how many aftershocks it learned from and how far they moved the prior;
 *    · the curve teachers draw on the board: the aftershocks counted so far against the decay the model expects;
 *    · USGS's own forecast beside it where USGS published one (a different model — ETAS — never merged);
 *    · THE CLOCK IS THE ISSUE TIME. Put the master clock (js/chronos.js) on any instant after a past mainshock and the
 *      forecast is the one that could have been issued then, from the aftershocks recorded by then — and for the windows
 *      that have since ended, the card says what happened (the answer check). «How good is this forecast?» shows the same
 *      check over 137 sequences (data/aftershock-hindcast.json).
 *  The arithmetic is js/aftershock-core.js (node evaluates it); this file fetches, paints and words it.
 *  ⚠ NOT AN OFFICIAL FORECAST, and the card says so above the numbers, with the national agency named.
 *  ⚠ «COULD NOT READ» IS NEVER «NO AFTERSHOCKS»: a failed read says which way it failed.
 *  Lazy: js/lazy-modules.js `aftershock`; the doors are in js/wb-layers.js (boot). IntMap's words, en + jp.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { IntMapTime } from './chronos.js';
import { MapState } from './map-state.js';
import { jsonWithin } from './fetch-deadline.js';
import { loadData } from './data-door.js';
import { AS, prepare, completenessAt, radius, normalise, catalogUrl, eventUrl, oafUrl, readOafForecast, run, ring, windows,
  listRecent, nearUrl, pickNear, encodeLink, decodeLink, forAtlas } from './aftershock-core.js';

const AS_CSS = [
  '.as-warn{ margin:0 0 8px; padding:9px 12px; border-radius:12px; background:rgba(255,159,10,0.14); font-size:12px; line-height:1.45; color:var(--text-main); }',
  '.as-issue{ font-size:12px; color:var(--text-muted); margin:0 0 6px; line-height:1.45; }',
  '.as-head{ display:flex; flex-direction:column; gap:3px; margin:0 0 8px; padding:10px 12px; border-radius:12px; background:var(--primary-tint,rgba(10,132,255,0.12)); font-size:12.5px; line-height:1.45; }',
  '.as-head b{ font-weight:650; color:var(--text-main); }',
  '.as-tab{ width:100%; border-collapse:separate; border-spacing:0; font-size:12px; margin:0 0 6px; font-variant-numeric:tabular-nums; }',
  '.as-tab th{ font-size:11px; font-weight:600; color:var(--text-muted); text-align:center; padding:3px 2px; }',
  '.as-tab th:first-child{ text-align:left; }',
  '.as-tab td{ text-align:center; padding:5px 2px; border-top:1px solid var(--glass-border,rgba(128,128,128,0.18)); vertical-align:top; }',
  '.as-tab td:first-child{ text-align:left; font-weight:600; white-space:nowrap; }',
  '.as-p{ display:block; font-size:13px; font-weight:650; }',
  '.as-r{ display:block; font-size:10.5px; color:var(--text-muted); }',
  '.as-ok,.as-lo,.as-hi,.as-na{ display:inline-block; margin-top:2px; padding:1px 6px; border-radius:999px; font-size:10px; font-weight:600; }',
  '.as-ok{ background:rgba(52,199,89,0.18); color:#248a3d; } .as-lo{ background:rgba(10,132,255,0.16); color:#0a6fd6; } .as-hi{ background:rgba(255,59,48,0.16); color:#d70015; } .as-na{ background:var(--input-bg); color:var(--text-muted); }',
  '.as-svg{ width:100%; height:auto; display:block; margin:2px 0 4px; }',
  '.as-grid{ stroke:var(--glass-border,rgba(128,128,128,0.22)); stroke-width:0.6; }',
  '.as-ax{ font-size:8.5px; fill:var(--text-muted); font-variant-numeric:tabular-nums; }',
  '.as-band{ fill:rgba(10,132,255,0.16); } .as-exp{ fill:none; stroke:#0a84ff; stroke-width:1.4; } .as-obs{ fill:none; stroke:#ff9500; stroke-width:1.6; } .as-obs2{ fill:none; stroke:#ff9500; stroke-width:1.2; stroke-dasharray:3 2; }',
  '.as-key{ display:flex; flex-wrap:wrap; gap:4px 12px; margin:0 0 8px; font-size:11px; color:var(--text-muted); }',
  '.as-key i{ display:inline-block; width:14px; height:3px; border-radius:2px; vertical-align:middle; margin-right:5px; }',
  '.as-facts{ margin:0 0 8px; padding:0; list-style:none; font-size:12px; line-height:1.5; }',
  '.as-facts li{ padding:3px 0; border-top:1px solid var(--glass-border,rgba(128,128,128,0.14)); }',
  '.as-facts span{ color:var(--text-muted); }',
  '.as-usgs{ margin:0 0 8px; padding:10px 12px; border-radius:12px; background:var(--input-bg); font-size:12px; line-height:1.5; }',
  '.as-act{ display:flex; flex-wrap:wrap; gap:6px; margin:0 0 8px; }',
  '.as-btn{ min-height:34px; padding:6px 12px; border:0; border-radius:10px; background:#0a84ff; color:#fff; font-size:12.5px; font-weight:600; cursor:pointer; }',
  '.as-cal{ margin:0 0 8px; font-size:11.5px; }',
  '.as-cap{ font-size:11.5px; color:var(--text-muted); line-height:1.45; margin:2px 0 8px; }',
  '.as-now{ stroke:var(--text-muted); stroke-width:1; stroke-dasharray:2 2; }',
].join(' ');
const CREDIT = 'Aftershocks: USGS ANSS ComCat (public domain); forecast parameters: USGS OAF (CC0)';
const DAY = 86400000;

export function aftershock(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const LOC = () => { try { return IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const nf = (v) => { try { return Number(v).toLocaleString(LOC()); } catch (_) { return String(v); } };
  const M = (m) => (m == null ? 'M?' : 'M' + Number(m).toFixed(1));
  const fmtUTC = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  /* the waits: measured 2026-10-13, an event read ~0.3 s, the densest sequence read (M7.8, 2023, 606 events) ~1 s,
     the 55 kB regime bundle and the 30-day feed well under a second. Unmade if ComCat's times move by an order of magnitude. */
  const READ_MS = 25000, SHORT_MS = 12000;
  const SRC = 'as-src', RING = 'as-ring', PT = 'as-pt', MAIN = 'as-main';

  const st = { open: false, seq: 0, loading: false, err: '', errKind: null, main: null, events: null, loadedEnd: 0, lowMag: null,
    issueMs: null, issuedLive: false, clockBefore: false, r: null, oaf: null, oafState: 'none', list: null, cal: null, calOpen: false, painted: 0, paintError: '', place: '' };
  let P = null;

  function clockMs() { try { return IntMapTime.nowMs(); } catch (_) { return Date.now(); } }
  function clockLive() { try { return IntMapTime.state().isLive; } catch (_) { return true; } }
  async function regimes() { if (!P) P = prepare(await loadData(AS.DATA)); return P; }
  /* the issue instant: the master clock when it stands after the mainshock, else now (and the card says why) */
  function issueFor(main) {
    const now = Date.now(), T = clockLive() ? now : Math.min(now, clockMs());
    st.issuedLive = clockLive();
    st.clockBefore = T <= main.t;
    return st.clockBefore ? now : T;
  }

  /* ── reading ──────────────────────────────────────────────────────────────────────────────────── */
  async function readEvent(id) {
    const j = await jsonWithin(eventUrl(id), SHORT_MS);
    const f = j && j.type === 'Feature' ? j : (j && j.features && j.features[0]);
    const e = normalise(f);
    if (!e) throw Object.assign(new Error('no such event'), { reason: 'not-found' });
    return { e, oaf: oafUrl(f) };
  }
  /* the catalogue around the mainshock, from it to the end of the longest window (or now): one count, then one read —
     at the lower of the centroid and completeness floors; when that holds more than one read brings, at the
     completeness floor alone (the centroid then rests on fewer events, and the card says so) */
  async function readSequence(main, issueMs) {
    const mc = completenessAt(P, main.lng, main.lat);
    const reach = radius(mc, main.mag, 'sample') + radius(mc, main.mag, 'centroid');
    const end = Math.min(Date.now(), windows(issueMs).slice(-1)[0].end);
    let minMag = Math.min(mc.magCat, mc.magCentroid);
    const q = (kind, m) => catalogUrl(kind, { lng: main.lng, lat: main.lat, radiusKm: reach, minMag: m, startMs: main.t, endMs: end });
    let n = null;
    try { const c = await jsonWithin(q('count', minMag), SHORT_MS); n = c && isFinite(+c.count) ? +c.count : (isFinite(+c) ? +c : null); } catch (_) { n = null; }
    st.lowMag = null;
    if (n != null && n > AS.CAP && minMag < mc.magCat) { st.lowMag = minMag; minMag = mc.magCat; }
    const j = await jsonWithin(q('query', minMag), READ_MS);
    st.events = ((j && j.features) || []).map(normalise).filter(Boolean);
    st.loadedEnd = end;
  }

  /** open({ eventId, feature, search, lng, lat, name }) — the forecast of one earthquake (by id, a feature from the
      earthquakes layer, a link), or of the largest M5+ in the last 30 days near a named place; with none, the chooser */
  async function open(o) {
    const p = Object.assign({}, o || {});
    if (p.search) { const d = decodeLink(p.search); if (d) Object.assign(p, d); }
    const my = ++st.seq;
    Object.assign(st, { open: true, loading: true, err: '', errKind: null, r: null, main: null, events: null, oaf: null, oafState: 'none', list: null, calOpen: false, place: String(p.name || '') });
    show(); draw();
    try {
      await regimes();
      if (my !== st.seq) return null;
      let id = p.eventId ? String(p.eventId) : '';
      if (!id && p.feature) { const e = normalise(p.feature); if (e) id = e.id; }
      if (!id && isFinite(+p.lng) && isFinite(+p.lat)) {
        const T = clockLive() ? Date.now() : Math.min(Date.now(), clockMs());
        const near = pickNear(await jsonWithin(nearUrl(+p.lng, +p.lat, T), SHORT_MS), { lng: +p.lng, lat: +p.lat }, T);
        if (my !== st.seq) return null;
        if (!near) throw Object.assign(new Error('none near'), { reason: 'none-near' });
        id = near.id;
      }
      if (id) {
        const ev = await readEvent(id);
        if (my !== st.seq) return null;
        st.main = ev.e;
        if (st.main.mag == null || st.main.mag < AS.MIN_MAIN) throw Object.assign(new Error('too small'), { reason: 'too-small' });
        st.issueMs = issueFor(st.main);
        const oafRead = ev.oaf ? jsonWithin(ev.oaf, SHORT_MS).then((j) => { st.oaf = readOafForecast(j); st.oafState = st.oaf ? 'ok' : 'unreadable'; }).catch(() => { st.oafState = 'unreadable'; }) : Promise.resolve();
        await readSequence(st.main, st.issueMs);
        if (my !== st.seq) return null;
        compute();
        await oafRead;
      } else {
        await loadList(my);   /* no earthquake named: the chooser */
      }
    } catch (e) { if (my === st.seq) { st.err = (e && e.message) || String(e); st.errKind = (e && e.reason) || 'failed'; } }
    if (my !== st.seq) return null;
    st.loading = false;
    draw(); paint(); fit();
    return summary();
  }
  async function loadList(my) {
    const j = await jsonWithin(AS.LIST_FEED, SHORT_MS);
    if (my !== st.seq) return;
    st.list = listRecent(j, Date.now());
  }
  function compute() { st.r = run(P, st.main, st.events, st.issueMs, { now: Date.now() }); }

  /* the clock moves the issue time: recompute from what was read; read again only when the clock leaves it */
  let pend = 0;
  function onClock() {
    if (!st.open || !st.main || st.loading) return;
    /* a live clock that stays live is the present moving on, not the reader choosing an instant: the forecast already
       issued «now» stands until the reader reopens it or moves the clock (no re-read every minute) */
    if (clockLive() && st.issuedLive) return;
    clearTimeout(pend);
    pend = setTimeout(async () => {
      const issue = issueFor(st.main);
      if (Math.abs(issue - st.issueMs) < 60000) return;
      st.issueMs = issue;
      const need = Math.min(Date.now(), windows(issue).slice(-1)[0].end);
      if (need > st.loadedEnd + 60000) {
        const my = ++st.seq; st.loading = true; drawDyn();
        try { await readSequence(st.main, issue); if (my !== st.seq) return; compute(); }
        catch (e) { if (my === st.seq) { st.err = (e && e.message) || String(e); st.errKind = (e && e.reason) || 'failed'; } }
        if (my !== st.seq) return;
        st.loading = false;
      } else { try { compute(); } catch (e) { st.err = (e && e.message) || String(e); st.errKind = 'failed'; } }
      drawDyn(); paint();
    }, 250);   /* one recompute after the clock settles (a time-lapse moves it every frame) */
  }
  try { IntMapTime.on(onClock); } catch (_) { }

  function toMoment() { if (!st.main) return false; try { IntMapTime.set(new Date(st.main.t + 60000), { source: 'aftershock' }); return true; } catch (_) { return false; } }
  function toNow() { try { IntMapTime.setNow({ source: 'aftershock' }); return true; } catch (_) { return false; } }
  /** issueAt(ms) — the forecast as it could have been issued at an instant (moves the master clock there) */
  function issueAt(ms) { try { IntMapTime.set(new Date(ms), { source: 'aftershock' }); return true; } catch (_) { return false; } }

  /* ── the map ─────────────────────────────────────────────────────────────────────────────────── */
  function whenDrawable(fn) {
    const can = () => { try { return !!HOST.canDraw(); } catch (_) { return false; } };
    if (can()) { fn(); return; }
    try { GE().whenCanDraw().then(fn); } catch (_) { }
  }
  function features() {
    const r = st.r; if (!st.open || !r) return [];
    const out = [{ type: 'Feature', geometry: { type: 'LineString', coordinates: ring(r.zone.centre, r.zone.radiusKm) }, properties: { k: 'ring' } }];
    const ev = r.inZone.filter((e) => e.mag != null).slice().sort((a, b) => a.mag - b.mag);
    for (const e of ev) out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] }, properties: { k: 'q', m: e.mag, after: e.t > r.issueMs ? 1 : 0 } });
    out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.main.lng, r.main.lat] }, properties: { k: 'main', m: r.main.mag } });
    return out;
  }
  function paint() {
    const data = { type: 'FeatureCollection', features: features() };
    whenDrawable(() => {
      try {
        if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
        else {
          GE().layers.addSource(SRC, { type: 'geojson', data, attribution: CREDIT });
          GE().layers.add({ id: RING, type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'ring'],
            paint: { 'line-color': '#0a84ff', 'line-width': 1.6, 'line-opacity': 0.85, 'line-dasharray': [3, 2] } });
          GE().layers.add({ id: PT, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'q'],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 3, 2.5, 5, 5, 6, 8, 7, 12, 8, 18],
              'circle-color': ['case', ['==', ['get', 'after'], 1], 'rgba(0,0,0,0)', '#ff9500'], 'circle-opacity': 0.85,
              'circle-stroke-color': ['case', ['==', ['get', 'after'], 1], '#ff9500', 'rgba(255,255,255,0.85)'], 'circle-stroke-width': ['case', ['==', ['get', 'after'], 1], 1.2, 0.7] } });
          GE().layers.add({ id: MAIN, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'main'],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 5, 8, 7, 14, 9, 22], 'circle-color': '#ff3b30', 'circle-opacity': 0.9,
              'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
        }
        [RING, PT, MAIN].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', st.open ? 'visible' : 'none'); });
        /* ⚠ counted from the map, not from the intention (js/news-story.js's rule) */
        st.painted = GE().layers.has(PT) && st.open ? data.features.filter((f) => f.properties.k !== 'ring').length : 0;
        st.paintError = '';
      } catch (e) { st.painted = 0; st.paintError = (e && e.message) || 'paint_failed'; }
    });
  }
  function fit() {
    const r = st.r; if (!st.open || !r) return;
    const pts = ring(r.zone.centre, r.zone.radiusKm, 24);
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    if (e - w > 180) { w = r.zone.centre.lng - 5; e = r.zone.centre.lng + 5; }
    whenDrawable(() => { try { GE().camera.fitBounds([[w, s], [e, n]], { padding: clearOfCard(), maxZoom: 9, duration: 900 }); } catch (_) { } });
  }
  function clearOfCard() {
    const pad = { top: 50, bottom: 50, left: 50, right: 50 };
    try {
      if (!pop || pop.style.display === 'none') return pad;
      const c = GE().render.canvas().getBoundingClientRect(), r = pop.getBoundingClientRect();
      const cover = { right: c.right - r.left, left: r.right - c.left, bottom: c.bottom - r.top, top: r.bottom - c.top };
      const side = ['right', 'left', 'top', 'bottom'].filter((k) => cover[k] > 0).sort((a, b) => cover[a] - cover[b])[0];
      const span = side === 'right' || side === 'left' ? c.width : c.height;
      if (side && cover[side] < span * 0.75) pad[side] = Math.round(cover[side] + 30);
    } catch (_) { }
    return pad;
  }

  /* ── the card ────────────────────────────────────────────────────────────────────────────────── */
  let pop = null;
  function ensurePop() {
    if (pop && document.body.contains(pop)) return pop;
    if (!document.getElementById('im-aftershock-css')) { const css = document.createElement('style'); css.id = 'im-aftershock-css'; css.textContent = AS_CSS; document.head.appendChild(css); }
    pop = document.createElement('div');
    pop.className = 'country-popup nint-popup as-popup'; pop.id = 'as-popup';
    pop.setAttribute('data-panel', 'aftershock');
    pop.setAttribute('role', 'dialog'); pop.setAttribute('tabindex', '-1'); pop.setAttribute('aria-labelledby', 'as-title');
    pop.setAttribute('data-effect', 'none');
    pop.innerHTML = '<button class="country-popup-close" type="button" data-as="close"></button><div class="country-popup-header" id="as-headr"></div><div id="as-body"></div>';
    (document.getElementById('map-container') || document.body).appendChild(pop);
    try { HOST.makeDraggable(pop, pop.querySelector('#as-headr')); } catch (_) { }
    pop.addEventListener('mousedown', () => { try { HOST.bringToFront(pop); } catch (_) { } });
    pop.addEventListener('click', onClick);
    return pop;
  }
  function show() {
    const e = ensurePop(); e.style.display = 'block';
    try { HOST.bringToFront(e); } catch (_) { }
    try { if (window.__setDetent && window.IntMapDevice.compact()) window.__setDetent('peek'); } catch (_) { }
    if (e.getAttribute('data-dragged') !== '1') {
      try {
        const mc = e.offsetParent || document.getElementById('map-container') || document.documentElement;
        const mr = mc.getBoundingClientRect(), w = e.offsetWidth || 380;
        e.style.left = Math.round(Math.max(12, mr.width - w - 24)) + 'px'; e.style.top = '84px';
      } catch (_) { e.style.left = '16px'; e.style.top = '84px'; }
    }
  }
  function onClick(ev) {
    const t = ev && ev.target; if (!t || typeof t.closest !== 'function') return;
    if (t.closest('[data-as="close"]')) { close(); return; }
    if (t.closest('[data-as="moment"]')) { toMoment(); return; }
    if (t.closest('[data-as="now"]')) { toNow(); return; }
    if (t.closest('[data-as="day1"]')) { if (st.main) issueAt(st.main.t + DAY); return; }
    if (t.closest('[data-as="link"]')) { copyLink(); return; }
    if (t.closest('[data-as="cal"]')) { toggleCal(); return; }
    if (t.closest('[data-as="record"]')) { openRecord(); return; }
    const p = t.closest('[data-as-ev]'); if (p) { open({ eventId: p.getAttribute('data-as-ev') }); }
  }
  async function toggleCal() {
    st.calOpen = !st.calOpen;
    if (st.calOpen && !st.cal) { try { st.cal = await loadData('data/aftershock-hindcast.json'); } catch (_) { st.cal = { failed: true }; } }
    drawDyn();
  }
  function openRecord() {
    if (!st.main) return;
    Promise.resolve().then(() => window.IntMapLazy.need('quakeHistory')).then(() => window.IntMapQuakeHistory.open({ eventId: st.main.id }))
      .catch(() => { try { HOST.imToast(L('Could not load the earthquake record', '地震の記録を読み込めませんでした')); } catch (_) { } });
  }
  function link() {
    if (!st.main) return '';
    let h = ''; try { h = MapState.hash(); } catch (_) { h = ''; }
    const q = '?' + encodeLink(st.main.id);
    return MapState.pageLink(q, h) || q;
  }
  async function copyLink() {
    const u = link(); if (!u) return;
    try { await navigator.clipboard.writeText(u); HOST.imToast(L('Link to this aftershock forecast copied', 'この余震の見通しへのリンクをコピーしました')); }
    catch (_) { try { HOST.imToast(u); } catch (_) { } }
  }
  function close() {
    st.seq++; st.open = false; st.loading = false; clearTimeout(pend);
    if (pop) pop.style.display = 'none';
    paint();
  }

  function draw() {
    const e = ensurePop();
    const x = e.querySelector('[data-as="close"]'); x.textContent = '×'; x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
    const m = st.main;
    e.querySelector('#as-headr').innerHTML = '<div class="nint-h-title" id="as-title">' + S(L('Aftershock forecast', '余震の見通し')) + '</div><div class="nint-h-sub">'
      + S(m ? [M(m.mag), m.place, fmtUTC(m.t)].filter(Boolean).join(' · ') : (st.place || L('Choose an earthquake', '地震を選んでください'))) + '</div>';
    drawDyn();
  }
  const pct = (p) => (p === 0 ? '0%' : p >= 0.995 ? '>99%' : p < 0.001 ? '<0.1%' : p < 0.1 ? (100 * p).toFixed(1) + '%' : Math.round(100 * p) + '%');
  const winLabel = (k) => ({ day: L('Within a day', '1日以内'), week: L('Within a week', '1週間以内'), month: L('Within a month', '1か月以内'), year: L('Within a year', '1年以内') }[k] || k);
  function drawDyn() {
    const body = ensurePop().querySelector('#as-body');
    const msg = (t) => { body.innerHTML = '<div class="nint-empty">' + S(t) + '</div>'; };
    if (st.loading) return msg(L('Reading the USGS catalogue…', 'USGS のカタログを読んでいます…'));
    if (st.err) return msg(failureLine());
    if (st.list) return listHTML(body);
    const r = st.r; if (!r) return msg('');
    let h = '<div class="as-warn">' + S(L('Not an official forecast. For decisions follow your national agency (in Japan, the Japan Meteorological Agency). The probabilities are for the dashed circle as a whole, not for one site.',
      '公式の予測ではありません。行動の判断は各国の機関の発表に従ってください（日本では気象庁）。確率は破線の円の範囲全体についてのもので、特定の地点についてではありません。')) + '</div>';
    const days = r.tIssueDays;
    const ago = days < 0.995 ? L('{h} hours', '{h} 時間').replace('{h}', (days * 24).toFixed(1)) : L('{d} days', '{d} 日').replace('{d}', days < 10 ? days.toFixed(1) : nf(Math.round(days)));
    h += '<div class="as-issue">' + S((clockLive() || st.clockBefore ? L('Issued now ({t}), {a} after the mainshock.', 'いま（{t}）時点の見通し。本震から {a} 後。') : L('As it could have been issued at {t} — the map\'s clock — {a} after the mainshock, from the aftershocks recorded by then.', '地図の時計の時刻 {t} に出せた見通し（本震から {a} 後、その時点までに記録された余震から）。'))
      .replace('{t}', fmtUTC(r.issueMs)).replace('{a}', ago)) + (st.clockBefore && !clockLive() ? ' ' + S(L('The clock stands before this earthquake, so the forecast is issued now.', '時計がこの地震より前を指しているため、いまの時点で出しています。')) : '') + '</div>';
    const wk = r.forecast[1], b6 = wk.bins.find((b) => b.mag === 6 && !b.asLarge), bm = wk.bins.find((b) => b.asLarge);
    h += '<div class="as-head"><b>' + S(L('Chance of at least one M6+ aftershock in the next week: {p}', '今後1週間に M6 以上の余震が少なくとも1回起きる確率: {p}').replace('{p}', pct(b6.probability))) + '</b>'
      + '<span>' + S(L('Of an earthquake as large as this one ({m}) or larger: {p} — about 1 in {n}.', 'この地震（{m}）と同じかそれより大きい地震: {p}（およそ {n} 回に 1 回）。').replace('{m}', M(r.main.mag)).replace('{p}', pct(bm.probability)).replace('{n}', nf(Math.max(1, Math.round(1 / Math.max(bm.probability, 1e-6)))))) + '</span></div>';
    h += tableHTML(r);
    h += chartSVG(r);
    h += factsHTML(r);
    h += usgsHTML(r);
    h += '<div class="as-act">';
    h += '<button type="button" class="nst-all" data-as="cal">' + S(st.calOpen ? L('Hide the test', '検証を閉じる') : L('How good is this forecast?', 'この見通しはどれくらい当たる？')) + '</button>';
    if (!clockLive()) h += '<button type="button" class="nst-all" data-as="now">' + S(L('Issue it now', 'いまの時点にする')) + '</button>';
    else if (Date.now() - r.main.t > 7 * DAY) h += '<button type="button" class="nst-all" data-as="day1" data-time-intent="1">' + S(L('As issued one day after', '本震の翌日の時点にする')) + '</button>';
    h += '<button type="button" class="nst-all" data-as="moment" data-time-intent="1">' + S(L('Show the mainshock moment', '本震の瞬間の地図にする')) + '</button>';
    h += '<button type="button" class="nst-all" data-as="record">' + S(L('Earthquake record here', 'この場所の地震の記録')) + '</button>';
    h += '</div>';
    if (st.calOpen) h += calHTML();
    h += '<div class="nint-foot nint-cov">' + S(L('Model: Reasenberg & Jones (1989) — modified Omori decay and Gutenberg–Richter sizes — with the generic parameters USGS published for each tectonic regime (Page et al. 2016; regimes of García et al. 2012) and the time-dependent catalogue completeness of Page et al. (2016), updated with this sequence\'s own aftershocks (Bayesian, p and c fixed as in USGS\'s code). Aftershocks: USGS ANSS ComCat, public domain. Parameters: USGS OpenSHA OAF, CC0. Times are UTC.',
      'モデル: Reasenberg & Jones (1989)——改良大森則による減衰とグーテンベルク・リヒター則による規模——に、USGS が地殻変動の区分ごとに公表した一般的なパラメータ（Page ほか 2016、区分は García ほか 2012）と、本震直後のカタログの検知漏れ（Page ほか 2016）を用い、この地震の実際の余震で更新しています（ベイズ更新。p と c は USGS のコードと同じく固定）。余震: USGS ANSS ComCat（パブリックドメイン）。パラメータ: USGS OpenSHA OAF（CC0）。時刻は UTC。'))
      + ' <a href="./science.html#aftershock" target="_blank" rel="noopener">' + S(L('How it is computed', '計算の方法')) + '</a></div>';
    h += '<div class="nst-share"><button type="button" class="nst-link" data-as="link">' + S(L('Copy link to this forecast', 'この見通しへのリンクをコピー')) + '</button></div>';
    body.innerHTML = h;
  }
  function tableHTML(r) {
    const rows = r.forecast[0].bins.map((b, j) => ({ label: b.asLarge ? L('≥ this ({m})', 'この規模以上（{m}）').replace('{m}', M(b.mag)) : 'M' + b.mag + '+', j }));
    let h = '<table class="as-tab"><thead><tr><th>' + S(L('Magnitude', '規模')) + '</th>' + r.forecast.map((w) => '<th>' + S(winLabel(w.key)) + '</th>').join('') + '</tr></thead><tbody>';
    for (const row of rows) {
      h += '<tr><td>' + S(row.label) + '</td>';
      r.forecast.forEach((w, i) => {
        const b = w.bins[row.j], c = r.check[i];
        let cell = '<span class="as-p">' + S(pct(b.probability)) + '</span><span class="as-r">' + S(b.hi === b.lo ? String(b.lo) : b.lo + '–' + nf(b.hi)) + '</span>';
        if (c.state === 'closed') {
          const k = c.bins[row.j];
          if (!k.checkable) cell += '<span class="as-na" title="' + S(L('Below the catalogue\'s completeness: not checkable', 'カタログの検知限界より小さいため検証できません')) + '">' + S(L('n/a', '対象外')) + '</span>';
          else cell += '<span class="' + (k.verdict === 'within' ? 'as-ok' : k.verdict === 'below' ? 'as-lo' : 'as-hi') + '" title="' + S(k.verdict === 'within' ? L('Inside the 95% range', '95% の範囲内') : k.verdict === 'below' ? L('Fewer than the 95% range', '95% の範囲より少ない') : L('More than the 95% range', '95% の範囲より多い')) + '">'
            + S(L('{n} happened', '実際 {n}').replace('{n}', nf(k.observed))) + '</span>';
        }
        h += '<td>' + cell + '</td>';
      });
      h += '</tr>';
    }
    h += '</tbody></table><div class="as-cap">' + S(L('Each cell: the chance of at least one, and below it the range of the number (95% of outcomes). Where a window has ended, what the catalogue recorded.',
      '各欄: 少なくとも 1 回起きる確率と、その下に回数の範囲（95% の結果が入る幅）。期間が終わっている欄には、カタログに記録された実際の回数。')) + '</div>';
    return h;
  }
  /* the cumulative count of the aftershocks the model learned from (each at or above the completeness of its own
     instant) against the expected count (posterior median of a) and its 95 % parameter band; after the issue time
     (an answer check) the same count continues, dashed */
  function chartSVG(r) {
    const W = 320, H = 120, Pd = { l: 30, r: 8, t: 8, b: 18 };
    const nowDays = (Math.min(Date.now(), r.forecast[3].end) - r.main.t) / DAY;
    const tEnd = Math.max(r.tIssueDays * 1.05, r.check.some((c) => c.state === 'closed') ? Math.min(nowDays, (r.forecast[2].end - r.main.t) / DAY) : r.tIssueDays);
    const t0 = Math.min(0.01, r.tIssueDays / 10);
    const mc = r.completeness;
    const complete = r.inZone.filter((e) => e.mag != null && e.mag >= Math.max(mc.magCat, mc.F * r.main.mag - mc.G - mc.H * Math.log10(Math.max((e.t - r.main.t) / DAY, 1e-9))));
    const times = complete.map((e) => (e.t - r.main.t) / DAY).filter((t) => t > 0 && t <= tEnd).sort((a, b) => a - b);
    const nPts = 40, ts = []; for (let i = 0; i <= nPts; i++) ts.push(t0 * Math.pow(tEnd / t0, i / nPts));
    const exp = (a) => ts.map((t) => r.expectedAt(t, a));
    const mid = exp(r.posterior.aMid), lo = exp(r.posterior.aLo), hi = exp(r.posterior.aHi);
    const yMax = Math.max(1, times.length, hi[hi.length - 1]) * 1.08;
    const X = (t) => Pd.l + Math.log(t / t0) / Math.log(tEnd / t0) * (W - Pd.l - Pd.r), Y = (n) => H - Pd.b - n / yMax * (H - Pd.t - Pd.b);
    let g = '';
    const step = Math.pow(10, Math.floor(Math.log10(yMax))) * (yMax / Math.pow(10, Math.floor(Math.log10(yMax))) > 5 ? 2 : 1);
    for (let n = 0; n <= yMax; n += step) g += '<line x1="' + Pd.l + '" x2="' + (W - Pd.r) + '" y1="' + Y(n).toFixed(1) + '" y2="' + Y(n).toFixed(1) + '" class="as-grid"></line><text x="' + (Pd.l - 4) + '" y="' + (Y(n) + 3).toFixed(1) + '" class="as-ax" text-anchor="end">' + S(nf(n)) + '</text>';
    const ticks = [0.01, 0.1, 1, 10, 100, 1000].filter((t) => t >= t0 && t <= tEnd);
    for (const t of ticks) g += '<text x="' + X(t).toFixed(1) + '" y="' + (H - 5) + '" class="as-ax" text-anchor="middle">' + S(t < 1 ? (t * 24).toFixed(t < 0.1 ? 1 : 0) + L('h', '時間') : nf(t) + L('d', '日')) + '</text>';
    const band = 'M' + ts.map((t, i) => X(t).toFixed(1) + ',' + Y(hi[i]).toFixed(1)).join('L') + 'L' + ts.slice().reverse().map((t, i) => X(t).toFixed(1) + ',' + Y(lo[lo.length - 1 - i]).toFixed(1)).join('L') + 'Z';
    const line = 'M' + ts.map((t, i) => X(t).toFixed(1) + ',' + Y(mid[i]).toFixed(1)).join('L');
    const stair = (list, from, to) => { if (!list.length) return ''; let d = 'M' + X(Math.max(t0, from)).toFixed(1) + ',' + Y(list.filter((t) => t <= from).length).toFixed(1); let n = list.filter((t) => t <= from).length;
      for (const t of list) { if (t <= from || t > to) continue; d += 'L' + X(t).toFixed(1) + ',' + Y(n).toFixed(1); n++; d += 'L' + X(t).toFixed(1) + ',' + Y(n).toFixed(1); } return d + 'L' + X(to).toFixed(1) + ',' + Y(n).toFixed(1); };
    const before = stair(times, t0, r.tIssueDays), after = tEnd > r.tIssueDays * 1.01 ? stair(times, r.tIssueDays, tEnd) : '';
    const xi = X(r.tIssueDays);
    return '<div class="nint-sec">' + S(L('Aftershocks so far and the expected decay', 'これまでの余震と、予想される減り方')) + '</div>'
      + '<svg class="as-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + S(L('Cumulative aftershocks against the model', '余震の累積数とモデル')) + '">' + g
      + '<path d="' + band + '" class="as-band"></path><path d="' + line + '" class="as-exp"></path>'
      + (before ? '<path d="' + before + '" class="as-obs"></path>' : '') + (after ? '<path d="' + after + '" class="as-obs2"></path>' : '')
      + '<line x1="' + xi.toFixed(1) + '" x2="' + xi.toFixed(1) + '" y1="' + Pd.t + '" y2="' + (H - Pd.b) + '" class="as-now"></line></svg>'
      + '<div class="as-key"><span><i style="background:#ff9500"></i>' + S(L('recorded (M ≥ completeness)', '記録された余震（検知限界以上）')) + '</span><span><i style="background:#0a84ff"></i>' + S(L('expected, with 95% band', '予想（95% の幅）')) + '</span><span><i style="background:var(--text-muted)"></i>' + S(L('issue time', '見通しの時点')) + '</span></div>';
  }
  function factsHTML(r) {
    const reg = r.regime, par = r.params, post = r.posterior, mc = r.completeness;
    const regName = reg.source === 'region' ? reg.regime + ' — ' + L('a USGS California region', 'USGS のカリフォルニアの区域') : reg.regime + ' (' + reg.strec + ')';
    const li = (k, v) => '<li><span>' + S(k) + '</span> ' + S(v) + '</li>';
    let h = '<div class="nint-sec">' + S(L('What it stands on', 'この見通しの根拠')) + '</div><ul class="as-facts">';
    h += li(L('Tectonic regime:', '地殻変動の区分:'), regName);
    h += li(L('Generic parameters:', '一般的なパラメータ:'), 'b ' + par.b + ' · p ' + par.p + ' · c ' + par.c + ' ' + L('days', '日') + ' · a ' + post.priorMean.toFixed(2) + ' ± ' + post.priorSd.toFixed(2));
    h += li(L('Learned from this sequence:', 'この地震の余震から:'), L('{n} aftershocks used; a = {m} ± {s}', '{n} 個の余震を使用。a = {m} ± {s}').replace('{n}', nf(r.used)).replace('{m}', post.mean.toFixed(2)).replace('{s}', post.sd.toFixed(2))
      + (r.used < 5 ? ' — ' + L('too few to move the prior much', '少なく、事前分布からほとんど動いていません') : ''));
    h += li(L('Aftershock zone:', '余震域:'), L('{r} km around the centroid of {n} aftershocks (Wells & Coppersmith rupture length)', '{n} 個の余震の重心から半径 {r} km（Wells & Coppersmith の破壊長）').replace('{r}', nf(Math.round(r.zone.radiusKm))).replace('{n}', nf(r.zone.centroidFrom)));
    h += li(L('Catalogue completeness:', 'カタログの検知限界:'), 'M' + mc.magCat + ' (' + mc.region + ')' + (st.lowMag != null ? ' — ' + L('the read was limited to this floor (the sequence is larger than one read)', 'この下限で読み込みました（一度に読める件数を超えるため）') : ''));
    if (r.largestAfter) h += li(L('Largest aftershock so far:', 'これまでの最大余震:'), M(r.largestAfter.mag) + ' · ' + fmtUTC(r.largestAfter.t));
    return h + '</ul>';
  }
  function usgsHTML() {
    if (st.oafState === 'unreadable') return '<div class="as-usgs">' + S(L('USGS has published its own forecast for this earthquake, but it could not be read.', 'USGS はこの地震について独自の見通しを公表していますが、読み込めませんでした。')) + '</div>';
    const o = st.oaf; if (!o) return '';
    const wk = o.windows.find((w) => /week/i.test(w.label)) || o.windows[1];
    if (!wk) return '';
    const b = (m) => wk.bins.find((x) => x.mag === m);
    const part = [5, 6, 7].map((m) => b(m) ? 'M' + m + '+ ' + pct(b(m).probability) : '').filter(Boolean).join(' · ');
    return '<div class="as-usgs"><b>' + S(L('USGS\'s own forecast', 'USGS 自身の見通し')) + '</b> — ' + S(L('next week from {t}: {p}. Model: {m}. Shown beside IntMap\'s, not combined with it.', '{t} から 1 週間: {p}。モデル: {m}。IntMap の見通しとは別のもので、合算していません。')
      .replace('{t}', o.issued ? fmtUTC(o.issued) : '—').replace('{p}', part).replace('{m}', o.model || '—')) + '</div>';
  }
  function calHTML() {
    const c = st.cal;
    if (!c) return '<div class="nint-empty">…</div>';
    if (c.failed || !Array.isArray(c.score)) return '<div class="nint-empty">' + S(L('The test results could not be read.', '検証の結果を読み込めませんでした。')) + '</div>';
    const rows = c.score.filter((s) => s.mag === 5 || s.mag === 6 || s.mag === 7);
    let h = '<div class="as-cal"><div class="nint-sec">' + S(L('Tested on {n} earthquakes of M{m}+ ({a}–{b}), each forecast issued {d} day after', '{a}〜{b} 年の M{m} 以上の地震 {n} 件で検証（それぞれ本震の {d} 日後に出した見通し）')
      .replace('{n}', nf(c.set.count)).replace('{m}', c.set.minMag).replace('{a}', c.set.from.slice(0, 4)).replace('{b}', String(+c.set.to.slice(0, 4) - 1)).replace('{d}', c.set.issueDays)) + '</div>';
    h += '<table class="as-tab"><thead><tr><th></th>' + ['day', 'week', 'month', 'year'].map((k) => '<th>' + S(winLabel(k)) + '</th>').join('') + '</tr></thead><tbody>';
    for (const m of [5, 6, 7]) {
      h += '<tr><td>' + S('M' + m + '+') + '</td>' + ['day', 'week', 'month', 'year'].map((k) => { const s = rows.find((x) => x.window === k && x.mag === m); return '<td>' + (s ? '<span class="as-p">' + S(pct(s.meanP)) + '</span><span class="as-r">' + S(L('happened {h}', '実際 {h}').replace('{h}', pct(s.happened))) + '</span>' : '') + '</td>'; }).join('') + '</tr>';
    }
    h += '</tbody></table><div class="as-cap">' + S(L('Top: the average forecast chance of at least one; below: how often one actually happened. Equal numbers would be a perfectly calibrated forecast — this model runs high, most at M7+ and over longer windows, so read its larger numbers as upper-side estimates.',
      '上: 少なくとも 1 回起きる確率の予想の平均。下: 実際に起きた割合。両者が等しければ完全に較正された予測です。このモデルは高めに出る傾向があり、M7 以上や長い期間ほど大きく外れるので、大きな値は上振れ気味の見積もりとして読んでください。')) + '</div></div>';
    return h;
  }
  function listHTML(body) {
    const L0 = st.list || [];
    let h = '<div class="as-warn">' + S(L('Not an official forecast. For decisions follow your national agency (in Japan, the Japan Meteorological Agency).', '公式の予測ではありません。行動の判断は各国の機関の発表に従ってください（日本では気象庁）。')) + '</div>';
    h += '<div class="nint-sec">' + S(L('Earthquakes of M{m}+ in the last {d} days', '過去 {d} 日間の M{m} 以上の地震').replace('{m}', AS.LIST_MIN).replace('{d}', AS.LIST_DAYS)) + '</div>';
    if (!L0.length) h += '<div class="nint-empty">' + S(L('None in the USGS feed.', 'USGS のフィードにはありません。')) + '</div>';
    else h += '<ul class="nint-evs">' + L0.map((e) => '<li><button type="button" class="nint-ev" data-as-ev="' + S(e.id) + '"><span class="nint-ev-t">' + S(M(e.mag) + ' · ' + (e.place || '')) + '</span><span class="nint-ev-m">' + S(fmtUTC(e.t)) + '</span></button></li>').join('') + '</ul>';
    h += '<div class="nint-foot nint-cov">' + S(L('Or open it from any earthquake on the map (Earthquakes layer) or its earthquake record. Source: USGS (public domain).', '地図の地震（地震レイヤー）や「この場所の地震の記録」からも開けます。出典: USGS（パブリックドメイン）。')) + '</div>';
    body.innerHTML = h;
  }
  function failureLine() {
    const not = L(' — this does not mean there were no aftershocks', '（余震が無かったという意味ではありません）');
    const k = st.errKind;
    if (k === 'not-found') return L('USGS has no event with that id', 'その ID の地震は USGS のカタログにありません');
    if (k === 'too-small') return L('An aftershock forecast needs a mainshock of M{m} or more: below it the global catalogue records too few aftershocks to learn from.', '余震の見通しには M{m} 以上の本震が必要です（それより小さいと、全球のカタログに学べるだけの余震が記録されません）。').replace('{m}', AS.MIN_MAIN);
    if (k === 'none-near') return L('The USGS catalogue holds no earthquake of M{m} or more within {r} km of that place in the {d} days before the clock.', 'その場所の {r} km 以内には、時計の時刻までの {d} 日間に M{m} 以上の地震が USGS のカタログにありません。').replace('{m}', AS.MIN_MAIN).replace('{r}', '300').replace('{d}', AS.LIST_DAYS);
    if (k === 'timeout') return L('The USGS catalogue did not answer in time', 'USGS のカタログが時間内に応答しませんでした') + not;
    if (k === 'http') return L('The USGS catalogue refused the request', 'USGS のカタログが要求を拒否しました') + not;
    if (k === 'network') return L('The USGS catalogue could not be reached', 'USGS のカタログに到達できませんでした') + not;
    if (k === 'parse') return L('The forecast parameters could not be read', '予測のパラメータを読み込めませんでした');
    return L('The aftershock forecast could not be computed', '余震の見通しを計算できませんでした') + not;
  }

  /** summary() — what Atlas is handed */
  function summary() {
    const base = { ok: !st.err, open: st.open, error: st.err || null, errorKind: st.errKind, painted: st.painted, paintError: st.paintError || null, link: link() || null,
      clockBeforeMainshock: st.clockBefore || undefined, readFloorRaised: st.lowMag != null || undefined };
    if (st.list) return Object.assign(base, { chooser: st.list.slice(0, 15).map((e) => ({ id: e.id, magnitude: e.mag, place: e.place, time: new Date(e.t).toISOString() })) });
    if (!st.r) return base;
    const A = forAtlas(st.r);
    if (st.oaf) A.usgsForecast = { issued: st.oaf.issued ? new Date(st.oaf.issued).toISOString() : null, model: st.oaf.model,
      windows: st.oaf.windows.map((w) => ({ label: w.label, bins: w.bins.map((b) => ({ magnitudeAtLeast: b.mag, probabilityPercent: +(100 * b.probability).toFixed(1), count95: [b.lo, b.hi] })) })) };
    return Object.assign(base, A);
  }

  try { GE().events.on('styledata', () => { if (st.open && !GE().layers.hasSource(SRC)) paint(); }); } catch (_) { }
  try { bus.on('intmap-lang', () => setTimeout(() => { if (st.open) draw(); }, 30)); } catch (_) { }

  const API = { open, close, summary, link, toMoment, toNow, issueAt,
    isOpen: () => st.open,
    state: () => ({ open: st.open, loading: st.loading, error: st.err || null, errorKind: st.errKind, mainshock: st.main ? st.main.id : null,
      issued: st.r ? st.r.issueMs : null, used: st.r ? st.r.used : 0, chooser: st.list ? st.list.length : null, usgs: st.oafState, painted: st.painted, paintError: st.paintError || null }) };
  window.IntMapAftershock = API;
  return API;
}
