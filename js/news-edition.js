/* ============================================================================
 *  IntMap · js/news-edition.js — TODAY ON THE MAP: THE DAY'S NEWS AS ONE EDITION  (wave4-news)
 * ----------------------------------------------------------------------------
 *  The News list answers «what was updated last»; this card answers the question a reader brings every morning —
 *  «what happened in the world today, and what is new since I last looked». It reads the news collection
 *  (public.news_events) for one window — the 24 hours up to the master clock's instant, or one UTC day of the archive
 *  — and shows it as an edition:
 *    · since your last visit: how many events were first reported after this browser last opened the edition, and
 *      which of the top they are (a mark on each);
 *    · the top ten, ranked by the number of independent outlets, each saying whether it is new in the window or has
 *      continued since an earlier day, and opening in the same reader as the News list;
 *    · the map: the top ten numbered at their places, every other placed event of the window as a small dot, and
 *      «Play the edition» — the camera visits the ten in order, the card following;
 *    · the window in numbers: events, new / continuing, 2+ outlets, the topics and the countries reported from;
 *    · the archive: the previous seven UTC days as chips, any day by link (`?edition=2026-10-05`);
 *    · «Copy as text» — the edition as a plain list with its link, for a chat or a newsletter.
 *
 *  ⚠ NOTHING HERE DECIDES A FACT. Which events are in a window, their order, what is new and what is counted are
 *    js/news-edition-core.js; this file fetches, paints and words.
 *  ⚠ IT FOLLOWS CHRONOS: the rolling edition ends at the master clock's instant. Only the LIVE clock marks a visit
 *    (an edition read with the clock in the past is not «having read today's news»).
 *  ⚠ A RANK IS A COUNT OF OUTLETS, NOT A JUDGEMENT OF IMPORTANCE — the card and Atlas say what it counts.
 *  Lazy: js/lazy-modules.js `newsEdition`; the doors are js/news-pulse.js (boot). IntMap's words, en + jp.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { IntMapTime } from './chronos.js';
import { MapState } from './map-state.js';   /* the one link assembly (pageLink) */
import { everyTick, stopTick } from './runtime.js';
import { makeCountryIndex, isIso2 } from './news-intel-core.js';
import { failureOf } from './news-story-core.js';   /* the one reading of WHY a news read failed */
import { freshChip } from './freshness.js';
import { EDITION, editionWindow, backDays, buildEdition, walkOrder, editionQuery, editionFromSearch, readSeen, writeSeen, digestLines, dayOf } from './news-edition-core.js';

export function newsEdition(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const LOC = () => { try { return IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const nf = (v) => { try { return Number(v).toLocaleString(LOC()); } catch (_) { return String(v); } };
  const fmtDay = (ms) => { try { return new Date(ms).toLocaleDateString(LOC(), { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }); } catch (_) { return dayOf(ms); } };
  const fmtD = (ms) => { try { return new Date(ms).toLocaleDateString(LOC(), { month: 'short', day: 'numeric' }); } catch (_) { return dayOf(ms); } };
  const fmtDT = (ms) => { try { return new Date(ms).toLocaleString(LOC(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return new Date(ms).toISOString(); } };
  const SRC = 'nedition-src', DOT = 'nedition-dot', PIN = 'nedition-pin', NUM = 'nedition-num', RING = 'nedition-ring';
  /* the event's own facts, not its articles (those are fetched when one is opened) — the columns the story reads */
  const COLS = 'public_id,representative_title,rep_lng,rep_lat,rep_place_name_en,primary_category,first_published_at,first_seen_at,last_article_at,article_count,independent_source_count';
  /* one stop of «Play the edition»: the flight (~1.6 s at speed 1.1) and time to read the headline the card shows.
     A pace, not a measurement — ten stops play in under a minute. */
  const WALK_MS = 4500;
  const store = () => { try { return window.localStorage; } catch (_) { return null; } };

  const st = { open: false, seq: 0, spec: {}, win: null, ed: null, rows: null, loading: false, err: '', fail: null,
    seenBefore: null, sinceTotal: null, marked: false, walking: null, stop: -1, painted: 0, paintError: '', health: null };
  const failed = (e) => { st.err = (e && e.message) || String(e); st.fail = failureOf(e); };

  function clockMs() { try { return IntMapTime.nowMs(); } catch (_) { return Date.now(); } }
  function clockLive() { try { return IntMapTime.isLive(); } catch (_) { return true; } }

  /* ── countries, through the boot facade's one outline loader (js/news-pulse.js `outlines`) ───── */
  let geoP = null, index = null;
  function countries() {
    if (!geoP) {
      geoP = window.IntMapNewsIntel.outlines('10m').then((fc) => makeCountryIndex((fc && fc.features) || []))
        .catch((e) => { geoP = null; throw e; });
    }
    return geoP;
  }
  function countryName(k) {
    if (!k) return '';
    if (isIso2(k)) { try { const n = new Intl.DisplayNames([LOC()], { type: 'region' }).of(k); if (n && n !== k) return n; } catch (_) { } }
    return index ? index.name(k) : k;
  }
  function catName(k) {
    try { const c = window.IntMapNewsEvents && window.IntMapNewsEvents.categories().find((x) => x.key === k); if (c) return c.label; } catch (_) { }
    return k;
  }

  /* ── the data ────────────────────────────────────────────────────────────────────────────────── */
  async function fetchRows(win) {
    if (!HOST.DB || typeof HOST.DB.from !== 'function') throw new Error('no database client');
    /* the window rule of js/news-edition-core.js (reporting span overlaps the window), and its rank as the order, so the
       rows the server returns first are the top */
    const { data, error } = await HOST.DB.from('news_events').select(COLS)
      .eq('status', 'active').is('merged_into', null)
      .lt('first_published_at', new Date(win.untilMs).toISOString()).gte('last_article_at', new Date(win.sinceMs).toISOString())
      .order('independent_source_count', { ascending: false }).order('article_count', { ascending: false }).order('first_published_at', { ascending: true })
      .limit(EDITION.LIMIT);
    if (error) throw error;
    return data || [];
  }
  /* «N new since your last visit»: the server's count of every event first reported after the mark — the same counter the
     News entry reads (js/news-events.js API.sinceLastVisit), so the two never differ. null = could not count. */
  async function sinceLastVisit(seen) {
    try { await window.IntMapLazy.need('newsEvents'); const E = window.IntMapNewsEvents; return E && E.sinceLastVisit ? await E.sinceLastVisit(seen) : null; } catch (_) { return null; }
  }
  async function readHealth() {
    try { await window.IntMapLazy.need('newsEvents'); const E = window.IntMapNewsEvents; return E && E.health ? await E.health() : null; } catch (_) { return null; }
  }

  /** open({ day?, latest?, search?, play? }) — the edition of a UTC day, or the rolling one (the default). Resolves to the
      summary Atlas reads. */
  async function open(o) {
    const p = o || {};
    const my = ++st.seq;
    stopWalk();
    let spec = p.search ? editionFromSearch(p.search) : null;
    if (!spec) spec = p.day ? { day: String(p.day) } : { latest: true };
    st.spec = spec.day ? { day: spec.day } : {};
    st.open = true; st.err = ''; st.fail = null; st.ed = null; st.rows = null; st.stop = -1; st.marked = false;
    const now = clockMs();
    st.win = editionWindow(st.spec, now);
    st.loading = !!st.win;
    show(); draw();
    if (!st.win) { st.loading = false; draw(); paint(); return summary(); }
    /* the last visit is read BEFORE this visit is marked, so the edition can say what is new since then */
    st.seenBefore = readSeen(store()); st.sinceTotal = null;
    try {
      const rolling = st.win.kind === 'rolling';
      const [rows, idx, health, total] = await Promise.all([fetchRows(st.win), countries().catch(() => null), rolling && clockLive() ? readHealth() : Promise.resolve(null),
        rolling && st.seenBefore != null ? sinceLastVisit(st.seenBefore) : Promise.resolve(null)]);
      if (my !== st.seq) return null;
      index = idx; st.rows = rows; st.health = health; st.sinceTotal = total;
      st.ed = buildEdition(rows, { sinceMs: st.win.sinceMs, untilMs: st.win.untilMs, seenMs: st.win.kind === 'rolling' ? st.seenBefore : null,
        keyAt: index ? index.keyAt : null, limit: EDITION.LIMIT });
      /* a visit is marked only when the LIVE edition was read: the mark is «this reader has seen the news up to now» */
      if (st.win.kind === 'rolling' && clockLive()) {
        st.marked = writeSeen(store(), st.win.untilMs);
        try { const NE = window.IntMapNewsEvents; if (NE && NE.refreshEditionEntry) NE.refreshEditionEntry(); } catch (_) { }   /* its count starts from this visit now */
      }
      fit();
    } catch (e) { if (my === st.seq) failed(e); }
    if (my !== st.seq) return null;
    st.loading = false;
    draw(); paint();
    if (p.play) play();
    return summary();
  }

  /* ── playing: the camera visits the top in order ────────────────────────────────────────────── */
  function goTo(i) {
    const stops = walkOrder(st.ed); if (!stops.length) return -1;
    st.stop = Math.max(0, Math.min(stops.length - 1, i | 0));
    const e = stops[st.stop];
    whenDrawable(() => { try { GE().camera.flyTo({ center: e.p, zoom: 4.6, speed: 1.1 }); } catch (_) { } });
    drawList(); paint();
    return st.stop;
  }
  function play() {
    const stops = walkOrder(st.ed); if (!stops.length) return false;
    stopWalk();
    let i = -1;
    const step = () => { i++; if (i >= stops.length) { stopWalk(); return; } goTo(i); };
    st.walking = everyTick('news-edition:walk', WALK_MS, step);
    step();
    drawControls();
    return true;
  }
  function stopWalk() {
    if (st.walking) { try { stopTick(st.walking); } catch (_) { } st.walking = null; }
    drawControls();
  }

  /* ── the map ─────────────────────────────────────────────────────────────────────────────────── */
  function whenDrawable(fn) {
    const can = () => { try { return !!HOST.canDraw(); } catch (_) { return false; } };
    if (can()) { fn(); return; }
    try { GE().whenCanDraw().then(fn); } catch (_) { }
  }
  function features() {
    const E = st.ed; if (!st.open || !E) return [];
    const stops = walkOrder(E), cur = st.stop >= 0 && stops[st.stop] ? stops[st.stop].id : null;
    const out = [];
    for (const e of E.events) {
      if (!e.p) continue;
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: e.p },
        properties: { pid: e.id, n: e.n ? String(e.n) : '', top: e.n ? 1 : 0, fresh: e.sinceSeen ? 1 : 0, cur: e.id === cur ? 1 : 0, src: e.sources } });
    }
    /* the top is drawn last so its numbers sit above the dots */
    return out.sort((a, b) => a.properties.top - b.properties.top || (+b.properties.n || 0) - (+a.properties.n || 0));
  }
  function paint() {
    const data = { type: 'FeatureCollection', features: features() };
    whenDrawable(() => {
      try {
        if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
        else {
          GE().layers.addSource(SRC, { type: 'geojson', data });
          GE().layers.add({ id: DOT, type: 'circle', source: SRC, filter: ['==', ['get', 'top'], 0],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'src'], 1, 2.6, 6, 5], 'circle-color': '#8e8e93', 'circle-opacity': 0.55, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.6 } });
          GE().layers.add({ id: RING, type: 'circle', source: SRC, filter: ['==', ['get', 'cur'], 1],
            paint: { 'circle-radius': 20, 'circle-color': 'rgba(255,159,10,0.18)', 'circle-stroke-color': '#ff9f0a', 'circle-stroke-width': 2.4 } });
          GE().layers.add({ id: PIN, type: 'circle', source: SRC, filter: ['==', ['get', 'top'], 1],
            paint: { 'circle-radius': 11, 'circle-color': ['case', ['==', ['get', 'fresh'], 1], '#ff3b30', '#0a84ff'], 'circle-opacity': 0.96, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
          GE().layers.add({ id: NUM, type: 'symbol', source: SRC, filter: ['==', ['get', 'top'], 1],
            layout: { 'text-field': ['get', 'n'], 'text-font': ['literal', ['Noto Sans Regular']], 'text-size': 11.5, 'text-allow-overlap': true, 'text-ignore-placement': true },
            paint: { 'text-color': '#ffffff' } });
          wire();
        }
        [DOT, RING, PIN, NUM].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', st.open ? 'visible' : 'none'); });
        /* ⚠ counted from the map, not from the intention (js/news-story.js's rule) */
        st.painted = GE().layers.has(PIN) ? data.features.length : 0;
        st.paintError = '';
      } catch (e) { st.painted = 0; st.paintError = (e && e.message) || 'paint_failed'; }
    });
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    try {
      for (const id of [PIN, DOT]) {
        GE().events.onLayer('mouseenter', id, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
        GE().events.onLayer('mouseleave', id, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
        GE().events.onLayer('click', id, (ev) => {
          const f = ev && ev.features && ev.features[0]; const pid = f && f.properties && f.properties.pid;
          if (!pid) return;
          try { GE().events.claimClick(ev); } catch (_) { }   /* the tap belongs to the event, not to the place name beneath it */
          stopWalk(); openEvent(String(pid));
        });
      }
    } catch (_) { }
  }
  function fit() {
    const pts = walkOrder(st.ed).map((e) => e.p);
    if (!pts.length) return;
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    whenDrawable(() => {
      try {
        if (pts.length === 1) GE().camera.flyTo({ center: pts[0], zoom: 4.6, speed: 1.0 });
        else GE().camera.fitBounds([[w, s], [e, n]], { padding: clearOfCard(), maxZoom: 4.5, duration: 900 });
      } catch (_) { }
    });
  }
  /* framed in the part of the map the card does not cover (js/news-story.js measured the same need) */
  function clearOfCard() {
    const pad = { top: 60, bottom: 60, left: 60, right: 60 };
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

  /* ── the look: injected with the card (a lazy module's rules are not in the eager css/intmap.css) — on the
     .country-popup shell and the brief's .nint-* / the story's .nst-* rows. Red (#ff3b30) is «new since your last visit». */
  function style() {
    if (document.getElementById('nedition-css')) return;
    const el = document.createElement('style'); el.id = 'nedition-css'; el.textContent = [
      '.ned-days{ margin:0 0 8px; }',
      '.ned-day-row{ display:flex; gap:6px; overflow-x:auto; scrollbar-width:none; padding-bottom:2px; }',
      '.ned-day-row::-webkit-scrollbar{ height:0; }',
      '.ned-day{ flex:0 0 auto; min-height:32px; padding:4px 10px; border-radius:999px; border:1px solid var(--glass-border,rgba(128,128,128,0.28)); background:var(--input-bg); color:var(--text-main); font-size:12.5px; cursor:pointer; }',
      '.ned-day.on{ background:#0a84ff; border-color:#0a84ff; color:#fff; }',
      '.ned-fresh{ margin:0 0 8px; }',
      '.ned-since{ display:flex; align-items:baseline; gap:8px; padding:10px 12px; margin:0 0 10px; border-radius:12px; background:color-mix(in srgb, #ff3b30 10%, transparent); }',
      '.ned-since b{ font-size:22px; font-weight:700; color:#d70015; font-variant-numeric:tabular-nums; line-height:1; }',
      '.ned-since span{ font-size:12px; line-height:1.4; }',
      '.ned-since.ned-first{ background:var(--input-bg); color:var(--text-muted); }',
      '.ned-ctl{ display:flex; align-items:center; gap:10px; margin:2px 0 4px; }',
      '.ned-ctl-l{ font-size:12px; color:var(--text-muted); line-height:1.35; }',
      '.ned-ctl .nst-play:disabled{ opacity:0.4; cursor:default; }',
      '.ned-top{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px; }',
      '.ned-ev{ flex-direction:row; align-items:flex-start; gap:10px; }',
      '.ned-ev.cur{ box-shadow:inset 3px 0 0 #ff9f0a; }',
      '.ned-n{ flex:0 0 auto; width:22px; height:22px; border-radius:50%; background:#0a84ff; color:#fff; font-size:11.5px; font-weight:700; display:inline-flex; align-items:center; justify-content:center; font-variant-numeric:tabular-nums; margin-top:1px; }',
      '.ned-n.fresh{ background:#ff3b30; }',
      '.ned-ev-b{ display:flex; flex-direction:column; gap:2px; min-width:0; }',
      '.ned-fresh-l{ color:#d70015; font-weight:600; }',
      '.ned-share{ margin-top:10px; display:flex; gap:8px; }',
      '.ned-share .nst-link{ flex:1 1 0; }',
    ].join('\n');
    document.head.appendChild(el);
  }

  /* ── the card ────────────────────────────────────────────────────────────────────────────────── */
  let pop = null;
  function ensurePop() {
    if (pop && document.body.contains(pop)) return pop;
    style();
    pop = document.createElement('div');
    pop.className = 'country-popup nint-popup ned-popup'; pop.id = 'nedition-popup';
    pop.setAttribute('data-panel', 'news-edition');
    pop.setAttribute('role', 'dialog'); pop.setAttribute('tabindex', '-1');
    /* (data-effect) every control here READS (another day, another event) — the last-visit mark is this browser's own */
    pop.setAttribute('data-effect', 'none');
    pop.innerHTML = '<button class="country-popup-close" type="button" data-ned="close" aria-label="' + S(L('Close', '閉じる')) + '" title="' + S(L('Close', '閉じる')) + '">×</button>'
      + '<div class="country-popup-header" id="nedition-head"></div><div id="nedition-days" class="ned-days"></div><div id="nedition-body"></div>';
    (document.getElementById('map-container') || document.body).appendChild(pop);
    try { HOST.makeDraggable(pop, pop.querySelector('#nedition-head')); } catch (_) { }
    pop.addEventListener('mousedown', () => { try { HOST.bringToFront(pop); } catch (_) { } });
    pop.addEventListener('click', onClick);
    return pop;
  }
  function show() {
    const e = ensurePop(); e.style.display = 'block';
    try { HOST.bringToFront(e); } catch (_) { }
    /* on a phone the sheet holds the News list over the map the edition is drawn on — lower it to its peek */
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
    if (t.closest('[data-ned="close"]')) { close(); return; }
    const d = t.closest('[data-ned-day]');
    if (d) { const v = d.getAttribute('data-ned-day'); open(v === 'latest' ? {} : { day: v }); return; }
    if (t.closest('[data-ned="play"]')) { if (st.walking) stopWalk(); else play(); return; }
    if (t.closest('[data-ned="link"]')) { copyLink(); return; }
    if (t.closest('[data-ned="text"]')) { copyText(); return; }
    const e = t.closest('[data-ned-ev]'); if (e) { stopWalk(); openEvent(e.getAttribute('data-ned-ev')); }
  }
  async function openEvent(pid) {
    try {
      await window.IntMapLazy.need('newsEvents');
      const E = window.IntMapNewsEvents; if (!E || !E.openRow) return false;
      if (E.openByPublicId && E.openByPublicId(pid)) return true;   /* already in the loaded list: the same item */
      const { data, error } = await HOST.DB.from('news_events').select(E.columns()).eq('public_id', pid).limit(1);
      if (error || !data || !data[0]) { try { HOST.imToast(L('This event could not be loaded', 'この出来事を読み込めませんでした')); } catch (_) { } return false; }
      return E.openRow(data[0]);
    } catch (_) { return false; }
  }
  function link() { return MapState.pageLink(editionQuery(st.spec), '') || editionQuery(st.spec); }
  async function copyLink() {
    const u = link();
    try { await navigator.clipboard.writeText(u); HOST.imToast(L('Link to this edition copied', 'この版へのリンクをコピーしました')); }
    catch (_) { try { HOST.imToast(u); } catch (_) { } }
  }
  const outlets = (n) => L('{n} outlets', '{n} 媒体').replace('{n}', nf(n));
  function text() {
    if (!st.ed) return '';
    return digestLines(st.ed, {
      heading: 'IntMap — ' + titleLine() + ' · ' + windowLine(),
      line: (e) => e.title + ' — ' + [e.place || countryName(e.country), outlets(e.sources)].filter(Boolean).join(' · '),
      rule: rankRule(),
      link: link(),
    }).join('\n');
  }
  async function copyText() {
    const t = text(); if (!t) return;
    try { await navigator.clipboard.writeText(t); HOST.imToast(L('Edition copied as text', 'この版をテキストでコピーしました')); }
    catch (_) { try { HOST.imToast(L('Copying is not available in this browser', 'このブラウザではコピーできません')); } catch (_) { } }
  }
  function close() {
    stopWalk(); st.seq++; st.open = false; st.stop = -1;
    if (pop) pop.style.display = 'none';
    paint();
  }

  const titleLine = () => (st.spec.day ? L('The day on the map', 'この日の世界') : L('Today on the map', '今日の世界'));
  function windowLine() {
    const w = st.win; if (!w) return '';
    if (w.kind === 'day') return L('{d} (UTC)', '{d}（UTC）').replace('{d}', fmtDay(w.sinceMs)) + (w.untilMs - w.sinceMs < 86400000 ? ' · ' + L('so far', '途中まで') : '');
    return L('The 24 hours to {t}', '{t} までの 24 時間').replace('{t}', fmtDT(w.untilMs));
  }
  const rankRule = () => L('Ranked by the number of independent outlets that have reported each event — a count, not a judgement of importance.', '各出来事を報じた独立した媒体の数の順——数であって、重要度の判定ではありません。');
  function draw() {
    const e = ensurePop();
    e.querySelector('#nedition-head').innerHTML = '<div class="nint-h-title">' + S(titleLine()) + '</div><div class="nint-h-sub">' + S(windowLine()) + '</div>';
    /* the archive: the rolling edition and the previous days, the open one pressed */
    const now = clockMs();
    const chips = [['latest', L('Last 24 h', '直近24時間')]].concat(backDays(now).map((d) => [d, fmtD(Date.parse(d + 'T12:00:00Z'))]));
    if (st.spec.day && !chips.some((c) => c[0] === st.spec.day)) chips.push([st.spec.day, fmtD(Date.parse(st.spec.day + 'T12:00:00Z'))]);
    const cur = st.spec.day || 'latest';
    e.querySelector('#nedition-days').innerHTML = '<div class="ned-day-row" role="group" aria-label="' + S(L('Editions', '版')) + '">' + chips.map((c) =>
      '<button type="button" class="ned-day' + (c[0] === cur ? ' on' : '') + '" aria-pressed="' + (c[0] === cur ? 'true' : 'false') + '" data-ned-day="' + S(c[0]) + '">' + S(c[1]) + '</button>').join('') + '</div>';
    drawBody();
  }
  function drawBody() {
    const body = ensurePop().querySelector('#nedition-body');
    const msg = (t) => { body.innerHTML = '<div class="nint-empty">' + S(t) + '</div>'; };
    if (!st.win) return msg(L('There is no edition for that day yet.', 'その日の版はまだありません。'));
    if (st.loading) return msg(L('Reading the edition…', '版を読み込んでいます…'));
    if (st.err) return msg(failureLine());
    const E = st.ed;
    if (!E || !E.events.length) return msg(L('The news collection has no event reported during this window. It keeps events for about 30 days.', 'この期間に報じられた出来事は、ニュースの収集にありません。出来事は約 30 日保持されます。'));
    let h = '';
    if (st.win.kind === 'rolling' && st.health) {
      const v = st.health;
      h += '<div class="ned-fresh">' + freshChip({ at: v.lastOkAt, rhythmMs: v.rhythmMs, now: Date.now(), unverified: v.state === 'unverified', verb: 'updated',
        by: L('IntMap news collection', 'IntMap のニュース収集'), lang: HOST.lang, fmt: fmtDT }) + '</div>';
    }
    if (E.seenMs != null && st.sinceTotal != null) {
      h += '<div class="ned-since"><b>' + S(nf(st.sinceTotal)) + '</b><span>' + S(L('new since your last visit ({t}) · {k} of the top ten', '件が前回（{t}）から新しく報じられました・上位10件のうち {k} 件').replace('{t}', fmtDT(E.seenMs)).replace('{k}', nf(E.counts.sinceSeenTop))) + '</span></div>';
    } else if (E.seenMs != null) {
      h += '<div class="ned-since"><span>' + S(L('Could not count what is new since your last visit ({t}) — marked below: {k} of the top ten', '前回（{t}）以降の件数を数えられませんでした——上位10件のうち {k} 件に印を付けています').replace('{t}', fmtDT(E.seenMs)).replace('{k}', nf(E.counts.sinceSeenTop))) + '</span></div>';
    } else if (st.win.kind === 'rolling') {
      h += '<div class="ned-since ned-first"><span>' + S(L('From your next visit, this edition marks what was first reported since you were last here.', '次に開いたときから、前回以降に初めて報じられた出来事に印が付きます。')) + '</span></div>';
    }
    h += '<div class="nint-stats"><div class="nint-big">' + S(nf(E.counts.events)) + (E.cut ? '+' : '') + '</div><div class="nint-big-lbl">' + S(L('events reported', '件の出来事')) + '</div>'
      + '<div class="nint-sub">' + S(L('{a} new · {b} continuing from earlier · {m} by 2+ independent outlets', '新しく {a} 件・以前から続く {b} 件・独立した2媒体以上 {m} 件')
        .replace('{a}', nf(E.counts.new)).replace('{b}', nf(E.counts.continuing)).replace('{m}', nf(E.counts.multiSource))) + '</div></div>';
    if (E.cut) h += '<div class="nint-empty">' + S(L('The window holds at least {n} events; the first {n} by rank are shown.', 'この期間には少なくとも {n} 件あり、順位の上位 {n} 件を表示しています。').replace(/\{n\}/g, nf(EDITION.LIMIT))) + '</div>';
    h += '<div class="ned-ctl"><button type="button" class="nst-btn nst-play" data-ned="play"></button><span class="ned-ctl-l">' + S(L('Play the edition — visit the top ten on the map', '版を再生——上位10件を地図で順に巡る')) + '</span></div>';
    h += '<div class="nint-sec">' + S(L('Most reported events', '最も多く報じられた出来事')) + '</div><ol class="ned-top"></ol>';
    if (E.categories.length) {
      const max = E.categories[0].n;
      h += '<div class="nint-sec">' + S(L('Topics', 'カテゴリ')) + '</div><div class="nint-cats">' + E.categories.map((c) =>
        '<div class="nint-cat-row"><span class="nint-cat-name">' + S(catName(c.key)) + '</span><span class="nint-cat-bar"><i style="width:' + Math.round((c.n / max) * 100) + '%"></i></span><span class="nint-cat-n">' + S(nf(c.n)) + '</span></div>').join('') + '</div>';
    }
    if (E.countries.length) {
      h += '<div class="nint-sec">' + S(L('Reported from {n} countries', '{n} か国から報道')).replace('{n}', S(nf(E.countries.length))) + '</div><div class="nst-reached">'
        + E.countries.slice(0, 12).map((c) => '<span class="nst-cc">' + S(countryName(c.key)) + ' ' + S(nf(c.n)) + '</span>').join('') + (E.countries.length > 12 ? '<span class="nst-cc">+' + S(nf(E.countries.length - 12)) + '</span>' : '') + '</div>';
    }
    if (E.counts.unplaced || E.counts.atSea) h += '<div class="nint-foot nint-cov">' + S(L('{u} with no place · {x} at sea — counted and ranked, not drawn on the map', '地点不明 {u} 件・海上 {x} 件——数えて順位にも入れており、地図には描かれません').replace('{u}', nf(E.counts.unplaced)).replace('{x}', nf(E.counts.atSea))) + '</div>';
    h += '<div class="nint-foot nint-cov">' + S(rankRule() + ' ' + (st.win.kind === 'day'
      ? L('An event is in this edition if it was reported during the day; for a past day the counts are the event\'s counts now, not as they stood that day.', 'その日に報じられていた出来事がこの版に入ります。過去の日の件数は、その日の時点ではなく現在の件数です。')
      : L('An event is in this edition if it was reported during the window. Numbered pins are the top ten, red where first reported since your last visit; grey dots are every other placed event.', 'この期間に報じられていた出来事がこの版に入ります。番号のピンが上位10件で、前回以降に初めて報じられたものは赤。灰色の点はその他の地点のある出来事です。'))) + '</div>';
    h += '<div class="ned-share"><button type="button" class="nst-link" data-ned="link">' + S(L('Copy link to this edition', 'この版へのリンクをコピー')) + '</button>'
      + '<button type="button" class="nst-link" data-ned="text">' + S(L('Copy as text', 'テキストでコピー')) + '</button></div>';
    body.innerHTML = h;
    drawList(); drawControls();
  }
  /* the list is redrawn alone when the walk moves, so the card does not jump */
  function drawList() {
    const ol = pop && pop.querySelector('.ned-top'); if (!ol || !st.ed) return;
    const stops = walkOrder(st.ed), cur = st.stop >= 0 && stops[st.stop] ? stops[st.stop].id : null;
    ol.innerHTML = st.ed.top.map((e) => {
      const where = e.place || countryName(e.country) || L('no place', '地点不明');
      const when = e.isNew ? L('New · first reported {t}', '新しく報道・初報 {t}').replace('{t}', fmtDT(e.at)) : L('Continuing since {d}', '{d} から続く').replace('{d}', fmtD(e.at));
      const meta = [where, outlets(e.sources), catName(e.cat), when].filter(Boolean).join(' · ');
      return '<li><button type="button" class="nint-ev ned-ev' + (e.id === cur ? ' cur' : '') + '" data-ned-ev="' + S(e.id) + '"><span class="ned-n' + (e.sinceSeen ? ' fresh' : '') + '">' + S(e.n) + '</span><span class="ned-ev-b"><span class="nint-ev-t">' + S(e.title) + '</span><span class="nint-ev-m">' + S(meta)
        + (e.sinceSeen ? ' · <b class="ned-fresh-l">' + S(L('New since your last visit', '前回以降')) + '</b>' : '') + '</span></span></button></li>';
    }).join('');
    if (cur) { const b = ol.querySelector('.ned-ev.cur'); try { b && b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) { } }
  }
  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
  function drawControls() {
    if (!pop) return;
    const b = pop.querySelector('[data-ned="play"]'); if (!b) return;
    b.innerHTML = st.walking ? ICON_PAUSE : ICON_PLAY;
    b.setAttribute('aria-label', st.walking ? L('Pause', '一時停止') : L('Play the edition', '版を再生'));
    b.setAttribute('title', b.getAttribute('aria-label'));
    b.disabled = !walkOrder(st.ed).length;
  }
  /* what the card says when the read failed — the reason the failure carried, never «no news» */
  function failureLine() {
    const f = st.fail || { kind: 'failed', code: null };
    const not = L(' — this does not mean there was no news', '（ニュースが無かったという意味ではありません）');
    if (f.kind === 'timeout') return L('The news collection stopped before it finished (the database time limit)', 'ニュースの収集が時間内に終えられず打ち切りました（データベースの時間上限）') + not;
    if (f.kind === 'denied') return L('The news collection refused this request (permission)', 'ニュースの収集がこの要求を拒否しました（権限）') + not;
    if (f.kind === 'missing') return L('The news collection is not available on this server', 'このサーバーにはニュースの収集がありません') + not;
    if (f.kind === 'unavailable') return L('The news collection answered, but its database was unavailable', 'ニュースの収集は応答しましたが、そのデータベースが利用できませんでした') + not;
    if (f.kind === 'unreachable') return L('The news collection could not be reached (no network answer)', 'ニュースの収集に到達できませんでした（ネットワークの応答がありません）') + not;
    return L('The news collection returned an error', 'ニュースの収集がエラーを返しました') + (f.code ? ' (' + f.code + ')' : '') + not;
  }

  /** summary() — what Atlas is handed: the window, the counts, the top with each one's standing, the topics and the
      countries, what is new since the last visit, and what was not placed */
  function summary() {
    const E = st.ed, w = st.win;
    const base = { ok: !st.err && !!w, open: st.open, kind: w ? w.kind : null, day: st.spec.day || null,
      since: w ? new Date(w.sinceMs).toISOString() : null, until: w ? new Date(w.untilMs).toISOString() : null,
      error: st.err || (w ? null : 'no_such_day'), errorKind: st.fail ? st.fail.kind : null, errorCode: st.fail ? st.fail.code : null,
      link: link(), ranking: 'independent outlets that have reported the event, then articles, then the earlier first report' };
    if (!E) return Object.assign(base, { events: 0 });
    return Object.assign(base, {
      events: E.counts.events, cut: E.cut, newInWindow: E.counts.new, continuing: E.counts.continuing, multiSource: E.counts.multiSource,
      unplaced: E.counts.unplaced, atSea: E.counts.atSea,
      lastVisit: E.seenMs != null ? new Date(E.seenMs).toISOString() : null, newSinceLastVisit: E.seenMs != null ? st.sinceTotal : null, newSinceLastVisitInTop: E.counts.sinceSeenTop,
      visitMarked: st.marked,
      top: E.top.map((e) => ({ rank: e.n, title: e.title, place: e.place, country: countryName(e.country), category: e.cat, outlets: e.sources, articles: e.articles,
        firstReported: new Date(e.at).toISOString(), newInWindow: e.isNew, newSinceLastVisit: e.sinceSeen, publicId: e.id })),
      categories: E.categories.map((c) => ({ category: c.key, events: c.n })),
      countries: E.countries.slice(0, 15).map((c) => ({ country: countryName(c.key), events: c.n })),
      painted: st.painted, paintError: st.paintError || null, playing: !!st.walking,
      source: 'IntMap news collection (public.news_events)',
    });
  }

  /* ⚠ A basemap swap discards the LAYERS, not the clicks: the engine registers a layer's click / hover by layer id on
     the map (js/geo-engine.js onLayer → map.on(type, layerId, fn)), and that registration outlives setStyle. Re-wiring
     here added a second delegated click per swap, and one tap then opened the event once per swap. Only repaint. */
  try { GE().events.on('styledata', () => { if (st.open && !GE().layers.hasSource(SRC)) { paint(); } }); } catch (_) { }
  try { bus.on('intmap-lang', () => setTimeout(() => { if (st.open) draw(); }, 30)); } catch (_) { }

  const API = { open, close, play, pause: stopWalk, goTo, summary, link, text,
    isOpen: () => st.open,
    state: () => ({ open: st.open, day: st.spec.day || null, loading: st.loading, error: st.err || null, errorKind: st.fail ? st.fail.kind : null,
      events: st.ed ? st.ed.counts.events : 0, top: st.ed ? st.ed.top.length : 0, stop: st.stop, playing: !!st.walking, painted: st.painted, paintError: st.paintError || null }) };
  window.__imNewsEdition = API;
  return API;
}
