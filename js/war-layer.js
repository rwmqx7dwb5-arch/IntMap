/* ============================================================================
 *  IntMap · THE TWO WORLD WARS ON THE CLOCK — the layer itself   (#R349)
 * ----------------------------------------------------------------------------
 *  「WW1, WW2の月日ごとの勢力変遷も見れるように。」 While the row is on, this redraws itself for
 *  whatever instant Chronos is showing: who held what, where the front ran, and which battle was
 *  being fought — on that day.
 *
 *  ══ IT ARRIVES WHEN SOMEBODY ASKS, AND NOT BEFORE ═══════════════════════════════════════════
 *  ⚠ THIS FILE IS NOT IN src/main.js. js/war-fronts.js is — a shell that builds the Layers row, the
 *  two IntMapOS commands and nothing else — and it fetches this one through js/lazy-modules.js the
 *  first time the row is switched on. The reason is measured rather than stylistic: eager and whole,
 *  the two files cost 24.3 kB raw / 8.4 kB gzip on EVERY session, and the layer is off by default.
 *  That is precisely what scripts/perf-budget.mjs exists to notice, and the answer #R311 and #R322
 *  both gave is this one: keep what RUNS at boot, defer the rest.
 *
 *  ══ WHERE EVERY SHAPE ON SCREEN COMES FROM ══════════════════════════════════════════════════
 *   · the OUTLINES are CShapes 2.0 (data/cshapes.js — already on the machine, the time machine loads
 *     it), taken at the EXACT DATE rather than by year, which is how Poland can exist on 1 September
 *     1939 and be redrawn on 8 May 1945 without this file knowing anything about borders;
 *   · WHO HELD each of them is data/wars.json, keyed by CShapes' own gwcode, changing on the days the
 *     record gives;
 *   · the AREA either side of a front is not stored anywhere — it is cut from the outline by the line
 *     itself, in js/war-geom.js, by the same code scripts/build-wars.mjs used to prove the line cuts
 *     the country it claims to and that named cities land under the right army.
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
  const IDS = ['wars-fill', 'wars-out', 'wars-front', 'wars-evt'];
  const SRC = 'wars-src', SRC_L = 'wars-line-src', SRC_E = 'wars-evt-src';

  let data = null, cs = null, on = false, loading = null, popup = null;
  let shownKey = null, curWar = null, curDate = null, curFronts = [];
  /* ⚠ THE FRAME THE MAP IS SHOWING, KEPT. The legend needs the same three collections the fill was
     painted from — which sides are on screen, and which operations are running today. Asking
     `build()` for them again was written first and is three cuts of the Soviet Union per date
     change instead of one, for an answer that cannot differ from the one already computed. */
  let curFrame = null;

  const canDraw = () => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } };
  const setVis = (v) => IDS.forEach((id) => { try { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', v ? 'visible' : 'none'); } catch (_) { } });
  /* a 9-language object out of data/wars.json — the keys are js/lang-registry.js's own codes */
  const say = (o) => (o && (o[HOST.lang] || o.en)) || '';
  const iso = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.toISOString().slice(0, 10); };
  /* the Wikipedia subdomain for the reader's language — the registry's BCP-47 tag with the script
     subtag stripped, because zh-hans.wikipedia.org does not exist (js/atlas-sources.js, #R318). */
  const wikiHost = () => { try { return String(window.IntMapLang.htmlTag(HOST.lang) || 'en').split('-')[0].toLowerCase() || 'en'; } catch (_) { return 'en'; } };

  /* ── the two files ──────────────────────────────────────────────────────────────────────────── */
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

  /* ── which war, and what is true in it on this day ──────────────────────────────────────────── */
  function warAt(dateStr) { return (data && data.wars.find((w) => dateStr >= w.from && dateStr <= w.to)) || null; }
  function baseFaction(war, gw, dateStr) {
    const tl = war.control[gw]; if (!tl) return 'NEUTRAL';
    let f = 'NEUTRAL';
    for (const [d, k] of tl) { if (d <= dateStr) f = k; }
    return f;
  }
  /* every front that is drawing a line today, with the line it is drawing */
  function activeFronts(war, dateStr) {
    const out = [];
    for (const F of war.fronts) {
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

  /* ── build the three FeatureCollections for one instant ─────────────────────────────────────── */
  function build(dateStr) {
    const war = warAt(dateStr);
    if (!war) return null;
    const fronts = activeFronts(war, dateStr);
    const areas = { type: 'FeatureCollection', features: [] };
    for (const e of entitiesAt(dateStr)) {
      const base = baseFaction(war, e.gw, dateStr);
      const cuts = cutsFor(fronts, e.gw);
      let pieces;
      try { pieces = WarGeom.warPieces(polysOf(e.i), base, cuts); }
      catch (_) { pieces = [{ faction: base, polys: polysOf(e.i) }]; }   /* a country whose cut cannot be computed is drawn whole, under whoever the record says holds it — never dropped */
      for (const p of pieces) {
        const fac = war.factions[p.faction] || war.factions.NEUTRAL;
        areas.features.push({
          type: 'Feature',
          geometry: { type: 'MultiPolygon', coordinates: p.polys },
          properties: { col: fac.col, gw: e.gw, nm: e.name, fac: p.faction, facnm: say(fac.name) },
        });
      }
    }
    const lines = {
      type: 'FeatureCollection',
      features: fronts.map((a) => ({
        type: 'Feature', geometry: { type: 'LineString', coordinates: a.D.pts },
        properties: { id: a.F.id, nm: say(a.F.name), d: a.D.d },
      })),
    };
    const evts = {
      type: 'FeatureCollection',
      features: war.events.filter((v) => v.d <= dateStr && (v.d2 || v.d) >= dateStr).map((v) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: v.at },
        properties: { nm: say(v.name), d: v.d, d2: v.d2 || '', wiki: v.wiki, kind: v.kind || 'battle' },
      })),
    };
    return { war, fronts, areas, lines, evts };
  }

  /* ── the layers ─────────────────────────────────────────────────────────────────────────────── */
  function ensure() {
    if (GE().layers.hasSource(SRC)) return true;
    if (!canDraw()) return false;
    try {
      const empty = { type: 'FeatureCollection', features: [] };
      const attrib = 'CShapes 2.0 (Schvitz et al. 2022) · IntMap war record';
      GE().layers.addSource(SRC, { type: 'geojson', data: empty, attribution: attrib });
      GE().layers.addSource(SRC_L, { type: 'geojson', data: empty });
      GE().layers.addSource(SRC_E, { type: 'geojson', data: empty });
      const before = GE().layers.has('tool-poly') ? 'tool-poly' : undefined;
      GE().layers.add({ id: 'wars-fill', type: 'fill', source: SRC, layout: { visibility: 'none' }, paint: { 'fill-color': ['coalesce', ['get', 'col'], 'rgba(0,0,0,0)'], 'fill-opacity': 0.55 } }, before);
      GE().layers.add({ id: 'wars-out', type: 'line', source: SRC, layout: { visibility: 'none' }, paint: { 'line-color': 'rgba(255,255,255,0.45)', 'line-width': 0.6 } }, before);
      GE().layers.add({
        id: 'wars-front', type: 'line', source: SRC_L, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1b1b1f', 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 2.0, 6, 3.4], 'line-dasharray': [2.4, 1.2], 'line-opacity': 0.92 },
      }, before);
      GE().layers.add({
        id: 'wars-evt', type: 'circle', source: SRC_E, layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4.2, 6, 7],
          'circle-color': ['match', ['get', 'kind'], 'political', '#f0d264', 'naval', '#6fc7d8', '#ffffff'],
          'circle-stroke-color': '#1b1b1f', 'circle-stroke-width': 1.4, 'circle-opacity': 0.95,
        },
      }, before);
      try { GE().events.onLayer('click', 'wars-evt', onEvent); } catch (_) { }
      try { GE().events.onLayer('click', 'wars-fill', onArea); } catch (_) { }
      try {
        GE().events.onLayer('mouseenter', 'wars-evt', () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
        GE().events.onLayer('mouseleave', 'wars-evt', () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
      } catch (_) { }
      return true;
    } catch (_) { return false; }
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
    shownKey = dateStr; curWar = r && r.war; curDate = dateStr; curFronts = (r && r.fronts) || [];
    curFrame = r;
    const empty = { type: 'FeatureCollection', features: [] };
    try {
      GE().layers.setSourceData(SRC, r ? r.areas : empty);
      GE().layers.setSourceData(SRC_L, r ? r.lines : empty);
      GE().layers.setSourceData(SRC_E, r ? r.evts : empty);
    } catch (_) { }
    renderPanel(r);
    return true;
  }

  /* ── clicks ─────────────────────────────────────────────────────────────────────────────────── */
  const esc = (x) => HOST.escapeHtml(String(x == null ? '' : x));
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
      show(ev.lngLat, '<div class="war-pop"><b class="war-pop-h">' + esc(p.nm) + '</b>'
        + '<div class="war-pop-y">' + esc(span) + '</div>'
        + '<a class="war-pop-a" target="_blank" rel="noopener" href="https://' + wikiHost()
        + '.wikipedia.org/wiki/' + esc(p.wiki) + '">Wikipedia</a></div>');
    } catch (_) { }
  }

  /* ── the legend ─────────────────────────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('war-css')) return;
    const s = document.createElement('style'); s.id = 'war-css';
    s.textContent = [
      '.war-leg{font-size:11.5px;line-height:1.45;}',
      '.war-leg h5{margin:8px 0 4px;font-size:11px;font-weight:600;color:var(--text-main);}',
      '.war-when{font-size:12.5px;font-weight:600;color:var(--text-main);margin:6px 0 2px;font-variant-numeric:tabular-nums;}',
      '.war-key{display:flex;align-items:center;gap:6px;margin:3px 0;}',
      '.war-key i{flex:0 0 auto;width:11px;height:11px;border-radius:3px;font-style:normal;}',
      '.war-fr{margin:4px 0;padding-left:12px;position:relative;color:var(--text-muted);}',
      '.war-fr::before{content:"";position:absolute;left:0;top:6px;width:8px;height:0;border-top:2px dashed var(--text-main);opacity:.75;}',
      '.war-fr b{color:var(--text-main);font-weight:600;}',
      '.war-ev{margin:3px 0;color:var(--text-muted);}',
      '.war-ev b{color:var(--text-main);font-weight:600;}',
      '.war-note{margin-top:7px;font-size:10px;color:var(--text-muted);line-height:1.4;}',
      '.war-go{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;}',
      '.war-go button{flex:1 1 auto;min-width:96px;padding:7px 8px;border-radius:9px;border:1px solid rgba(128,128,128,0.28);'
        + 'background:var(--input-bg);color:var(--text-main);font-size:11.5px;cursor:pointer;}',
      '.war-go button:hover{background:var(--primary-color);color:#fff;border-color:transparent;}',
      '.war-pop{font-size:12px;} .war-pop-h{display:block;font-size:13px;margin-bottom:2px;}',
      '.war-pop-y{color:var(--text-muted);font-size:11px;font-variant-numeric:tabular-nums;}',
      '.war-pop-f{display:flex;align-items:center;gap:6px;margin-top:5px;}',
      '.war-pop-f i{width:11px;height:11px;border-radius:3px;}',
      '.war-pop-a{display:inline-block;margin-top:6px;font-size:11.5px;}',
    ].join('');
    document.head.appendChild(s);
  }

  function renderPanel(frame) {
    if (frame !== undefined) curFrame = frame;
    const box = document.getElementById('data-legend-wars'); if (!box) return;
    css();
    const body = box.querySelector('.war-leg') || (() => { const d = document.createElement('div'); d.className = 'war-leg'; box.appendChild(d); return d; })();
    if (!curWar) {
      body.innerHTML = '<div class="war-note">'
        + L('The clock is not inside either war. Move Chronos to a date between 1914 and 1945, or jump straight in:',
          'いまの時刻はどちらの大戦の期間にも入っていません。Chronos を 1914〜1945 年の日付に移すか、下から飛んでください:',
          'Die Uhr steht in keinem der beiden Kriege. Stellen Sie Chronos auf ein Datum zwischen 1914 und 1945 – oder springen Sie direkt:',
          'Часы находятся вне обеих войн. Переведите Chronos на дату между 1914 и 1945 годами или перейдите сразу:',
          'El reloj no está dentro de ninguna de las dos guerras. Mueva Chronos a una fecha entre 1914 y 1945, o salte directamente:')
        + '</div><div class="war-go">'
        + (data ? data.wars.map((w) => '<button data-d="' + esc(w.from) + '">' + esc(say(w.name)) + '</button>').join('') : '')
        + '</div>';
      body.querySelectorAll('.war-go button').forEach((b) => {
        b.onclick = () => { try { window.IntMapTime.set(new Date(b.dataset.d + 'T12:00:00Z'), { source: 'ui' }); } catch (_) { } };
      });
      try { window._tileLegends && window._tileLegends(); } catch (_) { }
      return;
    }
    /* only the sides that are actually on screen right now */
    const seen = new Set();
    ((curFrame && curFrame.areas.features) || []).forEach((f) => seen.add(f.properties.fac));
    const keys = Object.keys(curWar.factions).filter((k) => seen.has(k));
    let h = '<div class="war-when">' + esc(say(curWar.name)) + ' · ' + esc(curDate) + '</div>';
    h += keys.map((k) => '<div class="war-key"><i style="background:' + esc(curWar.factions[k].col) + '"></i>'
      + esc(say(curWar.factions[k].name)) + '</div>').join('');
    if (curFronts.length) {
      h += '<h5>' + esc(L('Front lines', '戦線', 'Frontlinien', 'Линии фронта', 'Líneas del frente')) + '</h5>';
      h += curFronts.map((a) => '<div class="war-fr"><b>' + esc(say(a.F.name)) + '</b> — '
        + esc(L('line of', '戦線の日付', 'Linie vom', 'линия от', 'línea del')) + ' ' + esc(a.D.d)
        + (a.D.note ? ('<br>' + esc(say(a.D.note))) : '') + '</div>').join('');
    }
    const evs = (curFrame && curFrame.evts.features) || [];
    if (evs.length) {
      h += '<h5>' + esc(L('On this day', 'この日の出来事', 'An diesem Tag', 'В этот день', 'Ese día')) + '</h5>';
      h += evs.map((f) => '<div class="war-ev"><b>' + esc(f.properties.nm) + '</b><br>'
        + esc(f.properties.d2 && f.properties.d2 !== f.properties.d ? (f.properties.d + ' – ' + f.properties.d2) : f.properties.d) + '</div>').join('');
    }
    h += '<div class="war-note">'
      + L('Front lines are shown for the dates the record gives a position for, and hold until the next one — the date beside each line is the date it is from. Country outlines: CShapes 2.0.',
        '戦線は、記録が位置を伝えている日付についてのみ描き、次の日付まで保持します——線の横の日付が、その線の日付です。国境: CShapes 2.0。',
        'Frontlinien werden für die Tage gezeigt, für die die Quellen eine Position angeben, und gelten bis zur nächsten — das Datum neben jeder Linie ist ihr Datum. Grenzen: CShapes 2.0.',
        'Линии фронта показаны на те даты, для которых источники дают положение, и держатся до следующей — дата рядом с линией и есть её дата. Границы: CShapes 2.0.',
        'Las líneas del frente se muestran para las fechas en que las fuentes dan una posición, y se mantienen hasta la siguiente: la fecha junto a cada línea es su fecha. Fronteras: CShapes 2.0.')
      + '</div>';
    body.innerHTML = h;
    try { window._tileLegends && window._tileLegends(); } catch (_) { }
  }

  /* ── the switch ─────────────────────────────────────────────────────────────────────────────── */
  async function toggle(want) {
    on = !!want;
    if (!on) {
      setVis(false);
      if (popup) { try { popup.remove(); } catch (_) { } popup = null; }
      try { window._hideGenericLegend && window._hideGenericLegend('wars'); } catch (_) { }
      return false;
    }
    const ok = await load();
    if (!ok) {
      try { HOST.imToast(L('Could not load the war data', '大戦データを読み込めませんでした', 'Kriegsdaten konnten nicht geladen werden', 'Не удалось загрузить данные о войнах', 'No se pudieron cargar los datos de la guerra')); } catch (_) { }
      on = false; return false;
    }
    if (!ensure()) { whenDrawable(() => { if (on) toggle(true); }); return false; }
    setVis(true);
    try {
      window._registerLayerOpacity && window._registerLayerOpacity('wars',
        LA('World wars (day by day)', '両大戦（日ごと）', 'Weltkriege (Tag für Tag)', 'Мировые войны (по дням)', 'Guerras mundiales (día a día)'),
        ['wars-fill'], 'dl-wars');
    } catch (_) { }
    shownKey = null;
    paint(nowISO());
    return true;
  }

  function nowISO() { try { return window.IntMapTime.iso(); } catch (_) { return iso(new Date()); } }

  /* a language change needs a NEW frame, not a re-render of the old one: the names inside a frame
     are localized when it is built. The row's own label is the shell's business. */
  window.addEventListener('intmap-lang', () => setTimeout(() => { if (on) { shownKey = null; paint(nowISO()); } }, 20));


  /* ⚠ THE CLOCK IS SUBSCRIBED TO ONCE, AT MOUNT, AND THE HANDLER RETURNS IMMEDIATELY WHEN THE ROW
     IS OFF. Subscribing on toggle-on and unsubscribing on toggle-off was measured first and is a
     leak waiting to happen: js/chronos.js's unsubscribe is a closure the caller has to keep, and a
     style reload or a second toggle while the first is still awaiting `load()` leaves two. */
  try {
    window.IntMapTime.on((e) => {
      if (!on) return;
      paint(e.isLive ? iso(new Date()) : e.iso);
    });
  } catch (_) { }
  /* self-heal across basemap swaps, exactly like the other vector overlays */
  try { GE().events.on('styledata', () => { if (on) setTimeout(() => { if (ensure()) { setVis(true); shownKey = null; paint(nowISO()); } }, 80); }); } catch (_) { }
  window.__imWarFronts = {
    toggle, isOn: () => on, date: () => curDate,
    war: () => (curWar && curWar.id) || null,
    wars: () => ((data && data.wars.map((w) => ({ id: w.id, from: w.from, to: w.to }))) || []),
    _build: build,
  };
  return window.__imWarFronts;
};
