/* ============================================================================
 *  IntMap · the map, in words   (map-a11y-structure)
 * ----------------------------------------------------------------------------
 *  MEASURED before this file (2026-09-29, static audit): the map had NO text alternative. #map
 *  carried no role and no name, the page had no visually-hidden text anywhere, and of the ten
 *  aria-live regions none said anything about the map. A reader who cannot see it could switch a
 *  layer on and hear nothing, move the view and hear nothing, and had no way at all to reach a
 *  feature on it: every popup opens from a pointer press.
 *
 *  ONE SURFACE SAYS WHAT THE MAP SHOWS. A visually-hidden status region (role=status,
 *  aria-live=polite, atomic) carries one short paragraph — the place under the centre of the view,
 *  the date the map is drawing when it is not today, the layers that are on, what the registered
 *  layers count in view, and the feature last selected — rewritten only after the map has settled
 *  (a debounce, so a pan is one announcement and not forty) and only when the words changed.
 *  #map becomes a named region described by it.
 *
 *  ⚠ NOTHING HERE DECIDES ANYTHING THE APP DOES NOT ALREADY SAY. Every clause is read from the
 *  reader that owns it:
 *    · the layers that are on — the «Active layers» bar js/data-layers.js `_refreshActiveLayers`
 *      renders (its chip names ARE the answer to «what is on», in the reader's language); the
 *      counts in view — window.IntMapLayers (js/map-ui.js) `featuresIn`, the app's one «in this
 *      view» predicate, for each registered layer that is on and can answer it;
 *    · the place — today, the country polygon under the centre (HOST.countryGeo, the predicate
 *      window._imPipGeo, the name through HOST.cName); ⚠ while the clock shows a past year the
 *      modern polygon is NEVER used (the rule js/countries-ui.js keeps for a click) — the era record
 *      on screen, IntMapTimeBorders.currentFC(), names the polity, in the language it carries;
 *      no network is asked;
 *    · the date — window.IntMapTime.
 *  A clause whose owner has not answered is left out, never guessed.
 *
 *  AND A FEATURE CAN BE REACHED FROM THE KEYBOARD. With focus on the map, Alt+N / Alt+Shift+N
 *  walks the features drawn near the centre of the view, nearest first, and PRESSES each through
 *  the renderer's own click path (GE().events.pressAt — the same event a pointer press produces),
 *  so exactly the popup, card and ownership rules a click gets open for it. No popup is made here.
 *  Which layers can be walked is the click-ownership registry's answer (`clickLayers` with
 *  `ownersOnly`: a background fallback is not a feature), not a list.
 *  Alt+N was chosen because nothing else on the page reads it: the single-key shortcuts
 *  (js/keyboard-shortcuts.js) return on any modifier, the renderer's keyboard handler reads arrows
 *  and +/−, and no browser default found binds Alt+N (Firefox's menu accelerators are F/E/V/S/B/T/H). `e.code` is read so macOS Option+N (a dead key) works too.
 *
 *  Engine-neutral: the renderer is reached only through window.IntMapGeoEngine (npm run check:engine).
 *  Strings are en + jp (CONSTITUTION §7).
 * ==========================================================================*/

import { everyTick, stopTick } from './runtime.js';
import { IntMapTime } from './chronos.js';
import { IntMapLang } from './lang-registry.js';
import * as bus from './bus.js';
import { narratorApi } from './narrator-api.js';

/* ── the pure parts ───────────────────────────────────────────────────────────────────────────── */

/** one coordinate as words: 35.7° N / 北緯35.7° */
export function fmtLatLng(lat, lng, lang) {
  const r = (v) => (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
  if (lang === 'jp') return (lat >= 0 ? '北緯' : '南緯') + r(lat) + '°・' + (lng >= 0 ? '東経' : '西経') + r(lng) + '°';
  return r(lat) + '° ' + (lat >= 0 ? 'N' : 'S') + ', ' + r(lng) + '° ' + (lng >= 0 ? 'E' : 'W');
}
/** the date the map is drawing, when it is not now; astronomical years ≤ 0 are BCE */
export function fmtWhen(year, iso, lang) {
  if (year <= 0) return IntMapLang.t(lang, (1 - year) + ' BCE', '紀元前' + (1 - year) + '年');
  return iso || String(year);
}
/**
 * The paragraph. Every field is optional; an absent one is left out rather than guessed.
 * @param {{ place?: string, lat: number, lng: number, zoom: number, when?: string,
 *           layers: string[], counts?: string[], selected?: string }} s
 */
export function composeSummary(s, lang) {
  const out = [];
  const where = fmtLatLng(s.lat, s.lng, lang);
  const z = Math.round(s.zoom * 10) / 10;
  out.push(s.place
    ? IntMapLang.t(lang, 'Map centred on ' + s.place + ' (' + where + '), zoom ' + z + '.', '地図の中心: ' + s.place + '（' + where + '）、ズーム ' + z + '。')
    : IntMapLang.t(lang, 'Map centred at ' + where + ', zoom ' + z + '.', '地図の中心: ' + where + '、ズーム ' + z + '。'));
  if (s.when) out.push(IntMapLang.t(lang, 'Showing ' + s.when + '.', s.when + ' の地図を表示中。'));
  const n = s.layers.length;
  out.push(n
    ? IntMapLang.t(lang, 'Layers on (' + n + '): ' + s.layers.join(', ') + '.', '表示中のレイヤー（' + n + '）: ' + s.layers.join('、') + '。')
    : IntMapLang.t(lang, 'No layers are on.', '表示中のレイヤーはありません。'));
  if (s.counts && s.counts.length) out.push(s.counts.join(lang === 'jp' ? '。' : '. ') + (lang === 'jp' ? '。' : '.'));
  if (s.selected) out.push(IntMapLang.t(lang, 'Selected: ' + s.selected + '.', '選択中: ' + s.selected + '。'));
  return out.join(' ');
}
/**
 * Hits from point queries at known pixels → one entry per feature, nearest the centre first.
 * @param {{ x: number, y: number, feature: object }[]} hits
 * @returns {{ key: string, x: number, y: number, d: number, feature: object }[]}
 */
export function rankCandidates(hits, cx, cy) {
  const by = new Map();
  for (const h of hits) {
    const f = h.feature || {}, lid = (f.layer && f.layer.id) || '';
    let id = f.id;
    if (id == null) { try { id = JSON.stringify(f.properties || {}); } catch (_) { id = ''; } }
    const key = lid + '#' + id, d = Math.hypot(h.x - cx, h.y - cy);
    const was = by.get(key);
    if (!was || d < was.d) by.set(key, { key, x: h.x, y: h.y, d, feature: f });
  }
  return Array.from(by.values()).sort((a, b) => a.d - b.d || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/* (keyboard-and-offline) the narrator's doors for js/map-reader.js and js/offline-maps.js — a leaf, js/narrator-api.js (read why there) */
/* ── the surface ──────────────────────────────────────────────────────────────────────────────── */
export function makeMapNarrator(HOST, CTX) {
  const GE = CTX.GE;
  const lang = () => HOST.lang;
  const mapEl = document.getElementById('map');
  if (!mapEl) return null;

  /* the region: named, described by the status, and reachable when the renderer put nothing focusable in it */
  const live = document.createElement('div');
  live.id = 'map-narration'; live.className = 'im-sr-only';
  live.setAttribute('data-prints-map-time', '');   /* it reads out the map's instant («Showing 1995-08-30») — js/quest-panel.js hides what says so while a «which year?» question is open */
  live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite'); live.setAttribute('aria-atomic', 'true');
  document.body.appendChild(live);
  mapEl.setAttribute('role', 'region');
  mapEl.setAttribute('aria-describedby', 'map-narration');
  mapEl.setAttribute('aria-keyshortcuts', 'Alt+N Alt+Shift+N Alt+R Alt+Shift+R');
  const nameRegion = () => { try { mapEl.setAttribute('aria-label', IntMapLang.t(lang(), 'Map', '地図')); } catch (_) {} };
  nameRegion();
  const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
  const ensureFocusable = () => { try { if (!mapEl.hasAttribute('tabindex') && !mapEl.querySelector(FOCUSABLE)) mapEl.tabIndex = 0; } catch (_) {} };

  let selected = '';
  const featureName = (f) => {
    const p = (f && f.properties) || {};
    const i18n = p._i18n && p._i18n[lang()];
    if (i18n) return String(i18n);
    try { if (window.IntMapOsmName && window.IntMapOsmNameKeys) { const n = window.IntMapOsmName(p, window.IntMapOsmNameKeys(lang())); if (n) return n; } } catch (_) {}
    return p.name ? String(p.name) : '';
  };

  /* ── the clauses, each from its owner ── */
  const activeLayerNames = () => {
    const sec = document.getElementById('layer-active-section');
    return sec ? Array.from(sec.querySelectorAll('.active-lyr-chip .alc-name')).map((n) => n.textContent.trim()).filter(Boolean) : [];
  };
  const layerCounts = () => {
    const out = [], L = window.IntMapLayers;
    if (!L || !L.active) return out;
    try {
      for (const id of L.active()) {
        const st = L.state(id); const f = st && L.featuresIn ? L.featuresIn(id, null) : null;
        if (Array.isArray(f)) out.push(IntMapLang.t(lang(), st.label + ': ' + f.length + ' in view', st.label + ': 表示範囲内に ' + f.length + ' 件'));
      }
    } catch (_) {}
    return out;
  };
  const inPoly = (x, y, g) => { try { return !!window._imPipGeo(x, y, g); } catch (_) { return false; } };
  const placeAt = (lng, lat) => {
    const TB = window.IntMapTimeBorders;
    if (TB && TB.active && TB.active()) {
      /* the clock shows a past year: the era record names the land, the modern polygon never does */
      try {
        const fc = TB.currentFC && TB.currentFC(); if (!fc || !fc.features) return '';
        for (const f of fc.features) if (f && f.geometry && inPoly(lng, lat, f.geometry)) return featureName(f) || String((f.properties && f.properties.NAME) || '');
      } catch (_) {}
      return '';
    }
    try {
      const geo = HOST.countryGeo; if (!geo || !geo.features) return '';
      for (const f of geo.features) {
        if (!f || !f.geometry || !inPoly(lng, lat, f.geometry)) continue;
        const code = (f.properties && f.properties.__code) || f.id;
        const s = HOST.countryStats && HOST.countryStats[code];
        return s ? HOST.cName(s) : '';
      }
    } catch (_) {}
    return '';
  };
  const whenText = () => {
    try { const T = IntMapTime; if (!T || T.isLive()) return ''; return fmtWhen(T.year(), T.year() > 0 ? T.iso() : '', lang()); } catch (_) { return ''; }
  };

  let last = '';
  const speak = (text) => { if (text && text !== last) { last = text; live.textContent = text; } };
  const summarise = () => {
    try {
      const c = GE().camera.getCenter();
      return composeSummary({ place: placeAt(c.lng, c.lat), lat: c.lat, lng: c.lng, zoom: GE().camera.getZoom(),
        when: whenText(), layers: activeLayerNames(), counts: layerCounts(), selected }, lang());
    } catch (_) { return ''; }
  };
  /* one announcement per settled change — a pan, a burst of layer toggles, a scrubbed clock */
  let timer = 0, enrichSeq = 0;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => {
    ensureFocusable();
    const s = summarise(), en = narratorApi.enrich;
    if (!en) { speak(s); return; }
    /* (keyboard-and-offline) reading mode: the paragraph is said ONCE, when it is whole — a status region rewritten
       half-way restarts a screen reader's speech. A later change or a feature walk supersedes it (enrichSeq). */
    const my = ++enrichSeq;
    Promise.resolve().then(() => en(s)).then((t) => { if (my === enrichSeq) speak(t || s); }, () => { if (my === enrichSeq) speak(s); });
  }, 1200); };

  let moved = 0;
  let pressing = false;   /* true only while step() is inside its own pressAt */
  const wire = () => {
    try { GE().events.on('moveend', () => { moved++; schedule(); }); } catch (_) {}
    /* a pointer press on a walkable feature is the selection too — observed, never claimed */
    try {
      GE().events.on('click', (e) => {
        try {
          /* the keyboard walk's own press (step → pressAt, synchronous) has already set `selected` and
             said «Feature k of n». Scheduling a summary for it too replaced that sentence 1.2 s later —
             and at once when the press's other click owners held the main thread past the timer
             (measured on CI 2026-09-30: the status read the summary 1.5 s after Alt+N, so the walk's
             own announcement could be replaced before it was ever read out). */
          if (pressing) return;
          const ids = walkable(); if (!ids.length || !e || !e.point) return;
          const hit = (GE().coords.queryRenderedFeatures([e.point.x, e.point.y], { layers: ids }) || [])[0];
          selected = hit ? featureName(hit) : ''; schedule();
        } catch (_) {}
      });
    } catch (_) {}
  };
  /* the renderer is built after this factory runs — wire once it can be asked (one promise, no poll) */
  try { GE().whenCanDraw().then(() => { wire(); schedule(); }); } catch (_) {}
  const watchLayers = () => {
    const sec = document.getElementById('layer-active-section');
    if (!sec) return false;
    new MutationObserver(schedule).observe(sec, { childList: true, subtree: true, characterData: true });
    return true;
  };
  /* the bar is built by the layer panel when it first mounts; until then, look once a second (js/runtime.js — hidden tabs rest) */
  if (!watchLayers()) { const stop = everyTick('map-narrator:active-bar', 1000, () => { if (watchLayers()) { stopTick(stop); schedule(); } }); }
  try { if (IntMapTime && IntMapTime.on) IntMapTime.on(schedule); } catch (_) {}
  bus.on('intmap-lang', () => { nameRegion(); last = ''; schedule(); });
  schedule();

  /* ── walking the features ── */
  function walkable() {
    let ids = [];
    try { ids = GE().events.clickLayers({ ownersOnly: true }) || []; } catch (_) { return []; }
    return ids.filter((id) => { try { return GE().layers.has(id) && GE().layers.isVisible(id) !== false; } catch (_) { return false; } });
  }
  function candidates() {
    const ids = walkable(); if (!ids.length) return [];
    const cv = GE().render.canvas(); const w = (cv && cv.clientWidth) || 0, h = (cv && cv.clientHeight) || 0;
    if (!w || !h) return [];
    const cx = w / 2, cy = h / 2, rx = w * 0.35, ry = h * 0.35, N = 9, hits = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = cx - rx + (2 * rx * i) / (N - 1), y = cy - ry + (2 * ry * j) / (N - 1);
      let got = [];
      try { got = GE().coords.queryRenderedFeatures([x, y], { layers: ids }) || []; } catch (_) { got = []; }
      for (const f of got) {
        /* a point feature is pressed on its own position when that position still hits it */
        let px = x, py = y;
        try {
          const g = f.geometry;
          if (g && g.type === 'Point') {
            const p = GE().coords.project(g.coordinates);
            if (p && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) { px = p.x; py = p.y; }
          }
        } catch (_) {}
        hits.push({ x: px, y: py, feature: f });
      }
    }
    return rankCandidates(hits, cx, cy);
  }
  let list = [], at = -1, listMoved = -1, listLayers = '';
  function step(dir) {
    enrichSeq++;   /* a walk announcement is never replaced by a paragraph that was still being gathered */
    const sig = walkable().join('|');
    if (listMoved !== moved || listLayers !== sig || !list.length) {
      const prev = at >= 0 && list[at] ? list[at].key : null;
      list = candidates(); listMoved = moved; listLayers = sig;
      at = prev ? list.findIndex((c) => c.key === prev) : -1;
    }
    if (!list.length) { at = -1; speak(IntMapLang.t(lang(), 'No selectable features near the centre of the map.', '地図の中心付近に選べる地物はありません。')); return false; }
    at = (at + dir + list.length) % list.length;
    if (at < 0) at = 0;
    const c = list[at];
    selected = featureName(c.feature);
    const label = selected || IntMapLang.t(lang(), 'unnamed feature', '名前のない地物');
    speak(IntMapLang.t(lang(), 'Feature ' + (at + 1) + ' of ' + list.length + ': ' + label, '地物 ' + (at + 1) + ' / ' + list.length + ': ' + label));
    pressing = true;
    try { GE().events.pressAt({ x: c.x, y: c.y }); } catch (_) {} finally { pressing = false; }
    return true;
  }
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyN') return;
    const ae = document.activeElement;
    if (!ae || !(ae === mapEl || mapEl.contains(ae))) return;
    e.preventDefault();
    step(e.shiftKey ? -1 : 1);
  });

  narratorApi.say = (text) => { enrichSeq++; last = ''; speak(text); };
  narratorApi.summarise = summarise; narratorApi.host = HOST; narratorApi.engine = GE;
  narratorApi.resettle = schedule;
  /* (keyboard-and-offline) Alt+R says what is here; Alt+Shift+R turns the fuller reading on and off (js/map-reader.js).
     Like Alt+N: with focus on the map, and Alt is not read by the single-key shortcuts or the renderer. */
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== 'KeyR') return;
    const ae = document.activeElement;
    if (!ae || !(ae === mapEl || mapEl.contains(ae))) return;
    e.preventDefault();
    import('./map-reader.js').then((m) => (e.shiftKey ? m.toggleReading() : m.describeHere())).catch(() => {});
  });
  /* a reader who turned the mode on keeps it: the module is fetched at start only when the stored switch says so */
  try { if (localStorage.getItem('intmap_map_reading') === 'on') import('./map-reader.js').then((m) => m.restore()).catch(() => {}); } catch (_) {}

  return { summarise, step };
}
