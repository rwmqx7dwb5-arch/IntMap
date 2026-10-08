/* ============================================================================
 *  IntMap · js/quake-history.js — THE EARTHQUAKE RECORD OF A PLACE, ON THE MAP AND THE CLOCK  (live-news-product)
 * ----------------------------------------------------------------------------
 *  «Is this one unusual here?» — the question a reader asks of a fresh quake pin or an earthquake headline. The
 *  earthquake popup's «Earthquake record here», the «Earthquakes nearby» section of the place card, a link
 *  `?qh=lat,lng,radius,floor[,event]`, the IntMapOS command `quakehistory.open` and Atlas `time.quakeHistory` all
 *  open the same card:
 *    · every catalogued earthquake within the radius at or above the floor, from the oldest entry ComCat holds to
 *      the latest (USGS ANSS ComCat — the instrumental ISC-GEM relocations from 1904 carry the early century);
 *    · when it was opened from a quake: where that quake stands — its rank on the record, the last one at least as
 *      large and how many years before;
 *    · a time × magnitude chart, the decades with the smallest magnitude each one recorded (the record's own
 *      statement of how much it misses), the ten largest;
 *    · THE MAP AND THE CLOCK ARE ONE: the circles on the map are the record UP TO THE MASTER CLOCK'S INSTANT
 *      (js/chronos.js), coloured by how long before that instant each one happened. «Show this moment» puts the
 *      clock on the instant of a chosen quake, so the map behind it is that day's world — 1923's borders under the
 *      Great Kantō earthquake — and a time-lapse played in Chronos replays the record as it accumulated.
 *  The facts are js/quake-history-core.js (node evaluates them); this file fetches, paints and words them.
 *  ⚠ NOTHING HERE ESTIMATES. No rate, no probability, no «overdue»: the card states what the catalogue holds and
 *    what the catalogue is (what was detected), and says so in its footer.
 *  ⚠ «COULD NOT READ» IS NEVER «NO EARTHQUAKES»: a failed read says which way it failed; an answered read with
 *    nothing in it says the record holds nothing at that floor.
 *  Lazy: js/lazy-modules.js `quakeHistory`; the doors are in js/wb-layers.js (boot). IntMap's words, en + jp.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { IntMapTime } from './chronos.js';
import { MapState } from './map-state.js';   /* (map-document-unify) the one link assembly (pageLink) */
import { jsonWithin } from './fetch-deadline.js';
import { QH, AGE_BANDS, queryUrl, eventUrl, readCount, floorFor, within, normalise, buildRecord, at, ageBand,
  ring, encodeLink, decodeLink, radiusStep, magStep, brief, forAtlas } from './quake-history-core.js';

/* the card's own rules — the .country-popup shell and the story card's chips, stats and bars come from css/intmap.css; these
   arrive with this chunk (not on the boot path: the eager stylesheet has a start-up budget, scripts/perf-budget.mjs). The dot
   colours are the map's (js/quake-history-core.js AGE_BANDS); the clock line is the story's playhead colour. */
const QH_CSS = [
  '.qh-chips{ display:flex; flex-direction:column; gap:6px; margin:0 0 8px; }',
  '.qh-note{ padding:6px 2px; }',
  '.qh-rank{ display:flex; flex-direction:column; gap:3px; margin:2px 0 8px; padding:10px 12px; border-radius:12px; background:var(--primary-tint,rgba(10,132,255,0.12)); font-size:12.5px; line-height:1.45; }',
  '.qh-rank b{ font-weight:650; color:var(--text-main); }',
  '.qh-rank span{ color:var(--text-muted); font-size:12px; }',
  '.qh-svg{ width:100%; height:auto; display:block; margin:2px 0 6px; }',
  '.qh-grid{ stroke:var(--glass-border,rgba(128,128,128,0.22)); stroke-width:0.6; }',
  '.qh-ax{ font-size:8.5px; fill:var(--text-muted); font-variant-numeric:tabular-nums; }',
  '.qh-dot{ stroke:rgba(255,255,255,0.75); stroke-width:0.5; cursor:pointer; }',
  '.qh-after{ stroke:var(--text-muted); stroke-width:0.7; opacity:0.45; cursor:pointer; }',
  '.qh-on{ stroke:#0a84ff; stroke-width:2.2; }',
  '.qh-decs{ height:40px; cursor:default; }',
  '.qh-key{ display:flex; flex-wrap:wrap; gap:4px 10px; margin:2px 0 8px; font-size:11.5px; color:var(--text-muted); }',
  '.qh-key span{ display:inline-flex; align-items:center; gap:5px; }',
  '.qh-key i{ width:9px; height:9px; border-radius:50%; display:inline-block; }',
  '.qh-sel{ margin:4px 0 8px; padding:10px 12px; border-radius:12px; background:var(--input-bg); }',
  '.qh-sel-t{ font-size:13px; font-weight:650; line-height:1.35; margin-bottom:2px; }',
  '.qh-sel-act{ display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; }',
  '.qh-moment{ min-height:36px; padding:6px 12px; border:0; border-radius:10px; background:#0a84ff; color:#fff; font-size:12.5px; font-weight:600; cursor:pointer; }',
  '.qh-at{ font-size:12px; font-weight:600; color:#0a84ff; }',
  '.qh-usgs{ display:inline-flex; align-items:center; text-decoration:none; }',
  '.qh-now{ margin:0 0 8px; }',
  '.qh-cap{ font-size:11.5px; color:var(--text-muted); line-height:1.45; margin:2px 0 8px; }',
].join(' ');
/* the credit the map source carries, so the map postcard and the attribution control name the catalogue that drew it */
export const QUAKE_RECORD_CREDIT = 'Earthquakes: USGS ANSS ComCat (public domain); ISC-GEM catalogue (ISC/GEM, CC BY-SA 3.0)';

export function quakeHistory(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const LOC = () => { try { return IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const nf = (v) => { try { return Number(v).toLocaleString(LOC()); } catch (_) { return String(v); } };
  const mag = (e) => (e && e.mag != null ? 'M' + e.mag.toFixed(1) : 'M?');
  /* a catalogue instant is UTC; the day is written in UTC and says so (a 1923 local time is not what the record states) */
  const fmtDay = (ms) => new Date(ms).toISOString().slice(0, 10);
  const fmtUTC = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const yearOf = (ms) => new Date(ms).getUTCFullYear();
  /* the read waits this long for USGS: measured 2026-10-08, the densest record tested took 2.6 s; a count is ~0.3 s.
     Unmade if ComCat's answer times move by an order of magnitude. */
  const READ_MS = 25000, COUNT_MS = 12000;
  const SRC = 'qh-src', RING = 'qh-ring', PT = 'qh-pt', SEL = 'qh-sel';

  const st = { open: false, seq: 0, loading: false, err: '', errKind: null, centre: null, name: '', radiusKm: QH.DEFAULT_RADIUS,
    askedMag: QH.DEFAULT_MAG, floor: null, anchor: null, rec: null, sel: null, painted: 0, paintError: '' };

  function clockMs() { try { const s = IntMapTime.state(); return s.isLive ? Date.now() : new Date(s.when).getTime(); } catch (_) { return Date.now(); } }
  function clockLive() { try { return IntMapTime.state().isLive; } catch (_) { return true; } }

  /* ── reading ComCat ───────────────────────────────────────────────────────────────────────────── */
  async function countAt(m) {
    try { return readCount(await jsonWithin(queryUrl('count', { lng: st.centre.lng, lat: st.centre.lat, radiusKm: st.radiusKm, minMag: m }), COUNT_MS)); }
    catch (_) { return null; }   /* an unanswered count does not stop the read: floorFor says the floor is unverified */
  }
  async function readEvent(id) {
    const j = await jsonWithin(eventUrl(id), COUNT_MS);
    return normalise(j && j.type === 'Feature' ? j : (j && j.features && j.features[0]));
  }

  /** open({ lng, lat, name, radiusKm, minMag, anchor, eventId }) — the record around a point, or around a quake
      (`anchor`: the popup's event; `eventId`: a ComCat id, read first). Resolves to the summary Atlas reads. */
  async function open(o) {
    const p = Object.assign({}, o || {});
    /* a link `?qh=…` (the boot door hands the search string over), and a feature handed over whole (the popup) */
    if (p.search) { const d = decodeLink(p.search); if (d) Object.assign(p, d); }
    if (p.feature && !p.anchor) p.anchor = normalise(p.feature);
    const my = ++st.seq;
    st.open = true; st.loading = true; st.err = ''; st.errKind = null; st.rec = null; st.sel = null; st.floor = null;
    st.radiusKm = radiusStep(p.radiusKm != null ? p.radiusKm : QH.DEFAULT_RADIUS);   /* a fresh open starts at the default; the chips re-read in place */
    st.askedMag = magStep(p.minMag != null ? p.minMag : QH.DEFAULT_MAG);
    st.anchor = p.anchor || null;
    st.name = String(p.name || '');
    if (isFinite(+p.lng) && isFinite(+p.lat)) st.centre = { lng: +p.lng, lat: +p.lat };
    show(); draw();
    try {
      if (!st.anchor && p.eventId) {
        st.anchor = await readEvent(p.eventId);
        if (my !== st.seq) return null;
        if (!st.anchor) throw Object.assign(new Error('no such event'), { reason: 'not-found' });
      }
      if (st.anchor) {
        if (!st.centre) st.centre = { lng: st.anchor.lng, lat: st.anchor.lat };
        if (!st.name) st.name = st.anchor.place || '';
        /* a quake below the asked floor is still ranked: the floor comes down to its step */
        if (st.anchor.mag != null && st.anchor.mag < st.askedMag) st.askedMag = magStep(st.anchor.mag);
      }
      if (!st.centre) throw Object.assign(new Error('no point'), { reason: 'no-point' });
      await load(my);
    } catch (e) { if (my === st.seq) { st.err = (e && e.message) || String(e); st.errKind = (e && e.reason) || 'failed'; } }
    if (my !== st.seq) return null;
    st.loading = false;
    draw(); paint(); fit();
    return summary();
  }
  async function load(my) {
    const floor = await floorFor(st.askedMag, countAt);
    if (my !== st.seq) return;
    const j = await jsonWithin(queryUrl('query', { lng: st.centre.lng, lat: st.centre.lat, radiusKm: st.radiusKm, minMag: floor.minMag }), READ_MS);
    if (my !== st.seq) return;
    const ev = within((j && j.features) || [], st.centre, st.radiusKm);
    st.floor = floor;
    st.rec = buildRecord(ev, { anchor: st.anchor, radiusKm: st.radiusKm, minMag: floor.minMag, centre: st.centre, now: Date.now() });
    st.sel = st.rec.anchor && st.rec.anchor.inRecord ? st.rec.anchor.event : null;
  }
  /** setRadius(km) / setFloor(m) — the reader's chips: read the record again at the new reach or floor */
  async function reread(patch) {
    if (!st.centre) return null;
    const my = ++st.seq;
    Object.assign(st, patch); st.loading = true; st.err = ''; st.errKind = null; draw();
    try { await load(my); } catch (e) { if (my === st.seq) { st.err = (e && e.message) || String(e); st.errKind = (e && e.reason) || 'failed'; } }
    if (my !== st.seq) return null;
    st.loading = false; draw(); paint(); fit();
    return summary();
  }
  const setRadius = (km) => reread({ radiusKm: radiusStep(km) });
  const setFloor = (m) => reread({ askedMag: magStep(m) });

  /* ── choosing one quake, and its moment ──────────────────────────────────────────────────────── */
  function find(id) { return st.rec ? st.rec.events.find((e) => e.id === id) || null : null; }
  /** select(id | 'largest') — the quake in the detail block and ringed on the map; the camera goes to it */
  function select(id) {
    if (!st.rec || !st.rec.n) return null;
    const e = id === 'largest' ? st.rec.largest[0] : find(String(id));
    if (!e) return null;
    st.sel = e;
    drawDyn(); paint();
    try { GE().camera.flyTo({ center: [e.lng, e.lat], zoom: Math.max(5, Math.min(7, +GE().camera.getZoom() || 5)), speed: 1.1 }); } catch (_) { }
    return brief(e);
  }
  /** toMoment(id?) — the master clock to the instant of the chosen quake: the whole map becomes that day's world */
  function toMoment(id) {
    const e = id ? find(String(id)) : st.sel;
    if (!e) return false;
    if (st.sel !== e) select(e.id);
    try { IntMapTime.set(new Date(e.t), { source: 'quake-history' }); return true; } catch (_) { return false; }
  }
  function toNow() { try { IntMapTime.setNow({ source: 'quake-history' }); return true; } catch (_) { return false; } }

  /* ── the map ─────────────────────────────────────────────────────────────────────────────────── */
  function whenDrawable(fn) {
    const can = () => { try { return !!HOST.canDraw(); } catch (_) { return false; } };
    if (can()) { fn(); return; }
    try { GE().whenCanDraw().then(fn); } catch (_) { }
  }
  function features() {
    if (!st.open || !st.rec || !st.centre) return [];
    const T = clockMs(), now = at(st.rec, T), out = [];
    out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring(st.centre, st.radiusKm) }, properties: { k: 'ring' } });
    /* the largest last, so a great quake is never under a swarm of small ones */
    const shown = now.shown.slice().sort((a, b) => (a.mag || 0) - (b.mag || 0));
    for (const e of shown) {
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
        properties: { k: 'q', id: e.id, m: e.mag != null ? e.mag : st.rec.minMag, b: ageBand(e.t, T), sel: st.sel && st.sel.id === e.id ? 1 : 0 } });
    }
    return out;
  }
  const colourExpr = () => ['match', ['get', 'b']].concat(AGE_BANDS.slice(0, -1).flatMap((b, i) => [i, b.colour]), [AGE_BANDS[AGE_BANDS.length - 1].colour]);
  function paint() {
    const data = { type: 'FeatureCollection', features: features() };
    whenDrawable(() => {
      try {
        if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
        else {
          GE().layers.addSource(SRC, { type: 'geojson', data, attribution: QUAKE_RECORD_CREDIT });
          GE().layers.add({ id: RING, type: 'line', source: SRC, filter: ['==', ['get', 'k'], 'ring'],
            paint: { 'line-color': '#ff9500', 'line-width': 1.6, 'line-opacity': 0.8, 'line-dasharray': [3, 2] } });
          GE().layers.add({ id: PT, type: 'circle', source: SRC, filter: ['==', ['get', 'k'], 'q'],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 4.5, 3, 6, 6, 7, 10, 8, 16, 9, 24],
              'circle-color': colourExpr(), 'circle-opacity': 0.82, 'circle-stroke-color': 'rgba(255,255,255,0.85)', 'circle-stroke-width': 0.8 } });
          GE().layers.add({ id: SEL, type: 'circle', source: SRC, filter: ['all', ['==', ['get', 'k'], 'q'], ['==', ['get', 'sel'], 1]],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'm'], 4.5, 9, 6, 12, 7, 16, 8, 22, 9, 30], 'circle-color': 'rgba(0,0,0,0)',
              'circle-stroke-color': '#0a84ff', 'circle-stroke-width': 3 } });
          wire();
        }
        [RING, PT, SEL].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', st.open ? 'visible' : 'none'); });
        /* ⚠ counted from the map, not from the intention (js/news-story.js's rule) */
        st.painted = GE().layers.has(PT) && st.open ? data.features.filter((f) => f.properties.k === 'q').length : 0;
        st.paintError = '';
      } catch (e) { st.painted = 0; st.paintError = (e && e.message) || 'paint_failed'; }
    });
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    try {
      GE().events.onLayer('mouseenter', PT, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
      GE().events.onLayer('mouseleave', PT, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
      GE().events.onLayer('click', PT, (ev) => {
        const f = ev && ev.features && ev.features[0]; const id = f && f.properties && f.properties.id;
        if (!id) return;
        try { GE().events.claimClick(ev); } catch (_) { }   /* the tap belongs to the record's quake, not to the live layer or a name beneath it */
        select(String(id));
      });
    } catch (_) { }
  }
  function fit() {
    if (!st.open || !st.centre) return;
    const pts = ring(st.centre, st.radiusKm, 24);
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    if (e - w > 180) { w = st.centre.lng - 10; e = st.centre.lng + 10; }   /* a ring across the antimeridian: frame the centre */
    whenDrawable(() => { try { GE().camera.fitBounds([[w, s], [e, n]], { padding: clearOfCard(), maxZoom: 8, duration: 900 }); } catch (_) { } });
  }
  /* framed in the part of the map the card does not cover (js/news-story.js measured the same need) */
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
    if (!document.getElementById('im-quake-history-css')) { const css = document.createElement('style'); css.id = 'im-quake-history-css'; css.textContent = QH_CSS; document.head.appendChild(css); }
    pop = document.createElement('div');
    pop.className = 'country-popup nint-popup qh-popup'; pop.id = 'qh-popup';
    pop.setAttribute('data-panel', 'quake-history');
    pop.setAttribute('role', 'dialog'); pop.setAttribute('tabindex', '-1'); pop.setAttribute('aria-labelledby', 'qh-title');
    /* (data-effect) the chips and rows READ; «Show this moment» moves the clock, and says so on its own button */
    pop.setAttribute('data-effect', 'none');
    pop.innerHTML = '<button class="country-popup-close" type="button" data-qh="close"></button>'
      + '<div class="country-popup-header" id="qh-head"></div><div id="qh-chips" class="qh-chips"></div><div id="qh-body"></div>';
    (document.getElementById('map-container') || document.body).appendChild(pop);
    try { HOST.makeDraggable(pop, pop.querySelector('#qh-head')); } catch (_) { }
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
    if (t.closest('[data-qh="close"]')) { close(); return; }
    const r = t.closest('[data-qh-r]'); if (r) { setRadius(+r.getAttribute('data-qh-r')); return; }
    const m = t.closest('[data-qh-m]'); if (m) { setFloor(+m.getAttribute('data-qh-m')); return; }
    if (t.closest('[data-qh="moment"]')) { toMoment(); return; }
    if (t.closest('[data-qh="now"]')) { toNow(); return; }
    if (t.closest('[data-qh="link"]')) { copyLink(); return; }
    if (t.closest('[data-qh="shake"]')) { openShake(); return; }
    const e = t.closest('[data-qh-ev]'); if (e) { select(e.getAttribute('data-qh-ev')); }
  }
  async function openShake() {
    const e = st.sel; if (!e) return;
    try { await window.IntMapLazy.need('shakeMap'); await window.IntMapShakeMap.show(e.id); }
    catch (err) { try { HOST.imToast(err && err.code === 'NO_SHAKEMAP' ? L('USGS published no ShakeMap for this earthquake', 'この地震について USGS は ShakeMap を公開していません') : L('Could not load the ShakeMap', 'ShakeMap を取得できませんでした')); } catch (_) { } }
  }
  function link() {
    if (!st.centre) return '';
    const q = '?' + encodeLink({ lat: st.centre.lat, lng: st.centre.lng, radiusKm: st.radiusKm, minMag: st.askedMag, eventId: st.anchor && st.anchor.id });
    let h = ''; try { h = MapState.hash(); } catch (_) { h = ''; }
    return MapState.pageLink(q, h) || q;
  }
  async function copyLink() {
    const u = link(); if (!u) return;
    try { await navigator.clipboard.writeText(u); HOST.imToast(L('Link to this earthquake record copied', 'この地震の記録へのリンクをコピーしました')); }
    catch (_) { try { HOST.imToast(u); } catch (_) { } }
  }
  function close() {
    st.seq++; st.open = false; st.loading = false;
    if (pop) pop.style.display = 'none';
    paint();
  }

  const placeLine = () => st.name || (st.centre ? st.centre.lat.toFixed(2) + ', ' + st.centre.lng.toFixed(2) : '');
  function draw() {
    const e = ensurePop();
    const x = e.querySelector('[data-qh="close"]'); x.textContent = '×'; x.title = L('Close', '閉じる'); x.setAttribute('aria-label', L('Close', '閉じる'));
    const fl = st.floor ? st.floor.minMag : st.askedMag;
    e.querySelector('#qh-head').innerHTML = '<div class="nint-h-title" id="qh-title">' + S(L('Earthquake record here', 'この場所の地震の記録')) + '</div><div class="nint-h-sub">'
      + S([placeLine(), L('within {r} km · M{m}+', '{r} km 以内・M{m} 以上').replace('{r}', String(st.radiusKm)).replace('{m}', String(fl))].filter(Boolean).join(' · ')) + '</div>';
    const chip = (attr, v, on, label) => '<button type="button" class="nst-chip' + (on ? ' on' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" ' + attr + '="' + S(v) + '">' + S(label) + '</button>';
    e.querySelector('#qh-chips').innerHTML = '<div class="nst-chips" role="group" aria-label="' + S(L('Radius', '半径')) + '">' + QH.RADII.map((r) => chip('data-qh-r', r, r === st.radiusKm, r + ' km')).join('') + '</div>'
      + '<div class="nst-chips" role="group" aria-label="' + S(L('Smallest magnitude', '最小マグニチュード')) + '">' + QH.MAGS.map((m) => chip('data-qh-m', m, m === st.askedMag, 'M' + m + '+')).join('') + '</div>';
    built = -1;
    drawDyn();
  }
  let built = -1;
  function drawDyn() {
    const e = ensurePop(); const body = e.querySelector('#qh-body');
    const msg = (t) => { built = -1; body.innerHTML = '<div class="nint-empty">' + S(t) + '</div>'; };
    if (st.loading) return msg(L('Reading the USGS catalogue…', 'USGS のカタログを読んでいます…'));
    if (st.err) return msg(failureLine());
    const R = st.rec; if (!R) return msg('');
    if (!R.n) return msg(L('The USGS catalogue holds no earthquake of M{m} or more within {r} km of this point. That is an answer from the catalogue, not a failure to read it.', 'USGS のカタログには、この地点の {r} km 以内に M{m} 以上の地震の記録がありません（読み込めなかったのではなく、カタログの答えです）。')
      .replace('{m}', String(R.minMag)).replace('{r}', String(R.radiusKm)));
    const T = clockMs(), live = clockLive(), now = at(R, T);
    if (built !== st.seq || !body.querySelector('.qh-dyn')) {
      built = st.seq;
      let h = '';
      const F = st.floor;
      if (F && F.raised) h += '<div class="nint-empty qh-note">' + S(L('M{a}+ holds {n} records here — more than one read brings ({cap}) — so the record is shown from M{m}. Choose a smaller radius to go lower.', 'ここでは M{a} 以上の記録が {n} 件あり、一度に読める件数（{cap} 件）を超えるので、M{m} 以上で表示しています。下げるには半径を小さくしてください。')
        .replace('{a}', String(F.asked)).replace('{n}', nf(F.counts[F.asked])).replace('{cap}', nf(QH.CAP)).replace('{m}', String(F.minMag))) + '</div>';
      if (F && F.cut) h += '<div class="nint-empty qh-note">' + S(L('Even at M{m} the record is larger than one read; these are the first {cap} in time.', 'M{m} 以上でも一度に読める件数を超えるため、古い順に {cap} 件を表示しています。').replace('{m}', String(F.minMag)).replace('{cap}', nf(QH.CAP))) + '</div>';
      if (F && F.unknown) h += '<div class="nint-empty qh-note">' + S(L('USGS did not answer how many records there are, so this read may be cut at {cap}.', 'USGS が件数に答えなかったため、この表示は {cap} 件で切れている可能性があります。').replace('{cap}', nf(QH.CAP))) + '</div>';
      const big = R.largest[0];
      h += '<div class="nst-spread"><div><b>' + S(nf(R.n)) + '</b><span>' + S(L('earthquakes on record', '件の記録')) + '</span></div><div><b>' + S(String(yearOf(R.firstAt))) + '</b><span>'
        + S(L('first record', '記録の始まり')) + '</span></div><div><b>' + S(big ? mag(big) : '—') + '</b><span>' + S(big ? L('largest, {y}', '最大・{y} 年').replace('{y}', String(yearOf(big.t))) : '') + '</span></div></div>';
      h += '<div class="qh-anchor"></div><div class="qh-chart"></div><div class="qh-dec"></div>';
      h += '<div class="qh-dyn"></div>';
      h += '<div class="nint-sec">' + S(L('The largest on record', '記録上の大きい順')) + '</div><ul class="nint-evs qh-top"></ul>';
      h += '<div class="nint-foot nint-cov">' + S(L('Source: USGS ANSS Comprehensive Earthquake Catalog (ComCat), public domain; entries before the global networks are mostly the ISC-GEM Global Instrumental Earthquake Catalogue (ISC/GEM Foundation, CC BY-SA 3.0). A catalogue holds what was detected and located: older decades miss smaller earthquakes, so fewer records is not fewer earthquakes. IntMap computes no rate or probability from it. Times are UTC.',
        '出典: USGS ANSS 総合地震カタログ（ComCat、パブリックドメイン）。世界的な観測網より前の記録の多くは ISC-GEM 全球計器地震カタログ（ISC/GEM 財団、CC BY-SA 3.0）。カタログは検知・決定できた地震の記録なので、古い年代ほど小さい地震が欠けています（記録が少ないことは地震が少なかったことを意味しません）。IntMap はここから頻度や確率を計算しません。時刻は UTC です。')) + '</div>';
      h += '<div class="nint-foot nint-cov">' + S(L('The point sent to USGS is rounded to whole degrees and the radius widened to cover it; the exact circle is applied on this device.', 'USGS に送る地点は整数度に丸め、半径をその分だけ広げています。正確な円での絞り込みはこの端末で行います。')) + '</div>';
      h += '<div class="nst-share"><button type="button" class="nst-link" data-qh="link">' + S(L('Copy link to this record', 'この記録へのリンクをコピー')) + '</button></div>';
      body.innerHTML = h;
      body.querySelector('.qh-dec').innerHTML = decadesHTML(R);
      body.querySelector('.qh-top').innerHTML = R.largest.map(evHTML).join('');
    }
    body.querySelector('.qh-anchor').innerHTML = anchorHTML(R);
    body.querySelector('.qh-chart').innerHTML = chartSVG(R, T, live);
    /* the clock's part: what the record held at the master clock's instant, and the chosen quake */
    let d = '';
    d += '<div class="nst-day">' + S(live ? L('Now: {n} on record', 'いま: {n} 件の記録').replace('{n}', nf(R.n))
      : L('At {d}: {n} on record by then, {a} after', '{d} の時点: それまでの記録 {n} 件（以後 {a} 件）').replace('{d}', fmtDay(T)).replace('{n}', nf(now.shown.length)).replace('{a}', nf(now.after))) + '</div>';
    if (now.last) d += '<div class="nst-origin">' + S(L('Last before this instant: {m} on {d}, {p}', 'この時刻の直前: {d}・{m}・{p}').replace('{m}', mag(now.last)).replace('{d}', fmtDay(now.last.t)).replace('{p}', now.last.place || '—')) + '</div>';
    d += '<div class="qh-key" aria-label="' + S(L('Colour: how long before the clock', '色: 時計の時刻から何年前か')) + '">' + AGE_BANDS.map((b, i) => '<span><i style="background:' + S(b.colour) + '"></i>' + S(bandLabel(i)) + '</span>').join('') + '</div>';
    if (st.sel) d += selHTML(st.sel, live);
    if (!live) d += '<button type="button" class="nst-all qh-now" data-qh="now">' + S(L('Back to now', 'いまに戻す')) + '</button>';
    body.querySelector('.qh-dyn').innerHTML = d;
  }
  function bandLabel(i) {
    const b = AGE_BANDS[i];
    if (i === 0) return L('within a year', '1年以内');
    if (b.maxYears === Infinity) return L('earlier', 'それ以前');
    return L('within {n} years', '{n}年以内').replace('{n}', String(b.maxYears));
  }
  function anchorHTML(R) {
    const A = R.anchor; if (!A) return '';
    const e = A.event;
    if (!A.inRecord) return '<div class="qh-rank">' + S(L('This earthquake ({m}) is below the floor shown, so it is not ranked here.', 'この地震（{m}）は表示中の下限より小さいため、ここでは順位を出していません。').replace('{m}', mag(e))) + '</div>';
    let t = A.largestOnRecord
      ? (A.same ? L('{m}: the largest on this record (tied with {s} other).', '{m}: この記録で最大（ほかに同じ規模 {s} 件）。').replace('{s}', nf(A.same)) : L('{m}: the largest on this record.', '{m}: この記録で最大です。'))
      : L('{m}: number {r} on this record — {l} larger since {y}.', '{m}: この記録で {r} 番目の大きさ（{y} 年以降、これより大きいのは {l} 件）。').replace('{r}', nf(A.rank)).replace('{l}', nf(A.larger)).replace('{y}', String(yearOf(R.firstAt)));
    t = t.replace('{m}', mag(e));
    let h = '<div class="qh-rank"><b>' + S(t) + '</b>';
    if (A.prev) h += '<span>' + S(L('The last one at least as large: {d}, {m} ({y} years before).', '同じかそれ以上の規模の前回: {d}・{m}（{y} 年前）。').replace('{d}', fmtDay(A.prev.t)).replace('{m}', mag(A.prev)).replace('{y}', A.yearsSincePrev < 1 ? '<1' : nf(Math.round(A.yearsSincePrev)))) + '</span>';
    else h += '<span>' + S(L('Nothing at least as large before it on this record.', 'この記録では、これより前に同じかそれ以上の規模はありません。')) + '</span>';
    if (A.next) h += '<span>' + S(L('The next at least as large: {d}, {m}.', '次に同じかそれ以上: {d}・{m}。').replace('{d}', fmtDay(A.next.t)).replace('{m}', mag(A.next))) + '</span>';
    return h + '</div>';
  }
  /* time × magnitude: every record as a dot, the clock's instant as a line, the records after it hollow */
  function chartSVG(R, T, live) {
    const W = 320, H = 116, P = { l: 26, r: 6, t: 6, b: 16 };
    const t0 = Date.UTC(yearOf(R.firstAt), 0, 1), t1 = Math.max(Date.now(), R.lastAt), m0 = Math.floor(R.minMag);
    const m1 = Math.max(m0 + 1, Math.ceil(Math.max(...R.events.map((e) => e.mag || 0))));
    const X = (t) => P.l + (t - t0) / Math.max(1, t1 - t0) * (W - P.l - P.r), Y = (m) => H - P.b - (m - m0) / (m1 - m0) * (H - P.t - P.b);
    let g = '';
    for (let m = m0; m <= m1; m++) g += '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + Y(m).toFixed(1) + '" y2="' + Y(m).toFixed(1) + '" class="qh-grid"></line><text x="' + (P.l - 4) + '" y="' + (Y(m) + 3).toFixed(1) + '" class="qh-ax" text-anchor="end">' + S(m) + '</text>';
    let dots = '';
    const order = R.events.slice().sort((a, b) => (a.mag || 0) - (b.mag || 0));
    for (const e of order) {
      const after = e.t > T, m = e.mag != null ? e.mag : R.minMag, r = Math.max(1.6, (m - m0 + 0.6) * 1.5);
      const col = after ? 'none' : AGE_BANDS[ageBand(e.t, T)].colour;
      dots += '<circle data-qh-ev="' + S(e.id) + '" cx="' + X(e.t).toFixed(1) + '" cy="' + Y(m).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="' + S(col) + '" class="' + (after ? 'qh-after' : 'qh-dot') + (st.sel && st.sel.id === e.id ? ' qh-on' : '') + '"><title>' + S(fmtDay(e.t) + ' · ' + mag(e) + ' · ' + (e.place || '')) + '</title></circle>';
    }
    const cx = X(Math.min(T, t1));
    const axis = '<text x="' + P.l + '" y="' + (H - 3) + '" class="qh-ax">' + S(yearOf(t0)) + '</text><text x="' + (W - P.r) + '" y="' + (H - 3) + '" class="qh-ax" text-anchor="end">' + S(yearOf(t1)) + '</text>';
    return '<svg class="qh-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + S(L('Every record by year and magnitude', '年と規模ごとのすべての記録')) + '">' + g + dots
      + (live ? '' : '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + P.t + '" y2="' + (H - P.b) + '" class="nst-head"></line>') + axis + '</svg>';
  }
  /* the decades, with the smallest magnitude each recorded — the record's own statement of what it misses */
  function decadesHTML(R) {
    const D = R.decades; if (!D.length) return '';
    const max = Math.max(1, ...D.map((d) => d.n)), W = 320, H = 40, bw = W / D.length;
    let bars = '';
    D.forEach((d, i) => {
      const h = d.n ? Math.max(2, Math.round(d.n / max * (H - 4))) : 0;
      bars += '<rect x="' + (i * bw + 0.5).toFixed(1) + '" y="' + (H - h) + '" width="' + Math.max(1, bw - 1.5).toFixed(1) + '" height="' + h + '" class="nst-bar-past"><title>'
        + S(L('{d}s: {n} records, smallest M{m}', '{d} 年代: {n} 件・最小 M{m}').replace('{d}', String(d.decade)).replace('{n}', nf(d.n)).replace('{m}', d.minMag != null ? d.minMag.toFixed(1) : '—')) + '</title></rect>';
    });
    const withMin = D.filter((d) => d.minMag != null);
    let cap = L('Records per decade (UTC)', '年代ごとの記録数（UTC）');
    if (withMin.length > 1) {
      const a = withMin[0], b = withMin[withMin.length - 1];
      if (a.minMag > b.minMag) cap = L('Records per decade — the smallest recorded was M{a} in the {da}s and M{b} in the {db}s: the record grew finer, not the Earth busier', '年代ごとの記録数——記録された最小の規模は {da} 年代 M{a}、{db} 年代 M{b}。増えたのは観測の細かさです')
        .replace('{a}', a.minMag.toFixed(1)).replace('{da}', String(a.decade)).replace('{b}', b.minMag.toFixed(1)).replace('{db}', String(b.decade));
    }
    return '<svg class="nst-time qh-decs" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + S(L('Records per decade', '年代ごとの記録数')) + '">' + bars + '</svg>'
      + '<div class="nint-spark-lbl"><span>' + S(D[0].decade) + '</span><span>' + S(D[D.length - 1].decade) + '</span></div><div class="qh-cap">' + S(cap) + '</div>';
  }
  function evHTML(e) {
    const meta = [fmtDay(e.t), e.depthKm != null ? L('depth {d} km', '深さ {d} km').replace('{d}', String(Math.round(e.depthKm))) : null, e.km != null ? L('{k} km away', '{k} km 先').replace('{k}', nf(e.km)) : null].filter(Boolean).join(' · ');
    return '<li><button type="button" class="nint-ev' + (st.sel && st.sel.id === e.id ? ' nst-seed' : '') + '" data-qh-ev="' + S(e.id) + '"><span class="nint-ev-t">' + S(mag(e) + ' · ' + (e.place || '')) + '</span><span class="nint-ev-m">' + S(meta) + '</span></button></li>';
  }
  function selHTML(e, live) {
    const atIt = !live && Math.abs(clockMs() - e.t) < 60000;
    let h = '<div class="qh-sel"><div class="qh-sel-t">' + S(mag(e) + (e.magType ? ' (' + e.magType + ')' : '') + ' · ' + (e.place || '')) + '</div>'
      + '<div class="nint-ev-m">' + S([fmtUTC(e.t), e.depthKm != null ? L('depth {d} km', '深さ {d} km').replace('{d}', String(Math.round(e.depthKm))) : null, e.tsunami ? L('USGS tsunami flag', 'USGS の津波フラグあり') : null].filter(Boolean).join(' · ')) + '</div>'
      + '<div class="qh-sel-act">';
    h += atIt ? '<span class="qh-at">' + S(L('The map shows this moment', '地図はこの瞬間です')) + '</span>'
      : '<button type="button" class="qh-moment" data-qh="moment" data-time-intent="1">' + S(L('Show this moment', 'この瞬間の地図にする')) + '</button>';
    if (e.shakemap) h += '<button type="button" class="nst-all" data-qh="shake">' + S(L('Ground shaking (ShakeMap)', '揺れの分布（ShakeMap）')) + '</button>';
    if (e.url) h += '<a class="nst-all qh-usgs" href="' + S(window.IntMapSafe.url(e.url)) + '" target="_blank" rel="noopener">' + S(L('USGS event page', 'USGS の地震ページ')) + '</a>';
    return h + '</div></div>';
  }
  function failureLine() {
    const not = L(' — this does not mean there were no earthquakes', '（地震が無かったという意味ではありません）');
    const k = st.errKind;
    if (k === 'not-found') return L('USGS has no event with that id', 'その ID の地震は USGS のカタログにありません');
    if (k === 'no-point') return L('Which place? Open it from an earthquake, a place card or give coordinates.', 'どの場所ですか？地震・地点カードから開くか、座標を指定してください。');
    if (k === 'timeout') return L('The USGS catalogue did not answer in time', 'USGS のカタログが時間内に応答しませんでした') + not;
    if (k === 'http') return L('The USGS catalogue refused the request', 'USGS のカタログが要求を拒否しました') + not;
    if (k === 'network') return L('The USGS catalogue could not be reached', 'USGS のカタログに到達できませんでした') + not;
    return L('The USGS catalogue could not be read', 'USGS のカタログを読めませんでした') + not;
  }

  /** summary() — what Atlas is handed: the record's facts at the clock's instant, the floor and why, and its failures */
  function summary() {
    const base = { ok: !st.err, open: st.open, place: placeLine(), centre: st.centre, radiusKm: st.radiusKm, askedMinMagnitude: st.askedMag,
      error: st.err || null, errorKind: st.errKind, painted: st.painted, paintError: st.paintError || null, link: link() || null,
      selected: brief(st.sel) };
    if (!st.rec) return Object.assign(base, { events: 0 });
    return Object.assign(base, forAtlas(st.rec, clockLive() ? null : clockMs(), st.floor));
  }

  /* the clock moves the record: repaint and reword on every change while the card is open (one per frame) */
  let raf = 0;
  try { IntMapTime.on(() => { if (!st.open || raf) return; raf = requestAnimationFrame(() => { raf = 0; if (st.open && st.rec) { drawDyn(); paint(); } }); }); } catch (_) { }
  /* a basemap swap discards the layers (js/news-story.js listens to the same signal) */
  try { GE().events.on('styledata', () => { if (st.open && !GE().layers.hasSource(SRC)) { wired = false; paint(); } }); } catch (_) { }
  try { bus.on('intmap-lang', () => setTimeout(() => { if (st.open) draw(); }, 30)); } catch (_) { }

  const API = { open, close, select, toMoment, toNow, setRadius, setFloor, summary, link,
    isOpen: () => st.open,
    state: () => ({ open: st.open, loading: st.loading, error: st.err || null, errorKind: st.errKind, events: st.rec ? st.rec.n : 0,
      radiusKm: st.radiusKm, minMag: st.floor ? st.floor.minMag : null, askedMag: st.askedMag, selected: st.sel ? st.sel.id : null,
      painted: st.painted, paintError: st.paintError || null }) };
  window.IntMapQuakeHistory = API;
  return API;
}
