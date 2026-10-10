/* ============================================================================
 *  IntMap · js/news-intel.js — THE NEWS PULSE, THE COUNTRY BRIEF, COMPANIES IN THE NEWS  (news-intelligence)
 * ----------------------------------------------------------------------------
 *  「いま世界で何が起きているか」を地図で毎日読む形。三つの読み口が、同じ出来事の表を別の角度から読む:
 *
 *    ① NEWS PULSE (Layers row dl-newspulse) — every country shaded by how many news EVENTS were first
 *       reported there in the last 1 / 3 / 7 / 14 days, or by how much that rose over the days before.
 *       It follows Chronos: drag the clock back three weeks and the map shows that week's news.
 *    ② COUNTRY BRIEF — click a country (or a row of the legend, or ask Atlas): its count and change,
 *       30 days of new events a day, the categories, the most-reported events (they open in the same
 *       event reader as the News list), and the internet outages IODA measured there in the same days,
 *       each beside the news first reported in that country around it.
 *    ③ COMPANIES IN THE NEWS — the company panel's «News» tab reads which events name a company
 *       (public.news_event_entities) and draws a line from the company's nearest site to each event.
 *
 *  ⚠ NOTHING HERE DECIDES A FACT. The counting, the country of a point, the change, the outage↔news tie
 *    and the ingest verdict are js/news-intel-core.js (node evaluates them on production data); what an
 *    event IS is the server's clustering (docs/NEWS-EVENTS.md); which company a headline names is
 *    supabase/functions/_shared/news-entities.js. This file fetches, paints and words.
 *  ⚠ A COUNT IS NOT A JUDGEMENT. The pulse counts what 32 feeds of the Source Registry reported; a country
 *    those feeds do not cover is pale because it is not covered, not because nothing happened. The legend
 *    says so in those words, and so does Atlas (news.pulse).
 *  ⚠ IODA IS READ LIVE AND NEVER STORED (js/net-health-live.js `outageEvents`, docs/INTERNET-HEALTH.md §8).
 *  Lazy: js/lazy-modules.js `newsIntel`; the Layers row and the doors are js/news-pulse.js (boot).
 *  IntMap's own words, en + jp (CONSTITUTION.md §7); category names are js/news-events.js's.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { IntMapTime } from './chronos.js';
import { everyTick, stopTick } from './runtime.js';
import { makeCountryIndex, decodePulse, aggregate, rank, shade, change, linkOutages, outageOf, isIso2, countryKeyOf, arc, km } from './news-intel-core.js';
import { freshChip } from './freshness.js';

export function newsIntel(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const LOC = () => { try { return IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const nf = (v) => { try { return Number(v).toLocaleString(LOC()); } catch (_) { return String(v); } };
  const fmtDT = (ms) => { try { return new Date(ms).toLocaleString(LOC(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return new Date(ms).toISOString(); } };
  const fmtD = (ms) => { try { return new Date(ms).toLocaleDateString(LOC(), { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (_) { return new Date(ms).toISOString().slice(0, 10); } };
  const DAY = 86400000;

  const ROW = 'dl-newspulse', KEY = 'newspulse';
  const SRC = 'nint-src', FILL = 'nint-fill', LINE = 'nint-line';
  const CO_SRC = 'nint-co-src', CO_LINE = 'nint-co-line', CO_PT = 'nint-co-pt';
  const WINDOWS = [1, 3, 7, 14];
  /* one fetch answers every window and its comparison (2 × 14 = 28 days) and the brief's 30-day series */
  const SPAN_DAYS = 30;
  /* the news collection runs every 20 minutes (supabase/migrations/20261003160000_news_intelligence.sql);
     asking twice per run is the most that can show anything new. Expires with that schedule. */
  const REFRESH_MS = 10 * 60 * 1000;
  const RAMP_VOL = [0, '#e7e3f7', 0.35, '#a99ae0', 0.7, '#6a4fc9', 1, '#35208a'];
  const RAMP_UP = [0, '#fde8c8', 0.35, '#f6b26b', 0.7, '#e06c2c', 1, '#a32a12'];

  const st = { on: false, w: 7, mode: 'volume', cat: 'all', pulse: null, pulseKey: '', agg: null, err: '', loading: false,
    painted: 0, paintError: '', timer: null, briefKey: '', briefSeq: 0, oldest: null, newest: null };

  /* ── the clock ──────────────────────────────────────────────────────────────────────────────────
     ⚠ `clockUntil` IS WHERE THE LAYER APPLIES CHRONOS (js/layer-time-decl.js names it): the window ends at
     the master clock's instant — now on the live clock, the chosen instant otherwise. */
  function clockUntil() {
    try { return IntMapTime.nowMs(); } catch (_) { return Date.now(); }
  }
  const isLive = () => { try { return !!IntMapTime.state().isLive; } catch (_) { return true; } };

  /* ── the country outlines: 10 m to say which country a point is in (js/news-intel-core.js COAST_KM is
        measured against it), 50 m to paint (the 10 m outline is 548,000 vertices — js/countries-ui.js) ── */
  let geoP = null;
  function geo() {
    if (!geoP) {
      /* ⚠ THE OUTLINES ARE READ THROUGH THE BOOT FACADE, NOT BY IMPORTING js/ne-countries.js HERE. MEASURED (vite build,
         2026-10-03): the static import made js/ne-countries.js a module shared by main and this lazy chunk, and Rolldown
         then refused to fold js/fetch-deadline.js and js/proxy-fetch.js back into main (the cycle rule vite.config.js
         records) — eager requests 9 → 11. The facade (js/news-pulse.js, eager) hands over the same loader. */
      const load = window.IntMapNewsIntel.outlines;
      geoP = Promise.all([load('10m'), load('50m')]).then(([fine, paint]) => {
        const index = makeCountryIndex((fine && fine.features) || []);
        const shapes = new Map();
        for (const f of ((paint && paint.features) || [])) {
          const k = countryKeyOf(f.properties); if (!k || !f.geometry) continue;
          const list = shapes.get(k) || []; list.push(f.geometry); shapes.set(k, list);
        }
        return { index, shapes };
      }).catch((e) => { geoP = null; throw e; });
    }
    return geoP;
  }
  function countryName(k) {
    if (isIso2(k)) { try { const n = new Intl.DisplayNames([LOC()], { type: 'region' }).of(k); if (n && n !== k) return n; } catch (_) { } }
    return st.index ? st.index.name(k) : k;
  }

  /* ── the data ─────────────────────────────────────────────────────────────────────────────────── */
  async function fetchPulse(untilMs) {
    if (!HOST.DB || typeof HOST.DB.rpc !== 'function') throw new Error('no database client');
    const dayStart = Date.parse(new Date(untilMs).toISOString().slice(0, 10) + 'T00:00:00Z');
    const since = new Date(dayStart - (SPAN_DAYS - 1) * DAY).toISOString();
    /* a read: sent as GET (PostgREST runs it read-only) */
    const { data, error } = await HOST.DB.rpc('news_pulse', { p_since: since, p_until: new Date(untilMs).toISOString() }, { get: true });
    if (error) throw error;
    return decodePulse(data);
  }
  /* the pulse for the clock's instant — fetched again when the clock moves to another day, or (on the live
     clock) when the last fetch is older than REFRESH_MS */
  async function ensurePulse(force) {
    const until = clockUntil();
    const key = new Date(until).toISOString().slice(0, 10) + (isLive() ? ':live' : '');
    if (!force && st.pulse && st.pulseKey === key && (!isLive() || Date.now() - st.fetchedAt < REFRESH_MS)) return st.pulse;
    /* ⚠ ONE REQUEST PER DAY OF THE CLOCK IN FLIGHT: the row's switch and an Atlas question arrive in the same
       tick (news.pulse ticks the box, then asks for the ranking) — both wait on the same answer */
    if (st.inflight && st.inflightKey === key) return st.inflight;
    st.inflightKey = key;
    st.inflight = loadPulse(until, key).finally(() => { st.inflight = null; });
    return st.inflight;
  }
  async function loadPulse(until, key) {
    const G = await geo();
    st.index = G.index;
    st.loading = true;
    try {
      st.pulse = await fetchPulse(until);
      st.pulseKey = key; st.fetchedAt = Date.now(); st.err = '';
      st.oldest = st.pulse.oldest ? Date.parse(st.pulse.oldest) : null;
      st.newest = st.pulse.newest ? Date.parse(st.pulse.newest) : null;
      /* the bounds of the record, as it reports them (js/layer-time.js: a bound read at run time) */
      try { if (window.IntMapLayerTime && st.oldest) window.IntMapLayerTime.range(ROW, { from: new Date(st.oldest).toISOString(), to: new Date(st.newest || Date.now()).toISOString(), by: 'public.news_pulse (oldest / newest first_published_at)' }); } catch (_) { }
    } catch (e) {
      st.err = (e && e.message) || String(e);
      throw e;
    } finally { st.loading = false; }
    return st.pulse;
  }
  function compute() {
    if (!st.pulse || !st.index) { st.agg = null; return null; }
    st.agg = aggregate(st.pulse, st.index, { untilMs: clockUntil(), windowDays: st.w, category: st.cat, seriesDays: SPAN_DAYS });
    return st.agg;
  }

  /* ── painting ─────────────────────────────────────────────────────────────────────────────────── */
  let shapesCache = null;
  function paint() {
    const feats = [];
    if (st.on && st.agg && shapesCache) {
      const v = shade(st.agg, st.mode);
      for (const [k, val] of v) {
        for (const g of (shapesCache.get(k) || [])) feats.push({ type: 'Feature', geometry: g, properties: { k, v: val } });
      }
    }
    const data = { type: 'FeatureCollection', features: feats };
    const ramp = ['interpolate', ['linear'], ['get', 'v']].concat(st.mode === 'rising' ? RAMP_UP : RAMP_VOL);
    try {
      if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
      else {
        GE().layers.addSource(SRC, { type: 'geojson', data });
        GE().layers.add({ id: FILL, type: 'fill', source: SRC, paint: { 'fill-color': ramp, 'fill-opacity': 0.62 } });
        GE().layers.add({ id: LINE, type: 'line', source: SRC, paint: { 'line-color': 'rgba(40,30,90,0.35)', 'line-width': 0.5 } });
        wireClick();
      }
      if (GE().layers.has(FILL)) GE().layers.setPaint(FILL, 'fill-color', ramp);
      [FILL, LINE].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', st.on ? 'visible' : 'none'); });
      /* ⚠ counted from the map, not from the intention (js/net-health-live.js's lesson: a paint that threw
         on its first line used to report every shape drawn) */
      st.painted = GE().layers.has(FILL) ? new Set(feats.map((f) => f.properties.k)).size : 0;
      st.paintError = '';
    } catch (e) { st.painted = 0; st.paintError = (e && e.message) || 'paint_failed'; }
  }
  let wired = false;
  function wireClick() {
    if (wired) return; wired = true;
    try {
      GE().events.onLayer('mouseenter', FILL, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
      GE().events.onLayer('mouseleave', FILL, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
      GE().events.onLayer('click', FILL, (ev) => {
        const f = ev && ev.features && ev.features[0]; if (!f) return;
        const k = String((f.properties || {}).k || ''); if (k) openBrief(k, { at: ev.lngLat });
      });
    } catch (_) { }
  }
  /* «the style is not ready» is not «nothing to draw» — the renderer's own signal, once (js/net-health-live.js) */
  function whenDrawable(fn) {
    const can = () => { try { return !!HOST.canDraw(); } catch (_) { return false; } };
    if (can()) { fn(); return; }
    try { GE().whenCanDraw().then(fn); } catch (_) { }
  }

  async function refresh(force) {
    if (!st.on) return;
    legend();
    try {
      const G = await geo(); shapesCache = G.shapes;
      await ensurePulse(force);
    } catch (_) { compute(); whenDrawable(() => { paint(); legend(); }); return; }
    compute();
    whenDrawable(() => { paint(); legend(); });
    if (st.briefKey) drawBrief();
  }

  /* ── the legend ─────────────────────────────────────────────────────────────────────────────────── */
  const rowName = () => { try { return (window.IntMapNewsIntel && window.IntMapNewsIntel.label()) || ''; } catch (_) { return ''; } };
  const catLabel = (k) => {
    try { const c = window.IntMapNewsEvents && window.IntMapNewsEvents.categories().find((x) => x.key === k); if (c) return c.label; } catch (_) { }
    return k;
  };
  const windowLabel = (w) => (w === 1 ? L('24 h', '24時間') : L('{n} days', '{n}日').replace('{n}', String(w)));
  function changeText(c) {
    const ch = change(c.n, c.prev);
    if (ch.kind === 'new') return L('new', '新規');
    if (ch.kind === 'none') return '';
    const pct = Math.round((ch.ratio - 1) * 100);
    return (pct > 0 ? '+' : '') + pct + '%';
  }
  function legend() {
    let el = null;
    try { const n = rowName(); el = window._registerLayerOpacity && window._registerLayerOpacity(KEY, [n, n, n, n, n], [FILL, LINE], ROW); } catch (_) { }
    if (!el) return;
    if (!st.on) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    try { const h = el.querySelector('h4'); if (h) h.textContent = rowName(); } catch (_) { }
    let box = el.querySelector('.nint-box');
    if (!box) {
      box = document.createElement('div'); box.className = 'nint-box';
      box.setAttribute('data-effect', 'none');   /* the window, the mode and the category only re-read the counts */
      box.innerHTML = '<div class="ios-segment nint-seg nint-win" role="group"></div><div class="ios-segment nint-seg nint-mode" role="group"></div>'
        + '<select class="nint-cat" data-effect="none" aria-label="' + S(L('Event category', '出来事のカテゴリ')) + '"></select><div class="nint-key"></div><ol class="nint-top"></ol><div class="nint-cov"></div><div class="nint-fresh"></div>';
      el.appendChild(box);
      /* built once, its state re-set on every repaint (rebuilding moves a control under the finger on it) */
      box.addEventListener('click', (ev) => {
        const t = ev.target && ev.target.closest ? ev.target : null; if (!t) return;
        const w = t.closest('[data-nint-w]'); if (w) { setOptions({ windowDays: +w.getAttribute('data-nint-w') }); return; }
        const m = t.closest('[data-nint-m]'); if (m) { setOptions({ mode: m.getAttribute('data-nint-m') }); return; }
        const k = t.closest('[data-nint-k]'); if (k) { openBrief(k.getAttribute('data-nint-k')); }
      });
      box.querySelector('.nint-cat').addEventListener('change', (ev) => setOptions({ category: ev.target.value }));
    }
    box.querySelector('.nint-win').innerHTML = WINDOWS.map((w) => '<button type="button" class="ios-segment-btn' + (st.w === w ? ' active' : '') + '" data-nint-w="' + w + '">' + S(windowLabel(w)) + '</button>').join('');
    box.querySelector('.nint-mode').innerHTML = [['volume', L('Most reported', '報道が多い')], ['rising', L('Rising', '増えている')]]
      .map((m) => '<button type="button" class="ios-segment-btn' + (st.mode === m[0] ? ' active' : '') + '" data-nint-m="' + S(m[0]) + '">' + S(m[1]) + '</button>').join('');
    const sel = box.querySelector('.nint-cat');
    let cats = [];
    try { cats = (window.IntMapNewsEvents && window.IntMapNewsEvents.categories()) || []; } catch (_) { cats = []; }
    sel.innerHTML = '<option value="all">' + S(L('All topics', '全カテゴリ')) + '</option>' + cats.map((c) => '<option value="' + S(c.key) + '">' + S(c.label) + '</option>').join('');
    sel.value = st.cat; sel.setAttribute('aria-label', L('Event category', '出来事のカテゴリ'));
    box.querySelector('.nint-key').innerHTML = '<div class="nint-ramp nint-ramp-' + S(st.mode) + '"></div><div class="nint-ramp-lbl"><span>'
      + S(st.mode === 'rising' ? L('smaller rise', '増加 小') : L('fewer', '少ない')) + '</span><span>'
      + S(st.mode === 'rising' ? L('larger rise vs the previous {w}', '直前の{w}より大きく増加').replace('{w}', windowLabel(st.w)) : L('more events first reported', '新しく報じられた出来事が多い')) + '</span></div>';
    const top = box.querySelector('.nint-top');
    const A = st.agg;
    top.innerHTML = A ? rank(A, st.mode, 5).map((c) => '<li><button type="button" data-nint-k="' + S(c.key) + '"><span class="nint-top-name">' + S(countryName(c.key))
      + '</span><span class="nint-top-n">' + S(nf(c.n)) + '</span><span class="nint-top-d">' + S(changeText(c)) + '</span></button></li>').join('') : '';
    box.querySelector('.nint-cov').textContent = coverageLine();
    box.querySelector('.nint-fresh').innerHTML = st.newest ? freshChip({ at: st.newest, now: Date.now(), verb: 'updated', by: L('IntMap news collection', 'IntMap のニュース収集'), lang: HOST.lang, fmt: fmtDT }) : '';
  }
  /* ⚠ WHAT WAS NOT PLACED IS SAID WITH WHAT WAS — and why a pale country is pale */
  function coverageLine() {
    if (st.paintError) return L('The counts arrived but the map could not draw them', '件数は届きましたが地図に描画できませんでした');
    if (st.err) return L('The news collection could not be reached — this does not mean nothing happened', 'ニュースの収集に到達できませんでした（何も起きていないという意味ではありません）');
    if (st.loading && !st.agg) return L('Counting events…', '出来事を数えています…');
    const A = st.agg; if (!A) return '';
    const until = clockUntil();
    if (st.oldest && until < st.oldest) return L('No events are recorded before {d}', '{d} より前の出来事は記録されていません').replace('{d}', fmtD(st.oldest));
    return L('{n} events first reported in the last {w} ({p} in the {w} before) · {s} countries · {u} with no place · {x} at sea · counts what IntMap’s news sources report — a pale country may simply be little covered',
      '直近{w}に新しく報じられた出来事 {n} 件（その前の{w}は {p} 件）・{s} か国・地点不明 {u} 件・海上 {x} 件・IntMap のニュース源が報じたものの件数で、色の薄い国は報道が少ないだけの場合があります')
      .replace(/\{w\}/g, windowLabel(st.w)).replace('{n}', nf(A.total)).replace('{p}', nf(A.prevTotal)).replace('{s}', nf(A.countries.size)).replace('{u}', nf(A.unplaced)).replace('{x}', nf(A.notInCountry));
  }

  /* ── the brief ──────────────────────────────────────────────────────────────────────────────────── */
  let pop = null;
  function ensurePop() {
    if (pop && document.body.contains(pop)) return pop;
    pop = document.createElement('div');
    pop.className = 'country-popup nint-popup'; pop.id = 'nint-popup';
    pop.setAttribute('data-panel', 'news-brief');
    /* (data-effect) pressing anything here READS (the brief's events, IODA) — it writes nothing */
    pop.setAttribute('data-effect', 'none');   /* the panel observer (js/atlas-capabilities.js openPanelIds) sees it */
    pop.innerHTML = '<button class="country-popup-close" type="button" data-nint="close" aria-label="' + S(L('Close', '閉じる')) + '" title="' + S(L('Close', '閉じる')) + '">×</button>'
      + '<div class="country-popup-header" id="nint-head"></div><div id="nint-body"></div>';
    (document.getElementById('map-container') || document.body).appendChild(pop);
    try { HOST.makeDraggable(pop, pop.querySelector('#nint-head')); } catch (_) { }
    pop.addEventListener('mousedown', () => { try { HOST.bringToFront(pop); } catch (_) { } });
    pop.addEventListener('click', onPopClick);
    return pop;
  }
  const brief = { key: '', rows: null, rowsErr: '', outages: null, at: null };
  function onPopClick(ev) {
    const t = ev && ev.target; if (!t || typeof t.closest !== 'function') return;
    if (t.closest('[data-nint="close"]')) { closeBrief(); return; }
    const e = t.closest('[data-nint-ev]');
    if (e) { const r = (brief.rows || []).find((x) => x.public_id === e.getAttribute('data-nint-ev')); if (r) openEvent(r); return; }
    const w = t.closest('[data-nint-w]'); if (w) { setOptions({ windowDays: +w.getAttribute('data-nint-w') }); }
  }
  async function openEvent(row) {
    try { await window.IntMapLazy.need('newsEvents'); if (window.IntMapNewsEvents && window.IntMapNewsEvents.openRow) await window.IntMapNewsEvents.openRow(row); } catch (_) { }
  }
  function place(at) {
    const e = ensurePop();
    if (e.getAttribute('data-dragged') === '1') return;
    try {
      const mc = e.offsetParent || document.getElementById('map-container') || document.documentElement;
      const mr = mc.getBoundingClientRect(), w = e.offsetWidth || 360;
      let left = mr.width - w - 24;
      if (at) { try { const p = GE().coords.project(at); const cr = GE().render.canvas().getBoundingClientRect(); left = cr.left - mr.left + p.x + 18; } catch (_) { } }
      e.style.left = Math.round(Math.max(12, Math.min(left, mr.width - w - 12))) + 'px';
      e.style.top = '84px';
    } catch (_) { e.style.left = '16px'; e.style.top = '84px'; }
  }

  /** openBrief(key, { at }) — the brief of one country, for the window the legend has */
  async function openBrief(key, opts) {
    const my = ++st.briefSeq;
    st.briefKey = key; brief.key = key; brief.rows = null; brief.rowsErr = ''; brief.outages = null; brief.at = (opts && opts.at) || null;
    const e = ensurePop(); e.style.display = 'block';
    try { HOST.bringToFront(e); } catch (_) { }
    drawBrief(); place(brief.at);
    try { await ensurePulse(); } catch (_) { }
    if (my !== st.briefSeq) return null;
    if (!st.agg) compute();
    drawBrief();
    await Promise.all([loadBriefRows(my), loadBriefOutages(my)]);
    if (my !== st.briefSeq) return null;
    drawBrief();
    return briefSummary();
  }
  function windowSpan() {
    const A = st.agg; if (!A) return null;
    return { since: Date.parse(A.days[0] + 'T00:00:00Z'), until: clockUntil() };
  }
  async function loadBriefRows(my) {
    const A = st.agg, c = A && A.countries.get(brief.key), span = windowSpan();
    if (!c || !span || !c.pts.size) { brief.rows = []; return; }
    try {
      await window.IntMapLazy.need('newsEvents');
      const cols = window.IntMapNewsEvents.columns();
      const pts = Array.from(c.pts).map((i) => st.pulse.pts[i]);
      const { data, error } = await HOST.DB.rpc('news_events_at', { p_points: pts, p_since: new Date(span.since).toISOString(), p_until: new Date(span.until).toISOString() })
        .select(cols).order('independent_source_count', { ascending: false }).order('last_article_at', { ascending: false }).limit(40);
      if (error) throw error;
      if (my === st.briefSeq) brief.rows = data || [];
    } catch (e) { if (my === st.briefSeq) { brief.rows = []; brief.rowsErr = (e && e.message) || String(e); } }
  }
  async function loadBriefOutages(my) {
    const span = windowSpan();
    if (!isIso2(brief.key) || !span) { brief.outages = { ok: true, list: [], na: true }; return; }
    try {
      const r = await window.IntMapNetHealth.outageEvents({ country: brief.key, from: span.since, until: span.until });
      if (my !== st.briefSeq) return;
      const list = r && r.ok ? r.events.map(outageOf).filter((x) => x && x.cc === brief.key) : [];
      brief.outages = { ok: !!(r && r.ok), list, measuredAt: r && r.measuredAt ? Date.parse(r.measuredAt) : null, source: r && r.source };
    } catch (_) { if (my === st.briefSeq) brief.outages = { ok: false, list: [] }; }
  }
  /* the events of the brief, in the shape js/news-intel-core.js linkOutages reads */
  const briefEvents = () => (brief.rows || []).map((r) => ({ cc: brief.key, at: Date.parse(r.first_published_at || r.last_article_at || 0), row: r }));

  function sparkSVG(c, A) {
    const W = 300, H = 46, n = A.seriesDays.length, bw = W / n, max = Math.max(1, ...c.series);
    const inW = new Set(A.days);
    let bars = '';
    for (let i = 0; i < n; i++) {
      const v = c.series[i], h = v ? Math.max(2, Math.round((v / max) * (H - 4))) : 0;
      const d = A.seriesDays[i];
      bars += '<rect x="' + (i * bw + 0.5).toFixed(1) + '" y="' + (H - h) + '" width="' + Math.max(1, bw - 1.5).toFixed(1) + '" height="' + h + '" class="' + (inW.has(d) ? 'nint-bar-w' : 'nint-bar') + '"><title>' + S(fmtD(Date.parse(d + 'T00:00:00Z')) + ': ' + v) + '</title></rect>';
    }
    return '<svg class="nint-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + S(L('New events per day, last 30 days', '1日あたりの新しい出来事（直近30日）')) + '">' + bars + '</svg>'
      + '<div class="nint-spark-lbl"><span>' + S(fmtD(Date.parse(A.seriesDays[0] + 'T00:00:00Z'))) + '</span><span>' + S(L('new events per day (UTC)', '1日あたりの新しい出来事（UTC）')) + '</span><span>' + S(fmtD(Date.parse(A.seriesDays[n - 1] + 'T00:00:00Z'))) + '</span></div>';
  }
  function drawBrief() {
    if (!brief.key) return;
    const e = ensurePop();
    const head = e.querySelector('#nint-head'), body = e.querySelector('#nint-body');
    head.innerHTML = '<div class="nint-h-title">' + S(countryName(brief.key)) + '</div><div class="nint-h-sub">' + S(L('News brief · last {w}', 'ニュースの日報・直近{w}').replace('{w}', windowLabel(st.w))) + '</div>';
    const A = st.agg, c = A && A.countries.get(brief.key);
    if (!A) { body.innerHTML = '<div class="nint-empty">' + S(st.err ? coverageLine() : L('Counting events…', '出来事を数えています…')) + '</div>'; return; }
    let h = '<div class="ios-segment nint-seg">' + WINDOWS.map((w) => '<button type="button" class="ios-segment-btn' + (st.w === w ? ' active' : '') + '" data-nint-w="' + w + '">' + S(windowLabel(w)) + '</button>').join('') + '</div>';
    if (!c || (!c.n && !c.prev && !c.series.some(Boolean))) {
      h += '<div class="nint-empty">' + S(L('No event first reported here in the last 30 days by IntMap’s news sources. That is a statement about what these sources covered, not about what happened.', 'IntMap のニュース源は、直近30日にここで新しく報じた出来事を持っていません。これは報道の範囲についての記述であって、何も起きなかったという意味ではありません。')) + '</div>';
      body.innerHTML = h + outageHTML(); return;
    }
    const ch = changeText(c);
    h += '<div class="nint-stats"><div class="nint-big">' + S(nf(c.n)) + '</div><div class="nint-big-lbl">' + S(L('events first reported', '件の出来事が新たに報道')) + '</div>'
      + (ch ? '<span class="nint-delta nint-delta-' + S(change(c.n, c.prev).kind) + '">' + S(ch) + '</span>' : '')
      + '<div class="nint-sub">' + S(L('{p} in the {w} before · {m} reported by 2+ independent outlets', '直前の{w}は {p} 件・独立した2媒体以上が報じたもの {m} 件').replace(/\{w\}/g, windowLabel(st.w)).replace('{p}', nf(c.prev)).replace('{m}', nf(c.multi))) + '</div></div>';
    h += sparkSVG(c, A);
    const cats = Object.entries(c.cats).sort((a, b) => b[1] - a[1]);
    if (cats.length) {
      const mx = cats[0][1];
      h += '<div class="nint-cats">' + cats.map(([k, v]) => '<div class="nint-cat-row"><span class="nint-cat-name">' + S(catLabel(k)) + '</span><span class="nint-cat-bar"><i style="width:' + Math.round((v / mx) * 100) + '%"></i></span><span class="nint-cat-n">' + S(nf(v)) + '</span></div>').join('') + '</div>';
    }
    h += '<div class="nint-sec">' + S(L('Most-reported events', '報道の多い出来事')) + '</div>';
    if (brief.rows == null) h += '<div class="nint-empty">' + S(L('Loading events…', '出来事を読み込み中…')) + '</div>';
    else if (brief.rowsErr) h += '<div class="nint-empty">' + S(L('The events could not be loaded', '出来事を読み込めませんでした')) + '</div>';
    else if (!brief.rows.length) h += '<div class="nint-empty">' + S(L('No events in this window', 'この期間の出来事はありません')) + '</div>';
    else h += '<ul class="nint-evs">' + brief.rows.slice(0, 12).map(evHTML).join('') + '</ul>';
    h += outageHTML();
    if (st.newest) h += '<div class="nint-foot">' + freshChip({ at: st.newest, now: Date.now(), verb: 'updated', by: L('IntMap news collection', 'IntMap のニュース収集'), lang: HOST.lang, fmt: fmtDT }) + '</div>';
    body.innerHTML = h;
  }
  function evHTML(r) {
    const at = Date.parse(r.first_published_at || r.last_article_at || 0);
    const meta = [r.rep_place_name_en || '', isFinite(at) ? fmtDT(at) : '', L('{n} sources', '{n}媒体').replace('{n}', String(r.independent_source_count || 1)), catLabel(r.primary_category)].filter(Boolean).join(' · ');
    return '<li><button type="button" class="nint-ev" data-nint-ev="' + S(r.public_id) + '"><span class="nint-ev-t">' + S(r.representative_title || '') + '</span><span class="nint-ev-m">' + S(meta) + '</span></button></li>';
  }
  function outageHTML() {
    if (!isIso2(brief.key)) return '';
    const O = brief.outages;
    let h = '<div class="nint-sec">' + S(L('Internet outages measured here (IODA)', 'ここで計測されたインターネット障害（IODA）')) + '</div>';
    if (!O) return h + '<div class="nint-empty">' + S(L('Asking IODA…', 'IODA に問い合わせ中…')) + '</div>';
    if (!O.ok) return h + '<div class="nint-empty">' + S(L('IODA could not be reached — this is not an all-clear', 'IODA に到達できませんでした（障害が無いという意味ではありません）')) + '</div>';
    if (!O.list.length) return h + '<div class="nint-empty">' + S(L('IODA recorded no outage events here in this window', 'この期間、IODA はここで障害イベントを記録していません')) + '</div>'
      + (O.measuredAt ? '<div class="nint-foot">' + freshChip({ at: O.measuredAt, verb: 'measured', by: 'IODA (Georgia Tech)', lang: HOST.lang, fmt: fmtDT }) + '</div>' : '');
    const linked = linkOutages(O.list, briefEvents());
    h += '<ul class="nint-outs">' + linked.slice(0, 8).map((o) => {
      const dur = o.end ? Math.max(1, Math.round((o.end - o.start) / 3600000)) : null;
      let li = '<li class="nint-out"><div class="nint-out-h">' + S(fmtDT(o.start)) + (dur ? ' · ' + S(L('{h} h', '{h} 時間').replace('{h}', String(dur))) : ' · ' + S(L('ongoing', '継続中'))) + ' · ' + S(o.signal) + '</div>';
      if (o.news.length) {
        li += '<div class="nint-out-n">' + S(L('News first reported in the same country from 12 h before to 24 h after — reported together, not shown to be connected:', '同じ国で、障害の12時間前から24時間後までに報じられたニュース（同時に報じられたもので、関係は示されていません）:')) + '</div><ul class="nint-evs">'
          + o.news.slice(0, 3).map((x) => evHTML(x.row)).join('') + '</ul>';
      }
      return li + '</li>';
    }).join('') + '</ul>';
    if (O.measuredAt) h += '<div class="nint-foot">' + freshChip({ at: O.measuredAt, verb: 'measured', by: 'IODA (Georgia Tech)', lang: HOST.lang, fmt: fmtDT }) + '</div>';
    return h;
  }
  function closeBrief() { st.briefSeq++; st.briefKey = ''; brief.key = ''; if (pop) pop.style.display = 'none'; }

  /* what Atlas is handed: the facts of the brief, the counts with their window, and what could not be read */
  function briefSummary() {
    const A = st.agg, c = A && A.countries.get(brief.key);
    const O = brief.outages;
    const outs = O && O.ok ? linkOutages(O.list, briefEvents()).map((o) => ({ start: new Date(o.start).toISOString(), end: o.end ? new Date(o.end).toISOString() : null, signal: o.signal,
      newsAround: o.news.map((x) => x.row.representative_title) })) : null;
    return {
      country: countryName(brief.key), key: brief.key, windowDays: st.w, until: new Date(clockUntil()).toISOString(),
      events: c ? c.n : 0, previous: c ? c.prev : 0, change: c ? change(c.n, c.prev) : null, multiSource: c ? c.multi : 0,
      categories: c ? c.cats : {},
      top: (brief.rows || []).slice(0, 8).map((r) => ({ title: r.representative_title, place: r.rep_place_name_en, firstReported: r.first_published_at, sources: r.independent_source_count, category: r.primary_category, publicId: r.public_id })),
      eventsError: brief.rowsErr || null,
      outages: outs, outagesReachable: O ? !!O.ok : null,
      sources: { news: 'IntMap news collection (public.news_events)', outages: 'IODA — Internet Outage Detection and Analysis (Georgia Tech), read live, not stored' },
    };
  }

  /** resolve a country the reader named: an ISO code, or its name in English, Japanese or the page's language */
  async function resolveCountry(q) {
    const G = await geo(); st.index = G.index;
    const raw = String(q || '').trim(); if (!raw) return null;
    const up = raw.toUpperCase();
    const keys = G.index.keys();
    if (keys.indexOf(up) >= 0) return up;
    const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s.'’()-]+/g, '');
    const want = norm(raw);
    const names = (k) => {
      const out = [G.index.name(k)];
      if (isIso2(k)) for (const loc of ['en', 'ja', LOC()]) { try { out.push(new Intl.DisplayNames([loc], { type: 'region' }).of(k)); } catch (_) { } }
      return out;
    };
    for (const k of keys) if (names(k).some((n) => norm(n) === want)) return k;
    return null;
  }

  /* ── companies in the news ──────────────────────────────────────────────────────────────────────── */
  /** companyEvents(id) → { ok, items:[{ row, matchedBy, evidence }], error } — newest first. An event that has
      since been merged into another is followed to the event it joined (the clustering's own pointer). */
  async function companyEvents(id) {
    try {
      await window.IntMapLazy.need('newsEvents');
      const cols = window.IntMapNewsEvents.columns();
      const { data, error } = await HOST.DB.from('news_event_entities')
        .select('matched_by,evidence,created_at,news_events(' + cols + ',merged_into)')
        .eq('entity_kind', 'company').eq('entity_id', String(id || '')).order('created_at', { ascending: false }).limit(60);
      if (error) throw error;
      let items = (data || []).filter((x) => x && x.news_events).map((x) => ({ row: x.news_events, matchedBy: x.matched_by, evidence: x.evidence }));
      const moved = items.filter((x) => x.row.status !== 'active' && x.row.merged_into).map((x) => x.row.merged_into);
      if (moved.length) {
        const r2 = await HOST.DB.from('news_events').select(cols + ',merged_into').in('id', Array.from(new Set(moved)));
        const by = new Map(((r2 && r2.data) || []).map((r) => [r.id, r]));
        items = items.map((x) => (x.row.status !== 'active' && by.has(x.row.merged_into) ? Object.assign({}, x, { row: by.get(x.row.merged_into) }) : x));
      }
      const seen = new Set();
      items = items.filter((x) => x.row.status === 'active' && !seen.has(x.row.public_id) && seen.add(x.row.public_id));
      items.sort((a, b) => Date.parse(b.row.last_article_at || b.row.first_published_at || 0) - Date.parse(a.row.last_article_at || a.row.first_published_at || 0));
      return { ok: true, items };
    } catch (e) { return { ok: false, items: [], error: (e && e.message) || String(e) }; }
  }
  /* the great circle and the distance are js/news-intel-core.js `arc` / `km` (the story draws its spread with the same two) */
  /** showCompanyLinks(sites:[{lon,lat,name}], items) — each event joined to the company's NEAREST published
      site (a line says «this company, this event», not «this factory caused it»; the panel says which site) */
  function showCompanyLinks(sites, items) {
    const xs = (sites || []).filter((f) => Number.isFinite(+f.lon) && Number.isFinite(+f.lat)).map((f) => ({ p: [+f.lon, +f.lat], name: f.name || '' }));
    const lines = [], pts = [];
    for (const it of (items || [])) {
      const r = it.row; if (!r || r.rep_lng == null || r.rep_lat == null) continue;
      const ev = [+r.rep_lng, +r.rep_lat];
      pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: ev }, properties: { t: r.representative_title || '', pid: r.public_id } });
      if (!xs.length) continue;
      let best = xs[0], bd = Infinity; for (const s of xs) { const d = km(s.p, ev); if (d < bd) { bd = d; best = s; } }
      if (bd > 1) lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc(best.p, ev, 32) }, properties: { site: best.name, pid: r.public_id } });
    }
    const data = { type: 'FeatureCollection', features: lines.concat(pts) };
    const draw = () => {
      try {
        if (GE().layers.hasSource(CO_SRC)) GE().layers.setSourceData(CO_SRC, data);
        else {
          GE().layers.addSource(CO_SRC, { type: 'geojson', data });
          GE().layers.add({ id: CO_LINE, type: 'line', source: CO_SRC, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#6a4fc9', 'line-width': 1.4, 'line-opacity': 0.7, 'line-dasharray': [2, 1.5] } });
          GE().layers.add({ id: CO_PT, type: 'circle', source: CO_SRC, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#6a4fc9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
          GE().events.onLayer('click', CO_PT, (ev) => {
            const f = ev && ev.features && ev.features[0]; const pid = f && f.properties && f.properties.pid;
            const it = (items || []).find((x) => x.row && x.row.public_id === pid); if (it) openEvent(it.row);
          });
        }
        [CO_LINE, CO_PT].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', 'visible'); });
      } catch (_) { }
    };
    whenDrawable(draw);
    return { lines: lines.length, points: pts.length };
  }
  function hideCompanyLinks() {
    try { [CO_LINE, CO_PT].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', 'none'); }); } catch (_) { }
  }

  /* ── the doors ──────────────────────────────────────────────────────────────────────────────────── */
  function setOptions(o) {
    const p = o || {};
    if (p.windowDays != null && WINDOWS.indexOf(+p.windowDays) >= 0) st.w = +p.windowDays;
    if (p.mode === 'volume' || p.mode === 'rising') st.mode = p.mode;
    if (p.category != null) st.cat = String(p.category) || 'all';
    compute();
    whenDrawable(() => { paint(); legend(); });
    if (st.briefKey) { const k = st.briefKey; openBrief(k, { at: brief.at }); }
    return { windowDays: st.w, mode: st.mode, category: st.cat };
  }
  async function toggle(want) {
    st.on = !!want;
    if (st.on) {
      if (!st.timer) st.timer = everyTick('news-pulse:refresh', REFRESH_MS, () => { if (st.on && isLive()) refresh(true); }, REFRESH_MS);
      await refresh(false);
    } else {
      if (st.timer) { stopTick(st.timer); st.timer = null; }
      paint(); legend();
      try { window._hideGenericLegend && window._hideGenericLegend(KEY); } catch (_) { }
    }
    return st.on;
  }
  /** ranking({ windowDays, mode, category, limit }) — the answer WITHOUT painting anything (Atlas asks this) */
  async function ranking(o) {
    const p = o || {};
    try { await ensurePulse(); } catch (e) { return { ok: false, error: (e && e.message) || String(e) }; }
    const w = WINDOWS.indexOf(+p.windowDays) >= 0 ? +p.windowDays : st.w;
    const mode = (p.mode === 'rising' || p.mode === 'volume') ? p.mode : st.mode;
    const cat = p.category != null ? String(p.category) || 'all' : st.cat;
    /* computed apart from the layer's own state: asking does not move the legend the reader set */
    const A = aggregate(st.pulse, st.index, { untilMs: clockUntil(), windowDays: w, category: cat, seriesDays: SPAN_DAYS });
    return { ok: true, windowDays: w, mode, category: cat, until: new Date(clockUntil()).toISOString(),
      total: A.total, previousTotal: A.prevTotal, unplaced: A.unplaced, atSea: A.notInCountry, countries: A.countries.size,
      oldest: st.oldest ? new Date(st.oldest).toISOString() : null,
      top: rank(A, mode, Math.max(1, Math.min(40, +p.limit || 10))).map((c) => ({ country: countryName(c.key), key: c.key, events: c.n, previous: c.prev, change: change(c.n, c.prev), multiSource: c.multi })) };
  }
  /** outageNews({ days, limit }) — IODA's outage events in every country over the last `days` (≤ 14), each with
      the number of news events first reported in that country on the days it spans (the day before to the
      day after). A count of what was reported together — not a claim that the outage was reported. */
  async function outageNews(o) {
    const p = o || {};
    const days = Math.max(1, Math.min(14, +p.days || 7));
    const until = clockUntil(), from = until - days * DAY;
    let r;
    try { r = await window.IntMapNetHealth.outageEvents({ from, until }); } catch (_) { r = null; }
    if (!r || !r.ok) return { ok: false, reachable: false, error: 'IODA could not be reached — this is not an all-clear' };
    try { await ensurePulse(); } catch (_) { /* the outages are still an answer; the news counts are then unknown */ }
    const perDay = new Map();
    if (st.pulse && st.index) {
      const ptKey = st.pulse.pts.map((q) => st.index.keyAt(q[0], q[1]));
      for (const row of st.pulse.rows) { if (row.i < 0) continue; const k = ptKey[row.i]; if (!k) continue; const key = k + '|' + row.day; perDay.set(key, (perDay.get(key) || 0) + row.n); }
    }
    const list = r.events.map(outageOf).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, Math.max(1, Math.min(50, +p.limit || 15)));
    return { ok: true, reachable: true, days, until: new Date(until).toISOString(), measuredAt: r.measuredAt || null, source: r.source,
      newsCounted: !!st.pulse,
      outages: list.map((x) => {
        let n = null;
        if (st.pulse) { n = 0; const end = x.end || until; for (let t = x.start - DAY; t <= end + DAY; t += DAY) n += perDay.get(x.cc + '|' + new Date(t).toISOString().slice(0, 10)) || 0; }
        return { country: countryName(x.cc), key: x.cc, start: new Date(x.start).toISOString(), end: x.end ? new Date(x.end).toISOString() : null, signal: x.signal, score: Math.round(x.score), newsEventsAround: n };
      }) };
  }
  async function briefFor(q) {
    const k = await resolveCountry(q);
    if (!k) return { ok: false, error: 'not_found' };
    const s = await openBrief(k);
    return Object.assign({ ok: true }, s || briefSummary());
  }

  /* a basemap swap discards every layer this file added (js/war-layer.js listens to the same signal) */
  try { GE().events.on('styledata', () => { if (st.on && !GE().layers.hasSource(SRC)) { wired = false; whenDrawable(() => { paint(); legend(); }); } }); } catch (_) { }
  /* Chronos moves the window — the fetch follows the clock's day */
  try { IntMapTime.on(() => { if (st.on) refresh(false); }); } catch (_) { }
  try { bus.on('intmap-lang', () => setTimeout(() => { if (st.on) legend(); if (st.briefKey) drawBrief(); }, 30)); } catch (_) { }

  const API = {
    toggle, isOn: () => st.on, setOptions, ranking, brief: briefFor, openBrief, closeBrief, outageNews,
    companyEvents, showCompanyLinks, hideCompanyLinks, clockUntil,
    state: () => ({ on: st.on, windowDays: st.w, mode: st.mode, category: st.cat, painted: st.painted, paintError: st.paintError, error: st.err,
      loading: st.loading, total: st.agg ? st.agg.total : null, countries: st.agg ? st.agg.countries.size : null, brief: st.briefKey || null,
      oldest: st.oldest ? new Date(st.oldest).toISOString() : null, newest: st.newest ? new Date(st.newest).toISOString() : null }),
  };
  window.__imNewsIntel = API;
  return API;
}
