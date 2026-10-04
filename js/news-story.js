/* ============================================================================
 *  IntMap · js/news-story.js — A NEWS STORY, PLAYED ON THE MAP  (news-story)
 * ----------------------------------------------------------------------------
 *  «Follow this story» on an event (the event reader), a link `?story=afd,victory`, the IntMapOS command
 *  `newsstory.open` and Atlas `news.story` all open the same card: every event whose headline names the
 *  chosen words, from the first report to the latest, as
 *    · a timeline of new events per day, with a playhead that can be played, stepped and dragged;
 *    · the map: each report at its place, coloured by when it was first reported, the day under the playhead
 *      ringed, and the spread — each newly reached place joined to the nearest place reported before it;
 *    · the spread in numbers (places, countries, farthest from the first report) on the playhead's day;
 *    · the events of the playhead's day, which open in the same reader as the News list.
 *  The words are chips the reader can switch; the words first switched on are js/news-story-core.js `suggest()`.
 *
 *  ⚠ NOTHING HERE DECIDES A FACT. Which events a set of words holds is the server's (public.news_story, the one
 *    word-cutting rule public.news_title_terms); which words to suggest, the days, the places, the countries and
 *    the spread are js/news-story-core.js. This file fetches, paints and words.
 *  ⚠ A STORY IS A STATED QUERY: the card always says «headlines naming …», and never that IntMap judged the
 *    events to be one story. A line on the map says which place was reported after which, never a cause.
 *  ⚠ IT FOLLOWS CHRONOS: the story ends at the master clock's instant (the news pulse's `clockUntil`), so a
 *    story opened with the clock on 15 September is that story as it stood that day.
 *  Lazy: js/lazy-modules.js `newsStory`; the doors are js/news-pulse.js (boot). IntMap's words, en + jp.
 * ==========================================================================*/
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { IntMapTime } from './chronos.js';
import { MapState } from './map-state.js';   /* (map-document-unify) the one link assembly (pageLink) */
import { everyTick, stopTick } from './runtime.js';
import { makeCountryIndex, isIso2, arc } from './news-intel-core.js';
import { STORY, decodeTerms, suggest, buildStory, frameAt, storyQuery, storyFromSearch, isTerm, failureOf } from './news-story-core.js';

export function newsStory(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const LOC = () => { try { return IntMapLang.locale(HOST.lang); } catch (_) { return 'en'; } };
  const nf = (v) => { try { return Number(v).toLocaleString(LOC()); } catch (_) { return String(v); } };
  const fmtD = (ms) => { try { return new Date(ms).toLocaleDateString(LOC(), { month: 'short', day: 'numeric', timeZone: 'UTC' }); } catch (_) { return new Date(ms).toISOString().slice(0, 10); } };
  const fmtDT = (ms) => { try { return new Date(ms).toLocaleString(LOC(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch (_) { return new Date(ms).toISOString(); } };
  const DAY = 86400000;
  const SRC = 'nstory-src', EDGE = 'nstory-edge', PAST = 'nstory-pt', NOW = 'nstory-now';
  /* one step of the playhead. Long enough to read the day's headlines change and see the rings move; a 30-day
     story plays in under half a minute. Expires with nothing — it is a pace, not a measurement. */
  const STEP_MS = 900;
  /* the columns a story row needs — the event's own facts, not its articles (those are fetched when one is opened) */
  const COLS = 'public_id,representative_title,rep_lng,rep_lat,rep_place_name_en,primary_category,first_published_at,first_seen_at,last_article_at,article_count,independent_source_count';
  /* when an event was first reported, as a colour: early → late (the timeline's bars use the same three) */
  const RAMP = [0, '#7cc4ff', 0.5, '#0a84ff', 1, '#5e2ca5'];

  const st = { open: false, seq: 0, terms: [], seed: null, stats: null, sug: null, rows: null, story: null, frame: -1,
    loading: false, err: '', fail: null, playing: null, untilMs: null, painted: 0, paintError: '' };
  /* a failed read is recorded as WHY it failed (js/news-story-core.js failureOf) — the card and Atlas say which */
  const failed = (e) => { st.err = (e && e.message) || String(e); st.fail = failureOf(e); };

  /* ── the clock: the story ends at the master clock's instant ─────────────────────────────────── */
  function clockUntil() {
    try { const s = IntMapTime.state(); return s.isLive ? Date.now() : new Date(s.when).getTime(); } catch (_) { return Date.now(); }
  }

  /* ── countries, through the boot facade's one outline loader (js/news-pulse.js `outlines`) ───── */
  let geoP = null;
  function countries() {
    if (!geoP) {
      geoP = window.IntMapNewsIntel.outlines('10m').then((fc) => makeCountryIndex((fc && fc.features) || []))
        .catch((e) => { geoP = null; throw e; });
    }
    return geoP;
  }
  let index = null;
  function countryName(k) {
    if (!k) return '';
    if (isIso2(k)) { try { const n = new Intl.DisplayNames([LOC()], { type: 'region' }).of(k); if (n && n !== k) return n; } catch (_) { } }
    return index ? index.name(k) : k;
  }

  /* ── the data ────────────────────────────────────────────────────────────────────────────────── */
  function span() {
    const until = clockUntil();
    return { since: new Date(until - STORY.SPAN_DAYS * DAY).toISOString(), until: new Date(until).toISOString(), untilMs: until };
  }
  async function fetchTerms(text, sp) {
    if (!HOST.DB || typeof HOST.DB.rpc !== 'function') throw new Error('no database client');
    const { data, error } = await HOST.DB.rpc('news_story_terms', { p_text: String(text || '').slice(0, 400), p_since: sp.since, p_until: sp.until, p_max_share: STORY.MAX_SHARE }, { get: true });
    if (error) throw error;
    return decodeTerms(data);
  }
  async function fetchRows(terms, sp) {
    if (!HOST.DB || typeof HOST.DB.rpc !== 'function') throw new Error('no database client');
    const { data, error } = await HOST.DB.rpc('news_story', { p_terms: terms, p_since: sp.since, p_until: sp.until })
      .select(COLS).order('first_published_at', { ascending: true }).limit(STORY.LIMIT);
    if (error) throw error;
    return data || [];
  }

  /** open({ text, terms, from }) — the story of a headline (`text`, its words suggested) or of chosen words (`terms`).
      `from` is the public_id of the event it was opened from, marked in the list. Resolves to the summary Atlas reads. */
  async function open(o) {
    const p = o || {};
    const my = ++st.seq;
    pause();
    st.open = true; st.err = ''; st.fail = null; st.loading = true; st.rows = null; st.story = null; st.frame = -1;
    st.seed = p.from ? { id: String(p.from), title: String(p.text || '') } : (p.text ? { id: null, title: String(p.text) } : null);
    const asked = Array.isArray(p.terms) ? p.terms : (typeof p.terms === 'string' ? p.terms.split(/[,\s]+/) : (p.search ? (storyFromSearch(p.search) || []) : []));
    const want = Array.from(new Set(asked.map((t) => String(t).normalize('NFKC').trim().toLowerCase()))).filter(isTerm).slice(0, STORY.MAX_TERMS);
    st.terms = want;
    show(); draw();
    const sp = span(); st.untilMs = sp.untilMs;
    try {
      /* the words' counts are asked for the headline AND the words asked for, so a word chosen elsewhere (a link, Atlas) is a chip too */
      const [stats, idx] = await Promise.all([fetchTerms([p.text || '', want.join(' ')].join(' ').trim(), sp), countries().catch(() => null)]);
      if (my !== st.seq) return null;
      index = idx; st.stats = stats; st.sug = suggest(stats);
      if (!st.terms.length && st.sug.pick) st.terms = st.sug.pick.terms.slice();
      /* a word the server does not cut from this text (its rule is news_title_terms) can match no headline — it is not asked with */
      const known = new Set(stats.terms.map((x) => x.t));
      st.terms = st.terms.filter((t) => known.has(t));
      if (st.terms.length) await load(my, sp);
    } catch (e) { if (my === st.seq) failed(e); }
    if (my !== st.seq) return null;
    st.loading = false;
    draw(); paint();
    return summary();
  }
  async function load(my, sp) {
    const rows = await fetchRows(st.terms, sp);
    if (my !== st.seq) return;
    st.rows = rows;
    st.story = buildStory(rows, { keyAt: index ? index.keyAt : null, limit: STORY.LIMIT });
    st.frame = st.story.days.length - 1;
    fit();
  }
  /** setTerms(terms) — switch the words (the chips); the playhead goes back to the whole story */
  async function setTerms(terms) {
    const known = new Set(((st.stats && st.stats.terms) || []).map((x) => x.t));
    const next = Array.from(new Set((terms || []).map((t) => String(t).toLowerCase()))).filter((t) => isTerm(t) && known.has(t)).slice(0, STORY.MAX_TERMS);
    const my = ++st.seq;
    pause();
    st.terms = next; st.rows = null; st.story = null; st.frame = -1; st.err = ''; st.fail = null;
    if (!next.length) { st.loading = false; draw(); paint(); return summary(); }
    st.loading = true; draw();
    try { await load(my, { since: new Date(st.untilMs - STORY.SPAN_DAYS * DAY).toISOString(), until: new Date(st.untilMs).toISOString() }); } catch (e) { if (my === st.seq) failed(e); }
    if (my !== st.seq) return null;
    st.loading = false; draw(); paint();
    return summary();
  }

  /* ── playing ─────────────────────────────────────────────────────────────────────────────────── */
  function seek(i) {
    if (!st.story || !st.story.days.length) return null;
    st.frame = Math.max(0, Math.min(st.story.days.length - 1, i | 0));
    drawFrame(); paint();
    return st.frame;
  }
  function play() {
    if (!st.story || st.story.days.length < 2) return false;
    if (st.frame >= st.story.days.length - 1) st.frame = -1;
    pause();
    st.playing = everyTick('news-story:play', STEP_MS, () => {
      if (!st.story || st.frame >= st.story.days.length - 1) { pause(); return; }
      seek(st.frame + 1);
    });
    seek(st.frame + 1);
    drawControls();
    return true;
  }
  function pause() {
    if (st.playing) { try { stopTick(st.playing); } catch (_) { } st.playing = null; }
    drawControls();
  }

  /* ── the map ─────────────────────────────────────────────────────────────────────────────────── */
  function whenDrawable(fn) {
    const can = () => { try { return !!HOST.canDraw(); } catch (_) { return false; } };
    if (can()) { fn(); return; }
    try { GE().whenCanDraw().then(fn); } catch (_) { }
  }
  function features() {
    const S2 = st.story; if (!st.open || !S2 || st.frame < 0) return [];
    const F = frameAt(S2, st.frame);
    const t0 = S2.firstAt, t1 = Math.max(S2.lastAt, t0 + 1);
    const nowIds = new Set(F.now.map((e) => e.id));
    const out = [];
    for (const x of F.edges) {
      out.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: arc(x.from, x.to, 24) }, properties: { now: x.day === F.day ? 1 : 0 } });
    }
    for (const e of F.past.concat(F.now)) {
      if (!e.p) continue;
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: e.p },
        properties: { pid: e.id, f: (e.at - t0) / (t1 - t0), src: e.sources, now: nowIds.has(e.id) ? 1 : 0 } });
    }
    return out;
  }
  function paint() {
    const data = { type: 'FeatureCollection', features: features() };
    whenDrawable(() => {
      try {
        if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
        else {
          GE().layers.addSource(SRC, { type: 'geojson', data });
          GE().layers.add({ id: EDGE, type: 'line', source: SRC, filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'line-color': '#0a84ff', 'line-width': ['case', ['==', ['get', 'now'], 1], 2.2, 1.3], 'line-opacity': ['case', ['==', ['get', 'now'], 1], 0.95, 0.45], 'line-dasharray': [2, 1.5] } });
          GE().layers.add({ id: PAST, type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'src'], 1, 4.5, 6, 9], 'circle-color': ['interpolate', ['linear'], ['get', 'f']].concat(RAMP),
              'circle-opacity': ['case', ['==', ['get', 'now'], 1], 1, 0.55], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2 } });
          GE().layers.add({ id: NOW, type: 'circle', source: SRC, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'now'], 1]],
            paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'src'], 1, 10, 6, 15], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#ff9f0a', 'circle-stroke-width': 2.4 } });
          wire();
        }
        [EDGE, PAST, NOW].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', st.open ? 'visible' : 'none'); });
        /* ⚠ counted from the map, not from the intention (js/news-intel.js's rule) */
        st.painted = GE().layers.has(PAST) ? data.features.filter((f) => f.geometry.type === 'Point').length : 0;
        st.paintError = '';
      } catch (e) { st.painted = 0; st.paintError = (e && e.message) || 'paint_failed'; }
    });
  }
  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    try {
      GE().events.onLayer('mouseenter', PAST, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
      GE().events.onLayer('mouseleave', PAST, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
      GE().events.onLayer('click', PAST, (ev) => {
        const f = ev && ev.features && ev.features[0]; const pid = f && f.properties && f.properties.pid;
        if (!pid) return;
        try { GE().events.claimClick(ev); } catch (_) { }   /* the tap belongs to the report, not to the place name beneath it */
        openEvent(String(pid));
      });
    } catch (_) { }
  }
  function fit() {
    const pts = ((st.story && st.story.places) || []).map((P) => P.p);
    if (!pts.length) return;
    let w = 180, s = 90, e = -180, n = -90;
    for (const p of pts) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
    whenDrawable(() => {
      try {
        if (pts.length === 1) GE().camera.flyTo({ center: pts[0], zoom: 5, speed: 1.0 });
        else GE().camera.fitBounds([[w, s], [e, n]], { padding: clearOfCard(), maxZoom: 6, duration: 900 });
      } catch (_) { }
    });
  }
  /* the story is fitted into the part of the map the card does not cover: measured on the page, the card on the
     right of a desktop map (and over the top of a phone's) hid a third of the places it had just framed */
  function clearOfCard() {
    const pad = { top: 60, bottom: 60, left: 60, right: 60 };
    try {
      if (!pop || pop.style.display === 'none') return pad;
      const c = GE().render.canvas().getBoundingClientRect(), r = pop.getBoundingClientRect();
      const cover = { right: c.right - r.left, left: r.right - c.left, bottom: c.bottom - r.top, top: r.bottom - c.top };
      /* the side the card sits against is the one with the least of the map behind it */
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
    pop = document.createElement('div');
    pop.className = 'country-popup nint-popup nstory-popup'; pop.id = 'nstory-popup';
    pop.setAttribute('data-panel', 'news-story');
    pop.setAttribute('role', 'dialog'); pop.setAttribute('tabindex', '-1');
    /* (data-effect) every control here READS (another set of words, another day) — it writes nothing */
    pop.setAttribute('data-effect', 'none');
    pop.innerHTML = '<button class="country-popup-close" type="button" data-nst="close" aria-label="' + S(L('Close', '閉じる')) + '" title="' + S(L('Close', '閉じる')) + '">×</button>'
      + '<div class="country-popup-header" id="nstory-head"></div><div id="nstory-terms" class="nst-terms"></div><div id="nstory-body"></div>';
    (document.getElementById('map-container') || document.body).appendChild(pop);
    try { HOST.makeDraggable(pop, pop.querySelector('#nstory-head')); } catch (_) { }
    pop.addEventListener('mousedown', () => { try { HOST.bringToFront(pop); } catch (_) { } });
    pop.addEventListener('click', onClick);
    pop.addEventListener('input', (ev) => { const r = ev.target && ev.target.closest && ev.target.closest('[data-nst="scrub"]'); if (r) { pause(); seek(+r.value); } });
    pop.addEventListener('keydown', (ev) => {
      if (!st.story) return;
      if (ev.key === 'ArrowLeft' && !(ev.target && ev.target.matches && ev.target.matches('input'))) { pause(); seek(st.frame - 1); ev.preventDefault(); }
      else if (ev.key === 'ArrowRight' && !(ev.target && ev.target.matches && ev.target.matches('input'))) { pause(); seek(st.frame + 1); ev.preventDefault(); }
    });
    return pop;
  }
  function show() {
    const e = ensurePop(); e.style.display = 'block';
    try { HOST.bringToFront(e); } catch (_) { }
    /* on a phone the event reader holds the sheet at full height over the map the story is drawn on — lower it to
       its peek (js/monitors.js does the same for a card that belongs to the map) */
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
    if (t.closest('[data-nst="close"]')) { close(); return; }
    const c = t.closest('[data-nst-term]');
    if (c) { const w = c.getAttribute('data-nst-term'); const on = st.terms.indexOf(w) >= 0; setTerms(on ? st.terms.filter((x) => x !== w) : st.terms.concat([w])); return; }
    const ch = t.closest('[data-nst-choice]');
    if (ch) { setTerms(String(ch.getAttribute('data-nst-choice')).split(',')); return; }
    if (t.closest('[data-nst="play"]')) { if (st.playing) pause(); else play(); return; }
    if (t.closest('[data-nst="prev"]')) { pause(); seek(st.frame - 1); return; }
    if (t.closest('[data-nst="next"]')) { pause(); seek(st.frame + 1); return; }
    if (t.closest('[data-nst="all"]')) { pause(); seek((st.story ? st.story.days.length : 1) - 1); fit(); return; }
    if (t.closest('[data-nst="link"]')) { copyLink(); return; }
    const d = t.closest('[data-nst-day]'); if (d) { pause(); seek(+d.getAttribute('data-nst-day')); return; }
    const e = t.closest('[data-nst-ev]'); if (e) { openEvent(e.getAttribute('data-nst-ev')); }
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
  function link() {
    const q = storyQuery(st.terms); if (!q) return '';
    return MapState.pageLink(q, '') || q;   /* (map-document-unify) the one link assembly */
  }
  async function copyLink() {
    const u = link(); if (!u) return;
    try { await navigator.clipboard.writeText(u); HOST.imToast(L('Link to this story copied', 'このストーリーへのリンクをコピーしました')); }
    catch (_) { try { HOST.imToast(u); } catch (_) { } }
  }
  function close() {
    pause(); st.seq++; st.open = false; st.frame = -1;
    if (pop) pop.style.display = 'none';
    paint();
  }

  const quote = (t) => L('“{t}”', '「{t}」').replace('{t}', t);
  const namingLine = () => st.terms.length
    ? L('Headlines naming {w}', '見出しに {w} を含む出来事').replace('{w}', st.terms.map(quote).join(L(' and ', ' と ')))
    : L('Choose the words that make the story', 'ストーリーにする語を選んでください');
  function draw() {
    const e = ensurePop();
    const head = e.querySelector('#nstory-head'), terms = e.querySelector('#nstory-terms');
    head.innerHTML = '<div class="nint-h-title">' + S(L('Story', 'ストーリー')) + '</div><div class="nint-h-sub">' + S(namingLine()) + '</div>';
    /* the words: switched on ones first, then the rest of the headline's (names first, the rarest first) */
    let th = '';
    const sug = st.sug;
    if (sug && sug.chips.length) {
      const chips = sug.chips.slice().sort((a, b) => (st.terms.indexOf(b.t) >= 0) - (st.terms.indexOf(a.t) >= 0));
      th += '<div class="nst-chips" role="group" aria-label="' + S(L('Words of the headline', '見出しの語')) + '">' + chips.slice(0, 14).map((c) => {
        const on = st.terms.indexOf(c.t) >= 0;
        return '<button type="button" class="nst-chip' + (on ? ' on' : '') + (c.common ? ' common' : '') + '" aria-pressed="' + (on ? 'true' : 'false') + '" data-nst-term="' + S(c.t) + '" title="'
          + S(L('{n} events name it in the last {d} days', '直近{d}日で {n} 件の見出しにある').replace('{n}', nf(c.df)).replace('{d}', String(STORY.SPAN_DAYS))) + '">' + S(c.t) + '<span class="nst-chip-n">' + S(nf(c.df)) + '</span></button>';
      }).join('') + '</div>';
      const alts = sug.choices.filter((c) => c.terms.join(',') !== st.terms.slice().sort().join(',') && c.terms.join(',') !== st.terms.join(',')).slice(0, 3);
      if (alts.length) th += '<div class="nst-alts"><span>' + S(L('Other threads:', '他の流れ:')) + '</span>' + alts.map((c) => '<button type="button" class="nst-alt" data-nst-choice="' + S(c.terms.join(',')) + '">' + S(c.terms.join(' + ')) + ' <span class="nst-chip-n">' + S(nf(c.n)) + '</span></button>').join('') + '</div>';
    }
    terms.innerHTML = th;
    drawFrame();
  }
  function timelineSVG(S2) {
    const n = S2.days.length, W = 320, H = 54, bw = W / n, max = Math.max(1, ...S2.days.map((d) => d.events.length));
    let bars = '';
    for (let i = 0; i < n; i++) {
      const d = S2.days[i], v = d.events.length, h = v ? Math.max(3, Math.round((v / max) * (H - 6))) : 0;
      const cls = i === st.frame ? 'nst-bar-now' : i < st.frame ? 'nst-bar-past' : 'nst-bar-next';
      bars += '<rect data-nst-day="' + i + '" x="' + (i * bw + 0.5).toFixed(1) + '" y="' + (H - h) + '" width="' + Math.max(1, bw - 1.5).toFixed(1) + '" height="' + h + '" class="' + cls + '"><title>' + S(fmtD(d.t) + ': ' + v) + '</title></rect>'
        + '<rect data-nst-day="' + i + '" x="' + (i * bw).toFixed(1) + '" y="0" width="' + bw.toFixed(1) + '" height="' + H + '" class="nst-hit"></rect>';
    }
    const x = (st.frame + 0.5) * bw;
    return '<svg class="nst-time" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + S(L('New events per day', '1日あたりの新しい出来事')) + '">' + bars
      + '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="0" y2="' + H + '" class="nst-head"></line></svg>'
      + '<div class="nint-spark-lbl"><span>' + S(fmtD(S2.days[0].t)) + '</span><span>' + S(L('new events per day (UTC)', '1日あたりの新しい出来事（UTC）')) + '</span><span>' + S(fmtD(S2.days[n - 1].t)) + '</span></div>';
  }
  const ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
  const ICON_PREV = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h2v11H3zM14 2.5v11L6 8z" fill="currentColor"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2.5h2v11h-2zM2 2.5v11L10 8z" fill="currentColor"/></svg>';
  function drawControls() {
    if (!pop) return;
    const b = pop.querySelector('[data-nst="play"]'); if (!b) return;
    b.innerHTML = st.playing ? ICON_PAUSE : ICON_PLAY;
    b.setAttribute('aria-label', st.playing ? L('Pause', '一時停止') : L('Play the story day by day', '日ごとに再生'));
    b.setAttribute('title', b.getAttribute('aria-label'));
  }
  /* ⚠ THE CONTROLS ARE BUILT ONCE PER STORY AND THEIR STATE RE-SET ON EVERY FRAME: rebuilding them would move the
     slider out from under the finger dragging it (js/news-intel.js's legend has the same rule) */
  let built = -1;
  function drawFrame() {
    const e = ensurePop(); const body = e.querySelector('#nstory-body');
    const msg = (t) => { built = -1; body.innerHTML = '<div class="nint-empty">' + S(t) + '</div>'; };
    if (st.loading) return msg(L('Reading the story…', 'ストーリーを読み込んでいます…'));
    if (st.err) return msg(failureLine());
    if (!st.terms.length) {
      return msg(st.sug && st.sug.chips.length
        ? L('No word of this headline is shared by enough other events to make a thread on its own. Switch on words above to follow them.', 'この見出しには、それだけで流れになるほど他の出来事と共有されている名前がありません。上の語を選ぶと、その語で追えます。')
        : L('No word of this headline appears in another event of the last {d} days.', 'この見出しの語は、直近{d}日の他の出来事に出てきません。').replace('{d}', String(STORY.SPAN_DAYS)));
    }
    const S2 = st.story;
    if (!S2 || !S2.events.length) return msg(L('No event in the last {d} days has all of these words in its headline.', '直近{d}日に、これらの語をすべて見出しに含む出来事はありません。').replace('{d}', String(STORY.SPAN_DAYS)));
    if (built !== st.seq || !body.querySelector('.nst-dyn')) {
      built = st.seq;
      let h = '<div class="nint-stats"><div class="nint-big">' + S(nf(S2.events.length)) + (S2.cut ? '+' : '') + '</div><div class="nint-big-lbl">' + S(L('events in this story', '件の出来事')) + '</div>'
        + '<div class="nint-sub">' + S(L('{a} – {b} · {d} days with new reports · {m} reported by 2+ independent outlets', '{a}〜{b}・新しい報道があった日 {d} 日・独立した2媒体以上 {m} 件')
          .replace('{a}', fmtD(S2.firstAt)).replace('{b}', fmtD(S2.lastAt)).replace('{d}', nf(S2.days.filter((d) => d.events.length).length)).replace('{m}', nf(S2.multiSource))) + '</div></div>';
      if (S2.cut) h += '<div class="nint-empty nst-cut">' + S(L('Showing the first {n} events — there are more. Add a word to narrow the story.', '最初の {n} 件を表示しています（さらにあります）。語を足すと絞り込めます。').replace('{n}', nf(STORY.LIMIT))) + '</div>';
      h += '<div class="nst-tl"></div>';
      h += '<div class="nst-ctl"><button type="button" class="nst-btn" data-nst="prev" aria-label="' + S(L('Previous day', '前の日')) + '" title="' + S(L('Previous day', '前の日')) + '">' + ICON_PREV + '</button>'
        + '<button type="button" class="nst-btn nst-play" data-nst="play"></button>'
        + '<button type="button" class="nst-btn" data-nst="next" aria-label="' + S(L('Next day', '次の日')) + '" title="' + S(L('Next day', '次の日')) + '">' + ICON_NEXT + '</button>'
        + '<input type="range" class="nst-scrub" data-nst="scrub" min="0" max="' + (S2.days.length - 1) + '" step="1" value="' + Number(st.frame) + '" aria-label="' + S(L('Day of the story', 'ストーリーの日')) + '">'
        + '<button type="button" class="nst-all" data-nst="all">' + S(L('Whole story', '全体')) + '</button></div>';
      h += '<div class="nst-dyn"></div>';
      if (S2.unplaced || S2.atSea) h += '<div class="nint-foot nint-cov">' + S(L('{u} with no place · {x} at sea — in the timeline and the list, not on the map', '地点不明 {u} 件・海上 {x} 件——年表と一覧には入っており、地図には描かれません').replace('{u}', nf(S2.unplaced)).replace('{x}', nf(S2.atSea))) + '</div>';
      h += '<div class="nint-foot nint-cov">' + S(L('A story here is every event whose headline names these words — chosen from the headline, changeable above. IntMap does not judge that the events are one story. A dashed line joins each newly reported place to the nearest place reported before it; it is the order of the reports, not a cause.', 'ここでのストーリーは、見出しにこれらの語を含む出来事のすべてです（語は見出しから選んでおり、上で変えられます）。IntMap がそれらを 1 つの話だと判定したものではありません。破線は、新しく報じられた地点を、それより前に報じられた最も近い地点と結んだもので、報道の順序であって原因ではありません。')) + '</div>';
      h += '<div class="nst-share"><button type="button" class="nst-link" data-nst="link">' + S(L('Copy link to this story', 'このストーリーへのリンクをコピー')) + '</button></div>';
      body.innerHTML = h;
    }
    const F = frameAt(S2, st.frame), sp = F.spread || {};
    const whole = st.frame === S2.days.length - 1;
    body.querySelector('.nst-tl').innerHTML = timelineSVG(S2);
    const r = body.querySelector('.nst-scrub'); if (r && document.activeElement !== r) r.value = String(st.frame);
    const all = body.querySelector('.nst-all'); if (all) all.classList.toggle('on', whole);
    const dayT = Date.parse(F.day + 'T00:00:00Z');
    let h = '<div class="nst-day">' + S(whole ? L('Up to {d}', '{d} まで').replace('{d}', fmtD(dayT)) : fmtD(dayT)) + '</div>';
    h += '<div class="nst-spread"><div><b>' + S(nf(sp.places || 0)) + '</b><span>' + S(L('places', '地点')) + '</span></div><div><b>' + S(nf(sp.countries || 0)) + '</b><span>' + S(L('countries', 'か国')) + '</span></div><div><b>'
      + S(nf(sp.farthestKm || 0)) + '</b><span>' + S(L('km farthest from the first report', 'km 初報の地点から最も遠い報道')) + '</span></div></div>';
    if (S2.origin) h += '<div class="nst-origin">' + S(L('First placed report: {p}, {d}', '地点のある最初の報道: {p}・{d}').replace('{p}', S2.origin.name || countryName(S2.origin.country) || '—').replace('{d}', fmtDT(S2.origin.firstAt))) + '</div>';
    const reached = S2.countries.filter((c) => c.day <= F.day);
    if (reached.length) h += '<div class="nst-reached">' + S(L('Countries in the order they were first reported:', '最初に報じられた順の国:')) + ' ' + reached.slice(0, 12).map((c) => '<span class="nst-cc' + (c.day === F.day ? ' now' : '') + '">' + S(countryName(c.key)) + '</span>').join('') + (reached.length > 12 ? '<span class="nst-cc">+' + S(nf(reached.length - 12)) + '</span>' : '') + '</div>';
    const list = whole ? S2.events.slice().reverse() : F.now;
    h += '<div class="nint-sec">' + S(whole ? L('Every event, newest first', 'すべての出来事（新しい順）') : L('New on this day', 'この日の新しい出来事')) + '</div>';
    if (!list.length) h += '<div class="nint-empty">' + S(L('No new event with these words on this day.', 'この日、これらの語を含む新しい出来事はありません。')) + '</div>';
    else h += '<ul class="nint-evs">' + list.slice(0, 40).map(evHTML).join('') + '</ul>';
    body.querySelector('.nst-dyn').innerHTML = h;
    drawControls();
  }
  function evHTML(e) {
    const meta = [e.place || (e.country ? countryName(e.country) : ''), fmtDT(e.at), L('{n} sources', '{n}媒体').replace('{n}', String(e.sources))].filter(Boolean).join(' · ');
    const seed = st.seed && st.seed.id === e.id;
    return '<li><button type="button" class="nint-ev' + (seed ? ' nst-seed' : '') + '" data-nst-ev="' + S(e.id) + '"><span class="nint-ev-t">' + S(e.title) + '</span><span class="nint-ev-m">' + S(meta) + (seed ? ' · ' + S(L('opened from here', 'ここから開いた')) : '') + '</span></button></li>';
  }

  /* what the card says when a read failed — the reason the failure carried, never «no story» */
  function failureLine() {
    const f = st.fail || { kind: 'failed', code: null };
    const not = L(' — this does not mean there is no story', '（ストーリーが無いという意味ではありません）');
    if (f.kind === 'timeout') return L('The news collection stopped before it finished counting these words (the database time limit)', 'ニュースの収集が、この語の集計を時間内に終えられず打ち切りました（データベースの時間上限）') + not;
    if (f.kind === 'denied') return L('The news collection refused this request (permission)', 'ニュースの収集がこの要求を拒否しました（権限）') + not;
    if (f.kind === 'missing') return L('The news collection does not have the story reader yet (it is not deployed on this server)', 'ニュースの収集に、ストーリーの読み口がまだありません（このサーバーには未配備です）') + not;
    if (f.kind === 'unavailable') return L('The news collection answered, but its database was unavailable', 'ニュースの収集は応答しましたが、そのデータベースが利用できませんでした') + not;
    if (f.kind === 'unreachable') return L('The news collection could not be reached (no network answer)', 'ニュースの収集に到達できませんでした（ネットワークの応答がありません）') + not;
    return L('The news collection returned an error', 'ニュースの収集がエラーを返しました') + (f.code ? ' (' + f.code + ')' : '') + not;
  }

  /** summary() — what Atlas is handed: the words, the counts, the span, the spread and the events, with what was not placed */
  function summary() {
    const S2 = st.story;
    const base = { ok: !st.err, open: st.open, terms: st.terms.slice(), naming: namingLine(), until: st.untilMs ? new Date(st.untilMs).toISOString() : null, error: st.err || null,
      errorKind: st.fail ? st.fail.kind : null, errorCode: st.fail ? st.fail.code : null,
      suggested: st.sug && st.sug.pick ? st.sug.pick.terms.slice() : null,
      choices: st.sug ? st.sug.choices.slice(0, 5).map((c) => ({ terms: c.terms, events: c.n })) : [],
      link: link() || null };
    if (!S2) return Object.assign(base, { events: 0 });
    const F = frameAt(S2, st.frame);
    return Object.assign(base, {
      events: S2.events.length, cut: S2.cut, firstReported: S2.firstAt ? new Date(S2.firstAt).toISOString() : null, latest: S2.lastAt ? new Date(S2.lastAt).toISOString() : null,
      days: S2.days.length, daysWithNews: S2.days.filter((d) => d.events.length).length, peakDay: S2.peak, multiSource: S2.multiSource,
      places: S2.places.length, unplaced: S2.unplaced, atSea: S2.atSea, farthestKm: S2.farthestKm,
      origin: S2.origin ? { place: S2.origin.name, country: countryName(S2.origin.country), at: new Date(S2.origin.firstAt).toISOString() } : null,
      countries: S2.countries.map((c) => ({ country: countryName(c.key), firstDay: c.day })),
      playhead: F.day, painted: st.painted, paintError: st.paintError || null,
      timeline: S2.events.map((e) => ({ title: e.title, place: e.place, country: countryName(e.country), firstReported: new Date(e.at).toISOString(), sources: e.sources, publicId: e.id })).slice(-60),
      source: 'IntMap news collection (public.news_events, public.news_story)',
    });
  }

  /* a basemap swap discards the layers (js/news-intel.js listens to the same signal) */
  try { GE().events.on('styledata', () => { if (st.open && !GE().layers.hasSource(SRC)) { wired = false; paint(); } }); } catch (_) { }
  try { bus.on('intmap-lang', () => setTimeout(() => { if (st.open) draw(); }, 30)); } catch (_) { }

  const API = { open, close, setTerms, play, pause, seek, summary, link,
    isOpen: () => st.open,
    state: () => ({ open: st.open, terms: st.terms.slice(), loading: st.loading, error: st.err || null, errorKind: st.fail ? st.fail.kind : null, events: st.story ? st.story.events.length : 0,
      frame: st.frame, days: st.story ? st.story.days.length : 0, playing: !!st.playing, painted: st.painted, paintError: st.paintError || null }) };
  window.__imNewsStory = API;
  return API;
}
