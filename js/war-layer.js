/* ============================================================================
 *  IntMap · THE WORLD WARS ON THE CLOCK — the layer itself   (#R349, split in two at #R409)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 While a row is on, it redraws itself for the day
 *  its own legend is standing on: who held what, where the front ran, and which operations were
 *  being fought — on that day.
 *
 *  ══ ONE FACTORY, ONE INSTANCE PER WAR   (#R409) ═════════════════════════════════════════════
 *  「WW1とWW2でレイヤーを分けろ。」 There are now TWO rows and two of everything the map carries:
 *  ww1-fill / ww1-out / ww1-front / ww1-evt / ww1-evtlbl over ww1-src / ww1-line-src / ww1-evt-src,
 *  and the same again for ww2. What is NOT duplicated is the arithmetic: data/wars.json, the
 *  CShapes table and the ring cache are read once and shared, and `makeWar()` is one closure that
 *  both instances are built from — the reason the two can never disagree about how a cut is drawn.
 *  An instance is created the first time ITS row is switched on, so a reader who only ever opens
 *  WW2 never pays for WW1's sources.
 *
 *  ══ ITS OWN CLOCK, AND CHRONOS IS NOT ITS SLAVE   (#R409) ═══════════════════════════════════
 *  「凡例内にタイムスライダーをつけろ。」「付ける。Chronosは動かすな。」 The legend carries the
 *  transport and the day slider, and BOTH move only this layer's date. Chronos is read, never
 *  written by them: a play button that dragged the master clock forward would move the news, the
 *  borders, the terminator and every statistic in the app once every hundred milliseconds.
 *  The two clocks are tied in one direction and it is stated in the legend:
 *    · switching the row ON seeds the layer's date from Chronos — and, if Chronos is outside this
 *      war, moves Chronos to the war's first day, ONCE, because a layer switched on into an empty
 *      map is a layer that looks broken (the reader chose this over a legend that only offers a
 *      button);
 *    · moving Chronos afterwards re-seeds the layer and PAUSES playback — an explicit move of the
 *      master clock wins over an animation — but ONLY when the instant lands inside this war. A
 *      clock at 1916 says nothing about WW2, so the WW2 layer holds the day it was showing rather
 *      than clamping itself to 1 September 1939;
 *    · moving the slider, or playing, changes nothing but this layer.
 *  ⚠ Chronos has no ticker (js/chronos.js broadcasts only when something sets it), so «follow
 *  Chronos» cannot fight the slider on its own.
 *
 *  ══ IT ARRIVES WHEN SOMEBODY ASKS, AND NOT BEFORE ═══════════════════════════════════════════
 *  ⚠ THIS FILE IS NOT IN src/main.js. js/war-fronts.js is — a shell that builds the two Layers rows
 *  and the IntMapOS commands and nothing else — and it fetches this one through js/lazy-modules.js
 *  the first time a row is switched on. The reason is measured rather than stylistic: eager and
 *  whole, these files cost tens of kB on EVERY session, and both rows are off by default. That is
 *  precisely what scripts/perf-budget.mjs exists to notice.
 *
 *  ══ WHERE EVERY SHAPE ON SCREEN COMES FROM ══════════════════════════════════════════════════
 *   · the OUTLINES are CShapes 2.0 (data/cshapes.js — already on the machine, the time machine loads
 *     it), taken at the EXACT DATE rather than by year, which is how Poland can exist on 1 September
 *     1939 and be redrawn on 8 May 1945 without this file knowing anything about borders;
 *   · WHO HELD each of them is data/wars.json, keyed by CShapes' own gwcode, changing on the days the
 *     record gives;
 *   · the AREA either side of a front is not stored anywhere — it is cut from the outline by the line
 *     itself, in js/war-geom.js, by the same code scripts/build-wars.mjs used to prove the line cuts
 *     the country it claims to and that named cities land under the right army;
 *   · the COLOUR AND NAME OF EACH KIND OF OPERATION are the shipped `kinds` table (#R409). They are
 *     not written here: a kind that had a colour in this file and no name in the record was exactly
 *     how three kinds came to exist with nothing checking the record against them.
 *
 *  ⚠ THE LINE ON SCREEN IS ALWAYS DATED, AND THE DATE IS NOT TODAY'S. The record gives front
 *  positions for the days somebody wrote one down. Between those days this layer holds the last one
 *  and the legend says which day it is from — it never slides a line to make the animation smooth,
 *  because a line that moves on a day no source describes is a claim nobody made.
 * ==========================================================================*/
import { WarGeom } from './war-geom.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.warLayer = function (HOST) {
  const LA = window.IntMapLang.pickArgs();
  const L = window.IntMapLang.pick(() => HOST.lang);
  const GE = () => window.IntMapGeoEngine;

  let data = null, cs = null, loading = null;
  const insts = new Map();          /* war id → the instance, built on that row's first ON */

  const canDraw = () => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } };
  /* a 9-language object out of data/wars.json — the keys are js/lang-registry.js's own codes */
  const say = (o) => (o && (o[HOST.lang] || o.en)) || '';
  const iso = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10); };
  const esc = (x) => HOST.escapeHtml(String(x == null ? '' : x));
  /* the Wikipedia subdomain for the reader's language — the registry's BCP-47 tag with the script
     subtag stripped, because zh-hans.wikipedia.org does not exist (js/atlas-sources.js, #R318). */
  const wikiHost = () => { try { return String(window.IntMapLang.htmlTag(HOST.lang) || 'en').split('-')[0].toLowerCase() || 'en'; } catch (_) { return 'en'; } };
  const DAY = 86400000;
  const dayOf = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / DAY);
  const addDays = (d, n) => new Date((dayOf(d) + n) * DAY).toISOString().slice(0, 10);
  const clampDate = (d, lo, hi) => (d < lo ? lo : (d > hi ? hi : d));

  /* ⚠ (#R409) A FIGURE IS A CITED RANGE, NOT A MEASUREMENT. `cas` / `str` are «commonly cited, both
     sides together»; a pair means the sources disagree and the legend prints both ends. Compact
     notation is the reader's own — 1.2M in English is 120万 in Japanese. */
  let _nfKey = null, _nf = null;
  function num(n) {
    try {
      const tag = window.IntMapLang.htmlTag(HOST.lang) || 'en';
      if (_nfKey !== tag) { _nf = new Intl.NumberFormat(tag, { notation: 'compact', maximumFractionDigits: 1 }); _nfKey = tag; }
      return _nf.format(n);
    } catch (_) { return String(n); }
  }
  const figure = (v) => (Array.isArray(v) ? (num(v[0]) + '–' + num(v[1])) : num(v));

  /* ── the two files, read once and shared by both wars ───────────────────────────────────────── */
  function loadCShapes() {
    if (window.__CSHAPES) { cs = window.__CSHAPES; return Promise.resolve(cs); }
    return new Promise((res) => {
      const s = document.createElement('script');
      s.src = new URL('data/cshapes.js', document.baseURI || './').href; s.async = true;
      s.onload = () => { cs = window.__CSHAPES || null; res(cs); };
      s.onerror = () => res(null);
      document.head.appendChild(s);
    });
  }
  function load() {
    if (data && cs) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        const base = document.baseURI || './';
        const [a] = await Promise.all([
          fetch(new URL('data/wars.json', base).href).then((r) => (r.ok ? r.json() : null)),
          loadCShapes(),
        ]);
        data = a;
        return !!(data && cs);
      } catch (_) { return false; } finally { loading = null; }
    })();
    return loading;
  }

  /* ── reading CShapes at an exact instant (js/time-borders.js reads it by YEAR; a war does not) ─ */
  const dnum = (d) => { const p = String(d).split('-'); return (+p[0]) * 10000 + (+p[1]) * 100 + (+p[2]); };
  const geomCache = new Map();
  function polysOf(i) {
    let g = geomCache.get(i); if (g) return g;
    g = cs.feats[i][8].map((poly) => poly.map((ri) => cs.rings[ri]));
    geomCache.set(i, g); return g;
  }
  function entitiesAt(dateStr) {
    const t = dnum(dateStr), out = [];
    for (let i = 0; i < cs.feats.length; i++) {
      const f = cs.feats[i];
      if (f[2] * 10000 + f[3] * 100 + f[4] > t) continue;
      if (f[5] * 10000 + f[6] * 100 + f[7] < t) continue;
      out.push({ i, name: f[0], gw: f[1] });
    }
    return out;
  }

  const warById = (id) => (data && data.wars.find((w) => w.id === id)) || null;
  /* the window the layer draws — DERIVED at build time so nothing in the record is unreachable
     (the assassination at Sarajevo is 30 days before WW1's `from` and was never on screen). */
  const spanOf = (w) => (w && w.span) || [w.from, w.to];

  /* ── the stylesheet, once for both instances ────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('war-css')) return;
    const s = document.createElement('style'); s.id = 'war-css';
    /* ⚠ NO BACK-TICK MAY APPEAR ANYWHERE BELOW, comments included — CONSTITUTION §2. Every rule is
       a single-quoted string joined at the end, so there is no template literal to terminate. */
    s.textContent = [
      '.war-leg{font-size:11.5px;line-height:1.45;}',
      '.war-leg h5{margin:8px 0 4px;font-size:11px;font-weight:600;color:var(--text-main);}',
      '.war-when{font-size:12.5px;font-weight:600;color:var(--text-main);margin:6px 0 2px;font-variant-numeric:tabular-nums;}',
      '.war-key{display:flex;align-items:center;gap:6px;margin:3px 0;}',
      '.war-key i{flex:0 0 auto;width:11px;height:11px;border-radius:3px;font-style:normal;}',
      '.war-kind{display:flex;align-items:center;gap:6px;margin:3px 0;color:var(--text-muted);}',
      '.war-kind i{flex:0 0 auto;width:9px;height:9px;border-radius:50%;border:1px solid #1b1b1f;font-style:normal;}',
      '.war-fr{margin:4px 0;padding-left:12px;position:relative;color:var(--text-muted);}',
      '.war-fr::before{content:"";position:absolute;left:0;top:6px;width:8px;height:0;border-top:2px dashed var(--text-main);opacity:.75;}',
      '.war-fr b{color:var(--text-main);font-weight:600;}',
      '.war-ev{margin:3px 0;color:var(--text-muted);}',
      '.war-ev b{color:var(--text-main);font-weight:600;}',
      '.war-ev i{display:inline-block;width:8px;height:8px;border-radius:50%;border:1px solid #1b1b1f;margin-right:4px;vertical-align:baseline;}',
      '.war-fig{font-variant-numeric:tabular-nums;opacity:.9;}',
      '.war-more{margin:3px 0;color:var(--text-muted);font-size:10px;}',
      '.war-note{margin-top:7px;font-size:10px;color:var(--text-muted);line-height:1.4;}',
      '.war-src{margin-top:4px;font-size:9.5px;color:var(--text-muted);line-height:1.35;}',
      '.war-go{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;}',
      '.war-go button{flex:1 1 auto;min-width:96px;padding:7px 8px;border-radius:9px;border:1px solid rgba(128,128,128,0.28);'
        + 'background:var(--input-bg);color:var(--text-main);font-size:11.5px;cursor:pointer;}',
      '.war-go button:hover{background:var(--primary-color);color:#fff;border-color:transparent;}',
      '.war-ctl{display:flex;align-items:center;gap:6px;margin:4px 0 2px;flex-wrap:wrap;font-size:10.5px;color:var(--text-muted);}',
      '.war-ctl input[type=date],.war-ctl select{padding:2px 5px;border-radius:6px;border:1px solid var(--glass-border,rgba(128,128,128,0.25));'
        + 'background:var(--input-bg);color:var(--text-main);font-size:10.5px;font-variant-numeric:tabular-nums;}',
      '.war-ctl input[type=date]{flex:1 1 auto;min-width:112px;}',
      /* ⚠⚠⚠ (#R409) THE PROSE SCROLLS AND THE CONTROLS DO NOT, AND THIS WAS MEASURED ON A
         SCREENSHOT. A day of July 1943 has four fronts with their notes and a list of operations;
         with the transport and the slider added on top, the box grew past the top of a 900 px
         window — and because a .data-legend is anchored by its BOTTOM, what fell off the screen
         was the header and every control this round exists to add. The reader could see the war
         and not the slider. Desktop has no height cap on .data-legend at all (mobile has had one
         since #R215), so the bound belongs to the part that varies: the text. */
      '.war-info{max-height:min(42vh,380px);overflow-y:auto;overscroll-behavior:contain;}',
      /* …except on the narrow layout, where the whole box already scrolls — two nested scroll
         areas on a phone is a trap, not a feature */
      '@media (max-width:768px){.war-info{max-height:none;overflow:visible;}}',
      '.war-pop{font-size:12px;} .war-pop-h{display:block;font-size:13px;margin-bottom:2px;}',
      '.war-pop-y{color:var(--text-muted);font-size:11px;font-variant-numeric:tabular-nums;}',
      '.war-pop-f{display:flex;align-items:center;gap:6px;margin-top:5px;}',
      '.war-pop-f i{width:11px;height:11px;border-radius:3px;}',
      '.war-pop-k{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--text-muted);font-size:11px;}',
      '.war-pop-k i{width:9px;height:9px;border-radius:50%;border:1px solid #1b1b1f;}',
      '.war-pop-n{margin-top:5px;font-size:11px;color:var(--text-muted);font-variant-numeric:tabular-nums;}',
      '.war-pop-a{display:inline-block;margin-top:6px;font-size:11.5px;}',
    ].join('');
    document.head.appendChild(s);
  }

  /* ══ ONE WAR ════════════════════════════════════════════════════════════════════════════════ */
  function makeWar(warId) {
    const P = warId + '-';                                   /* ww1- / ww2- */
    const IDS = [P + 'fill', P + 'out', P + 'front', P + 'evt', P + 'evtlbl'];
    const SRC = P + 'src', SRC_L = P + 'line-src', SRC_E = P + 'evt-src';
    const CB = 'dl-' + warId;

    let on = false, popup = null;
    let shownKey = null, curDate = null, curFronts = [], curFrame = null;
    let playT = null, stepDays = 5;

    const war = () => warById(warId);
    const setVis = (v) => IDS.forEach((id) => { try { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', v ? 'visible' : 'none'); } catch (_) { } });

    /* ── what is true in this war on this day ─────────────────────────────────────────────────── */
    function baseFaction(W, gw, dateStr) {
      const tl = W.control[gw]; if (!tl) return 'NEUTRAL';
      let f = 'NEUTRAL';
      for (const [d, k] of tl) { if (d <= dateStr) f = k; }
      return f;
    }
    /* every front that is drawing a line today, with the line it is drawing */
    function activeFronts(W, dateStr) {
      const out = [];
      for (const F of W.fronts) {
        if (F.until && dateStr >= F.until) continue;
        let cur = null;
        for (const D of F.dates) { if (D.d <= dateStr) cur = D; }
        if (!cur || !cur.pts.length) continue;
        out.push({ F, D: cur, left: cur.left || F.left, right: cur.right || F.right });
      }
      return out;
    }
    /* ⚠ the SAME shape scripts/build-wars.mjs passes to WarGeom — one definition of «today's cuts» */
    const cutsFor = (fronts, gw) => fronts.filter((a) => a.D.cuts.indexOf(gw) >= 0)
      .map((a) => ({ pts: a.D.pts, left: a.left, right: a.right }));

    /* how big a dot an operation gets: 0 when the record carries no figure, 3 for the ones that
       cost a million. Computed here rather than in a MapLibre expression because the shipped value
       may be a pair, and `['get','cas']` cannot compare an array. */
    function magOf(v) {
      if (v == null) return 0;
      const hi = Array.isArray(v) ? v[1] : v;
      return hi >= 1000000 ? 3 : (hi >= 200000 ? 2 : (hi >= 50000 ? 1 : 0));
    }

    /* ── build the four FeatureCollections for one instant ────────────────────────────────────── */
    function build(dateStr) {
      const W = war(); if (!W) return null;
      const sp = spanOf(W);
      if (dateStr < sp[0] || dateStr > sp[1]) return null;
      const fronts = activeFronts(W, dateStr);
      const areas = { type: 'FeatureCollection', features: [] };
      for (const e of entitiesAt(dateStr)) {
        const base = baseFaction(W, e.gw, dateStr);
        const cuts = cutsFor(fronts, e.gw);
        let pieces;
        try { pieces = WarGeom.warPieces(polysOf(e.i), base, cuts); }
        catch (_) { pieces = [{ faction: base, polys: polysOf(e.i) }]; }   /* a country whose cut cannot be computed is drawn whole, under whoever the record says holds it — never dropped */
        for (const p of pieces) {
          const fac = W.factions[p.faction] || W.factions.NEUTRAL;
          areas.features.push({
            type: 'Feature',
            geometry: { type: 'MultiPolygon', coordinates: p.polys },
            properties: { col: fac.col, gw: e.gw, nm: e.name, fac: p.faction, facnm: say(fac.name) },
          });
        }
      }
      /* the lines, and a POINT per line for its label. ⚠ (#R398) `symbol-placement:'line'` draws
         nothing on a source like this one — measured there as 0 labels against 25 for points — so
         the name is anchored at the line's own midpoint instead of asked to follow it. */
      const lines = { type: 'FeatureCollection', features: [] };
      const labels = { type: 'FeatureCollection', features: [] };
      for (const a of fronts) {
        lines.features.push({
          type: 'Feature', geometry: { type: 'LineString', coordinates: a.D.pts },
          properties: { id: a.F.id, nm: say(a.F.name), d: a.D.d },
        });
        const mid = a.D.pts[Math.floor(a.D.pts.length / 2)];
        if (mid) labels.features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: mid }, properties: { nm: say(a.F.name), kind: '' } });
      }
      const evList = W.events.filter((v) => v.d <= dateStr && (v.d2 || v.d) >= dateStr);
      const evts = {
        type: 'FeatureCollection',
        features: evList.map((v) => ({
          type: 'Feature', geometry: { type: 'Point', coordinates: v.at },
          properties: {
            nm: say(v.name), d: v.d, d2: v.d2 || '', wiki: v.wiki, kind: v.kind || 'battle',
            mag: magOf(v.cas), str: v.str == null ? '' : figure(v.str), cas: v.cas == null ? '' : figure(v.cas),
          },
        })),
      };
      for (const f of evts.features) labels.features.push({ type: 'Feature', geometry: f.geometry, properties: { nm: f.properties.nm, kind: f.properties.kind } });
      return { war: W, fronts, areas, lines, labels, evts, evList };
    }

    /* ── the layers ───────────────────────────────────────────────────────────────────────────── */
    function kindColourExpr() {
      const k = (data && data.kinds) || {};
      const out = ['match', ['get', 'kind']];
      for (const [key, v] of Object.entries(k)) { if (key !== 'battle') out.push(key, v.col); }
      out.push((k.battle && k.battle.col) || '#ffffff');
      return out;
    }
    function ensure() {
      if (GE().layers.hasSource(SRC)) return true;
      if (!canDraw()) return false;
      try {
        const empty = { type: 'FeatureCollection', features: [] };
        /* ⚠ (#R409) THE ATTRIBUTION IS THE RECORD'S OWN. `data.src` was written by
           scripts/build-wars.mjs from the first day and nothing had ever read it — the credit on
           screen was a second string, hand-kept in this file, that named CShapes and not the
           record. One sentence, one place, and the legend prints the same one. */
        const attrib = (data && data.src) || 'CShapes 2.0 (Schvitz et al. 2022)';
        GE().layers.addSource(SRC, { type: 'geojson', data: empty, attribution: attrib });
        GE().layers.addSource(SRC_L, { type: 'geojson', data: empty });
        GE().layers.addSource(SRC_E, { type: 'geojson', data: empty });
        const before = GE().layers.has('tool-poly') ? 'tool-poly' : undefined;
        GE().layers.add({ id: P + 'fill', type: 'fill', source: SRC, layout: { visibility: 'none' }, paint: { 'fill-color': ['coalesce', ['get', 'col'], 'rgba(0,0,0,0)'], 'fill-opacity': 0.55 } }, before);
        GE().layers.add({ id: P + 'out', type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-color': 'rgba(255,255,255,0.45)', 'line-width': 0.6 } }, before);
        GE().layers.add({
          id: P + 'front', type: 'line', source: SRC_L, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#1b1b1f', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.0, 6, 3.4], 'line-dasharray': [2.4, 1.2], 'line-opacity': 0.92 },
        }, before);
        GE().layers.add({
          id: P + 'evt', type: 'circle', source: SRC_E, layout: { visibility: 'none' },
          paint: {
            /* (#R409) the dot grows with the commonly cited cost, so a reader can see at a glance
               which of the twenty operations running today is Verdun. `mag` is 0 when the record
               carries no figure — an unmeasured operation is drawn at the base size, not hidden. */
            'circle-radius': ['interpolate', ['linear'], ['zoom'],
              2, ['+', 3.6, ['*', 0.85, ['coalesce', ['get', 'mag'], 0]]],
              6, ['+', 5.6, ['*', 1.5, ['coalesce', ['get', 'mag'], 0]]]],
            'circle-color': kindColourExpr(),
            'circle-stroke-color': '#1b1b1f', 'circle-stroke-width': 1.4, 'circle-opacity': 0.95,
          },
        }, before);
        GE().layers.add({
          id: P + 'evtlbl', type: 'symbol', source: SRC_LBL(), minzoom: 4.2,
          layout: {
            /* ⚠ the scale is guarded: this file is LAZY, and a paint expression that throws inside
               `ensure()` is caught by its own try and reported as «cannot draw» — the layer would
               simply never appear, with nothing in the console to say why. */
            visibility: 'none', 'text-field': ['get', 'nm'],
            'text-size': (window.IntMapLabelScale ? window.IntMapLabelScale.sub(0.82) : 11),
            'text-font': ['literal', ['Noto Sans Regular']], 'text-offset': [0, 1.0], 'text-anchor': 'top', 'text-optional': true,
          },
          paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.78)', 'text-halo-width': 1.3 },
        }, before);
        try { GE().events.onLayer('click', P + 'evt', onEvent); } catch (_) { }
        try { GE().events.onLayer('click', P + 'fill', onArea); } catch (_) { }
        try {
          GE().events.onLayer('mouseenter', P + 'evt', () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
          GE().events.onLayer('mouseleave', P + 'evt', () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
        } catch (_) { }
        return true;
      } catch (_) { return false; }
    }
    /* the label source is its own, because a symbol layer over the line source would try to place
       a name on every vertex of a front */
    const SRC_B = P + 'lbl-src';
    function SRC_LBL() {
      if (!GE().layers.hasSource(SRC_B)) GE().layers.addSource(SRC_B, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      return SRC_B;
    }

    /* ⚠ «THE STYLE IS NOT READY» IS NOT «THERE IS NOTHING TO DRAW». `canDraw()` is false for the whole
       of a cold load and for a second or two after every basemap swap, and the first version of this
       file answered that by returning false and forgetting — so a row switched on during the load, or
       a date set from Atlas before the map settled, left the layer silently empty until the reader
       happened to move the clock again. It is the shape #R140 fixed in js/time-borders.js and the same
       answer applies: ask again shortly. `_pending` keeps it to ONE outstanding retry.
       ⚠ AND THE RETRY IS A POLL, NOT AN `idle` LISTENER. `once('idle', …)` was written first and is
       the wrong instrument for exactly this case: a map that is ALREADY idle never fires it again, so
       the one situation where the retry is cheapest to satisfy is the one where it would never come. */
    let _pending = null, _timer = null, _tries = 0;
    function whenDrawable(fn) {
      if (canDraw()) { fn(); return true; }
      _pending = fn; _tries = 0;
      if (_timer) return false;
      const tick = () => {
        _timer = null;
        const f = _pending;
        if (!f) return;
        if (canDraw()) { _pending = null; f(); return; }
        if (++_tries > 40) { _pending = null; return; }   /* ~12 s; a map that never draws is not our fault to log */
        _timer = setTimeout(tick, 300);
      };
      _timer = setTimeout(tick, 300);
      return false;
    }

    function paint(dateStr) {
      if (!ensure()) { whenDrawable(() => { shownKey = null; paint(dateStr); }); return false; }
      if (shownKey === dateStr) return true;
      const r = build(dateStr);
      shownKey = dateStr; curDate = dateStr; curFronts = (r && r.fronts) || [];
      curFrame = r;
      const empty = { type: 'FeatureCollection', features: [] };
      try {
        GE().layers.setSourceData(SRC, r ? r.areas : empty);
        GE().layers.setSourceData(SRC_L, r ? r.lines : empty);
        GE().layers.setSourceData(SRC_E, r ? r.evts : empty);
        GE().layers.setSourceData(SRC_B, r ? r.labels : empty);
      } catch (_) { }
      renderPanel(r);
      return true;
    }

    /* ── clicks ───────────────────────────────────────────────────────────────────────────────── */
    function show(lngLat, html) {
      if (popup) { try { popup.remove(); } catch (_) { } }
      popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, className: 'plc-popup', maxWidth: '300px' }).setLngLat(lngLat).setHTML(html));
    }
    function onArea(ev) {
      try {
        const f = ev && ev.features && ev.features[0]; if (!f) return;
        const p = f.properties || {};
        show(ev.lngLat, '<div class="war-pop"><b class="war-pop-h">' + esc(p.nm) + '</b>'
          + '<div class="war-pop-y">' + esc(curDate) + '</div>'
          + '<div class="war-pop-f"><i style="background:' + esc(p.col) + '"></i>' + esc(p.facnm) + '</div></div>');
      } catch (_) { }
    }
    function onEvent(ev) {
      try {
        const f = ev && ev.features && ev.features[0]; if (!f) return;
        const p = f.properties || {};
        const span = p.d2 && p.d2 !== p.d ? (p.d + ' – ' + p.d2) : p.d;
        const K = (data && data.kinds && data.kinds[p.kind]) || null;
        let h = '<div class="war-pop"><b class="war-pop-h">' + esc(p.nm) + '</b>'
          + '<div class="war-pop-y">' + esc(span) + '</div>';
        if (K) h += '<div class="war-pop-k"><i style="background:' + esc(K.col) + '"></i>' + esc(say(K.name)) + '</div>';
        if (p.str) h += '<div class="war-pop-n">' + esc(L('Forces engaged', '投入兵力', 'Eingesetzte Kräfte', 'Задействованные силы', 'Fuerzas empleadas')) + ': ' + esc(p.str) + '</div>';
        /* ⚠ (#R409) THE KEY IS «Casualties and prisoners», NOT «Casualties». The short word is
           already an inline key in this app meaning 人的被害 (a disaster's human toll), and fr / ko /
           zh resolve an inline string BY ITS ENGLISH TEXT — one row cannot carry two meanings, so
           reusing it would have printed the disaster wording here in four languages.
           `npm run check:i18n` names exactly this collision. */
        if (p.cas) h += '<div class="war-pop-n">' + esc(L('Casualties and prisoners', '死傷・捕虜', 'Verluste und Gefangene', 'Потери и пленные', 'Bajas y prisioneros')) + ': ' + esc(p.cas) + '</div>';
        if (p.str || p.cas) h += '<div class="war-pop-n" style="opacity:.75;">' + esc(L('Commonly cited totals, both sides together.', 'いずれも一般に引用される両軍合計の数値。', 'Häufig zitierte Gesamtzahlen, beide Seiten zusammen.', 'Обычно цитируемые итоги по обеим сторонам.', 'Totales habitualmente citados, ambos bandos juntos.')) + '</div>';
        h += '<a class="war-pop-a" target="_blank" rel="noopener" href="https://' + wikiHost()
          + '.wikipedia.org/wiki/' + esc(p.wiki) + '">Wikipedia</a></div>';
        show(ev.lngLat, h);
      } catch (_) { }
    }

    /* ── the layer's own clock ────────────────────────────────────────────────────────────────── */
    function setDate(d, opts) {
      const W = war(); if (!W) return;
      const sp = spanOf(W);
      const next = clampDate(d, sp[0], sp[1]);
      if (next === curDate && shownKey === next) { if (opts && opts.force) renderPanel(); return; }
      paint(next);
    }
    function stopPlay() { if (playT) { clearInterval(playT); playT = null; } }
    function togglePlay() {
      const W = war(); if (!W) return;
      if (playT) { stopPlay(); renderPanel(); return; }
      const sp = spanOf(W);
      if (curDate >= sp[1]) setDate(sp[0]);
      playT = setInterval(() => {
        /* ⚠ a hidden document does not animate — the frames nobody sees still cut the Soviet Union */
        if (document.hidden) return;
        const s = spanOf(war() || W);
        const next = addDays(curDate || s[0], stepDays);
        if (next >= s[1]) { setDate(s[1]); stopPlay(); renderPanel(); return; }
        setDate(next);
      }, 110);
      renderPanel();
    }

    /* ── the legend ───────────────────────────────────────────────────────────────────────────── */
    function transportHTML() {
      const B = window.IntMapWxPlayer;
      if (!B) return '';
      const playing = !!playT;
      return '<div class="ecl-player">'
        + B.b('first', L('First day', '最初の日', 'Erster Tag', 'Первый день', 'Primer día'), B.IC.first)
        + B.b('prev', L('One day back', '1日戻る', 'Ein Tag zurück', 'На день назад', 'Un día atrás'), B.IC.prev)
        + B.b('play', (playing ? L('Pause', '一時停止', 'Pause', 'Пауза', 'Pausa') : L('Play', '再生', 'Abspielen', 'Воспроизвести', 'Reproducir')), (playing ? B.IC.pause : B.IC.play), 'ecl-play')
        + B.b('next', L('One day forward', '1日進む', 'Ein Tag vor', 'На день вперёд', 'Un día adelante'), B.IC.next)
        + B.b('clock', L('Match the time machine', 'タイムマシンに合わせる', 'Der Zeitmaschine folgen', 'Синхронизировать с машиной времени', 'Igualar la máquina del tiempo'), L('Clock', '時計', 'Uhr', 'Часы', 'Reloj'), 'ecl-now')
        + '</div>';
    }
    function sliderHTML(sp) {
      const n = dayOf(sp[1]) - dayOf(sp[0]);
      const i = Math.max(0, Math.min(n, dayOf(curDate || sp[0]) - dayOf(sp[0])));
      const pct = n > 0 ? ((i / n) * 100) : 0;
      const speeds = [[1, L('1 day', '1日', '1 Tag', '1 день', '1 día')],
        [5, L('5 days', '5日', '5 Tage', '5 дней', '5 días')],
        [15, L('15 days', '15日', '15 Tage', '15 дней', '15 días')]];
      return '<input type="range" class="ecl-timerange war-range" min="0" max="' + n + '" step="1" value="' + i + '" '
        + 'aria-label="' + esc(L('Day', '日付', 'Tag', 'Дата', 'Día')) + '" style="--ntl-fill:' + pct.toFixed(1) + '%;">'
        + '<div class="ecl-timescale"><span>' + esc(sp[0]) + '</span><span>' + esc(sp[1]) + '</span></div>'
        + '<div class="war-ctl">'
        + '<input type="date" class="war-day" min="' + esc(sp[0]) + '" max="' + esc(sp[1]) + '" value="' + esc(curDate || sp[0]) + '">'
        + '<label style="display:flex;align-items:center;gap:4px;">' + esc(L('Step', '刻み', 'Schritt', 'Шаг', 'Paso'))
        + '<select class="war-speed">' + speeds.map((s) => '<option value="' + s[0] + '"' + (s[0] === stepDays ? ' selected' : '') + '>' + esc(s[1]) + '</option>').join('') + '</select></label>'
        + '</div>';
    }
    function wireLegend(body, sp) {
      const rng = body.querySelector('.war-range');
      const dayIn = body.querySelector('.war-day');
      const spd = body.querySelector('.war-speed');
      const fill = (el) => { try { const mn = +el.min, mx = +el.max; el.style.setProperty('--ntl-fill', (mx > mn ? (((+el.value - mn) / (mx - mn)) * 100) : 0) + '%'); } catch (_) { } };
      if (rng) {
        /* the range emits `input` on every pixel; the date field follows it without a re-render, and
           the frame is rebuilt on each step because one day IS the unit here (there is nothing to
           fetch — the cut is arithmetic on data already in memory) */
        rng.addEventListener('input', () => { stopPlay(); fill(rng); const d = addDays(sp[0], +rng.value); if (dayIn) dayIn.value = d; setDate(d); });
      }
      if (dayIn) dayIn.addEventListener('change', () => { stopPlay(); if (dayIn.value) setDate(dayIn.value); });
      if (spd) spd.addEventListener('change', () => { stepDays = +spd.value || 1; });
      body.querySelectorAll('.ecl-b').forEach((b) => {
        b.onclick = () => {
          const a = b.getAttribute('data-act');
          if (a === 'play') { togglePlay(); return; }
          stopPlay();
          if (a === 'first') setDate(sp[0]);
          else if (a === 'prev') setDate(addDays(curDate || sp[0], -1));
          else if (a === 'next') setDate(addDays(curDate || sp[0], 1));
          else if (a === 'clock') { let d = null; try { d = window.IntMapTime.isLive() ? iso(new Date()) : window.IntMapTime.iso(); } catch (_) { } if (d) setDate(d); }
          renderPanel();
        };
      });
    }

    /* ⚠⚠⚠ (#R409) THE CONTROLS ARE BUILT ONCE AND UPDATED IN PLACE, AND THAT IS NOT A REFINEMENT.
       The first version rebuilt the whole legend body on every date change — which is what a range
       emitting `input` on every pixel of a drag does — so the element the finger was holding was
       REPLACED between two frames of its own drag. The slider let go after one pixel and playback
       tore the play button out from under the click that started it. What may be rewritten every
       frame is the prose; the controls may not.
       ⚠ And `_tileLegends()` re-lays out EVERY legend on the map; at nine frames a second that is
       the animation's whole cost. It runs when the box was rebuilt, and when the reader is not
       playing — never inside the loop. */
    function syncControls(body, sp) {
      const rng = body.querySelector('.war-range');
      const dayIn = body.querySelector('.war-day');
      const n = dayOf(sp[1]) - dayOf(sp[0]);
      const i = Math.max(0, Math.min(n, dayOf(curDate || sp[0]) - dayOf(sp[0])));
      if (rng) { rng.value = String(i); try { rng.style.setProperty('--ntl-fill', (n > 0 ? ((i / n) * 100) : 0) + '%'); } catch (_) { } }
      /* never type over the reader's own keystrokes (a native date field emits a complete value
         per digit — #R378 — so an overwrite here would fight them character by character) */
      if (dayIn && document.activeElement !== dayIn) dayIn.value = curDate || sp[0];
      const pb = body.querySelector('.ecl-b.ecl-play');
      const B = window.IntMapWxPlayer;
      if (pb && B) {
        const playing = !!playT;
        const lbl = playing ? L('Pause', '一時停止', 'Pause', 'Пауза', 'Pausa') : L('Play', '再生', 'Abspielen', 'Воспроизвести', 'Reproducir');
        pb.innerHTML = playing ? B.IC.pause : B.IC.play;
        pb.setAttribute('aria-label', lbl); pb.setAttribute('title', lbl);
      }
    }

    function renderPanel(frame) {
      if (frame !== undefined) curFrame = frame;
      const box = document.getElementById('data-legend-' + warId); if (!box) return;
      css();
      const body = box.querySelector('.war-leg') || (() => { const d = document.createElement('div'); d.className = 'war-leg'; box.appendChild(d); return d; })();
      const W = war();
      const sp = W ? spanOf(W) : null;
      if (!W || !curDate || !curFrame) {
        body.dataset.built = '';
        body.innerHTML = '<div class="war-note">'
          + esc(L('This layer draws the days of one war. Move its slider, or jump to the first day:',
            'このレイヤーは1つの大戦の日々を描きます。下のスライダーを動かすか、開戦日へ飛んでください:',
            'Diese Ebene zeigt die Tage eines Krieges. Bewegen Sie den Regler oder springen Sie zum ersten Tag:',
            'Этот слой показывает дни одной войны. Двигайте ползунок или перейдите к первому дню:',
            'Esta capa muestra los días de una guerra. Mueva el control o salte al primer día:'))
          + '</div><div class="war-go">'
          + (W ? '<button data-d="' + esc(sp[0]) + '">' + esc(say(W.name)) + '</button>' : '')
          + '</div>';
        body.querySelectorAll('.war-go button').forEach((b) => { b.onclick = () => setDate(b.dataset.d); });
        try { window._tileLegends && window._tileLegends(); } catch (_) { }
        return;
      }
      const sig = sp[0] + '|' + sp[1] + '|' + String(HOST.lang);
      if (body.dataset.built !== sig) {
        body.innerHTML = '<div class="war-when"></div>' + transportHTML() + sliderHTML(sp) + '<div class="war-info"></div>';
        body.dataset.built = sig;
        wireLegend(body, sp);
      }
      body.querySelector('.war-when').textContent = say(W.name) + ' · ' + curDate;
      syncControls(body, sp);
      let h = '';
      /* only the sides that are actually on screen right now */
      const seen = new Set();
      ((curFrame && curFrame.areas.features) || []).forEach((f) => seen.add(f.properties.fac));
      const keys = Object.keys(W.factions).filter((k) => seen.has(k));
      h += keys.map((k) => '<div class="war-key"><i style="background:' + esc(W.factions[k].col) + '"></i>'
        + esc(say(W.factions[k].name)) + '</div>').join('');
      if (curFronts.length) {
        h += '<h5>' + esc(L('Front lines', '戦線', 'Frontlinien', 'Линии фронта', 'Líneas del frente')) + '</h5>';
        h += curFronts.map((a) => '<div class="war-fr"><b>' + esc(say(a.F.name)) + '</b> — '
          + esc(L('line of', '戦線の日付', 'Linie vom', 'линия от', 'línea del')) + ' ' + esc(a.D.d)
          + (a.D.note ? ('<br>' + esc(say(a.D.note))) : '') + '</div>').join('');
      }
      /* ⚠ (#R409) THE LIST IS RANKED AND THE REMAINDER IS COUNTED OUT LOUD. Twenty operations can be
         running on one day of 1944; a legend that silently kept the first ten would be telling the
         reader that ten is all there were. */
      const evs = (curFrame && curFrame.evList) || [];
      if (evs.length) {
        const KI = (data && data.kinds) || {};
        const rank = evs.slice().sort((a, b) => (magOf(b.cas) - magOf(a.cas)) || (a.d < b.d ? -1 : 1));
        const showN = Math.min(10, rank.length);
        h += '<h5>' + esc(L('On this day', 'この日の出来事', 'An diesem Tag', 'В этот день', 'Ese día')) + '</h5>';
        h += rank.slice(0, showN).map((v) => {
          const K = KI[v.kind || 'battle'];
          const span = v.d2 && v.d2 !== v.d ? (v.d + ' – ' + v.d2) : v.d;
          let s = '<div class="war-ev">' + (K ? '<i style="background:' + esc(K.col) + '"></i>' : '') + '<b>' + esc(say(v.name)) + '</b><br>' + esc(span);
          const fg = [];
          if (v.str != null) fg.push(esc(L('forces', '兵力', 'Kräfte', 'силы', 'fuerzas')) + ' ' + esc(figure(v.str)));
          if (v.cas != null) fg.push(esc(L('casualties', '死傷', 'Verluste', 'потери', 'bajas')) + ' ' + esc(figure(v.cas)));
          if (fg.length) s += '<br><span class="war-fig">' + fg.join(' · ') + '</span>';
          return s + '</div>';
        }).join('');
        if (rank.length > showN) {
          h += '<div class="war-more">' + esc(L('{n} more running today', '他に{n}件が進行中', 'Noch {n} weitere an diesem Tag',
            'Ещё {n} в этот день', '{n} más ese día').replace('{n}', String(rank.length - showN))) + '</div>';
        }
        /* the key for the symbols that are actually on screen */
        const kinds = [...new Set(evs.map((v) => v.kind || 'battle'))].filter((k) => KI[k]);
        if (kinds.length) {
          h += '<h5>' + esc(L('Symbols', '記号', 'Zeichen', 'Обозначения', 'Símbolos')) + '</h5>';
          h += kinds.map((k) => '<div class="war-kind"><i style="background:' + esc(KI[k].col) + '"></i>' + esc(say(KI[k].name)) + '</div>').join('');
        }
      }
      h += '<div class="war-note">'
        + esc(L('The slider moves this layer only — it never moves the time machine. Moving the time machine brings this layer with it. Front lines are shown for the dates the record gives a position for, and hold until the next one: the date beside each line is the date it is from.',
          'スライダーはこのレイヤーだけを動かします——タイムマシンは動かしません。逆に、タイムマシンを動かすとこのレイヤーもついてきます。戦線は、記録が位置を伝えている日付についてのみ描き、次の日付まで保持します——線の横の日付が、その線の日付です。',
          'Der Regler bewegt nur diese Ebene — nie die Zeitmaschine. Umgekehrt folgt diese Ebene der Zeitmaschine. Frontlinien werden für die Tage gezeigt, für die die Quellen eine Position angeben, und gelten bis zur nächsten: das Datum neben jeder Linie ist ihr Datum.',
          'Ползунок двигает только этот слой — машину времени он не трогает. Обратно: слой следует за машиной времени. Линии фронта показаны на те даты, для которых источники дают положение, и держатся до следующей: дата рядом с линией и есть её дата.',
          'El control mueve solo esta capa: nunca la máquina del tiempo. A la inversa, esta capa sigue a la máquina del tiempo. Las líneas del frente se muestran para las fechas en que las fuentes dan una posición y se mantienen hasta la siguiente: la fecha junto a cada línea es su fecha.'))
        + '</div>';
      h += '<div class="war-src">' + esc((data && data.src) || '') + '</div>';
      body.querySelector('.war-info').innerHTML = h;
      if (!playT) { try { window._tileLegends && window._tileLegends(); } catch (_) { } }
    }

    /* ── the switch ───────────────────────────────────────────────────────────────────────────── */
    async function toggle(want) {
      on = !!want;
      if (!on) {
        stopPlay();
        setVis(false);
        if (popup) { try { popup.remove(); } catch (_) { } popup = null; }
        try { window._hideGenericLegend && window._hideGenericLegend(warId); } catch (_) { }
        return false;
      }
      const ok = await load();
      const W = war();
      if (!ok || !W) {
        try { HOST.imToast(L('Could not load the war data', '大戦データを読み込めませんでした', 'Kriegsdaten konnten nicht geladen werden', 'Не удалось загрузить данные о войнах', 'No se pudieron cargar los datos de la guerra')); } catch (_) { }
        on = false; return false;
      }
      if (!ensure()) { whenDrawable(() => { if (on) toggle(true); }); return false; }
      setVis(true);
      try {
        window._registerLayerOpacity && window._registerLayerOpacity(warId, rowName(warId), [P + 'fill'], CB);
      } catch (_) { }
      /* ⚠ (#R409) THE ONE TIME THIS LAYER WRITES CHRONOS, and the reader chose it: switching a war
         on while the master clock is somewhere else would otherwise paint an empty map. It happens
         once, on the way on, and never again — the slider and the play button never touch it. */
      const sp = spanOf(W);
      let clock = null;
      try { clock = window.IntMapTime.isLive() ? iso(new Date()) : window.IntMapTime.iso(); } catch (_) { }
      if (!clock || clock < sp[0] || clock > sp[1]) {
        try { window.IntMapTime.set(new Date(sp[0] + 'T12:00:00Z'), { source: 'ui' }); } catch (_) { }
        clock = sp[0];
      }
      shownKey = null;
      paint(clock);
      return true;
    }

    /* a language change needs a NEW frame, not a re-render of the old one: the names inside a frame
       are localized when it is built. The row's own label is the shell's business. */
    window.addEventListener('intmap-lang', () => setTimeout(() => { if (on) { shownKey = null; paint(curDate || spanOf(war() || {})[0]); } }, 20));

    /* ⚠ THE CLOCK IS SUBSCRIBED TO ONCE, AT MOUNT, AND THE HANDLER RETURNS IMMEDIATELY WHEN THE ROW
       IS OFF. Subscribing on toggle-on and unsubscribing on toggle-off was measured first and is a
       leak waiting to happen: js/chronos.js's unsubscribe is a closure the caller has to keep, and a
       style reload or a second toggle while the first is still awaiting `load()` leaves two.
       ⚠ (#R409) AN EXPLICIT MOVE OF THE MASTER CLOCK WINS OVER AN ANIMATION — but only when the
       clock actually lands in THIS war. Before the split there was one layer and «follow Chronos»
       had no other case; now there are two, and a reader who moves the time machine to 1916 with
       both rows on would otherwise see the WW2 layer clamp itself to 1 September 1939 and stop
       playing, for a date that says nothing about it. A layer whose era the clock has left simply
       holds what it was showing, and its legend goes on naming its own day. */
    try {
      window.IntMapTime.on((e) => {
        if (!on) return;
        const W = war(); if (!W) return;
        const sp = spanOf(W);
        const d = e.isLive ? iso(new Date()) : e.iso;
        if (d < sp[0] || d > sp[1]) return;
        stopPlay();
        setDate(d);
      });
    } catch (_) { }
    /* self-heal across basemap swaps, exactly like the other vector overlays */
    try { GE().events.on('styledata', () => { if (on) setTimeout(() => { if (ensure()) { setVis(true); shownKey = null; paint(curDate || spanOf(war() || {})[0]); } }, 80); }); } catch (_) { }

    return {
      id: warId, toggle, isOn: () => on, date: () => curDate,
      setDate, isPlaying: () => !!playT, togglePlay,
      span: () => { const W = war(); return W ? spanOf(W) : null; },
      _build: build,
    };
  }

  /* the row's own name, in one place, because both the Layers row and the legend title say it */
  function rowName(id) {
    return id === 'ww1'
      ? LA('World War I (day by day)', '第一次世界大戦（日ごと）', 'Erster Weltkrieg (Tag für Tag)', 'Первая мировая война (по дням)', 'Primera Guerra Mundial (día a día)')
      : LA('World War II (day by day)', '第二次世界大戦（日ごと）', 'Zweiter Weltkrieg (Tag für Tag)', 'Вторая мировая война (по дням)', 'Segunda Guerra Mundial (día a día)');
  }

  function inst(id) {
    let i = insts.get(id);
    if (!i) { i = makeWar(id); insts.set(id, i); }
    return i;
  }

  /* ⚠ THE FACADE IS BY WAR ID. `toggle(id, want)` rather than `toggle(want)` — js/war-fronts.js and
     tests/r209 ③ both reach it here, and the id is what tells two identical layers apart. */
  window.__imWarFronts = {
    toggle: (id, want) => inst(id).toggle(want),
    isOn: (id) => (insts.has(id) ? insts.get(id).isOn() : false),
    date: (id) => (insts.has(id) ? insts.get(id).date() : null),
    setDate: (id, d) => inst(id).setDate(d),
    isPlaying: (id) => (insts.has(id) ? insts.get(id).isPlaying() : false),
    togglePlay: (id) => inst(id).togglePlay(),
    span: (id) => inst(id).span(),
    wars: () => ((data && data.wars.map((w) => ({ id: w.id, from: w.from, to: w.to, span: spanOf(w) }))) || []),
    kinds: () => (data && data.kinds) || {},
    rowName,
    _build: (id, d) => inst(id)._build(d),
  };
  return window.__imWarFronts;
};
