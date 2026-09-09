/* ============================================================================
 *  IntMap · MEASURED RADIATION — ambient gamma dose rate from the national networks  (#R585)
 *  window.IntMapRadiationObs
 * ----------------------------------------------------------------------------
 *  This is MEASURED radiation. It is not the dispersion simulation — that is `IntMapRadiation`
 *  in js/sims.js, which models where material WOULD go. This file draws what instruments in the
 *  ground ACTUALLY read, and the two are deliberately separate layers: a modelled plume and a
 *  measured dose rate must never share a colour ramp, because one is a hypothesis and the other
 *  is an observation.
 *
 *  ── WHY NOT EURDEP ─────────────────────────────────────────────────────────────────────────
 *  The obvious source is the JRC's EURDEP (about 5,500 European stations, hourly). Measured this
 *  round, it is closed on both counts and neither is a matter of opinion:
 *    · TECHNICALLY — the only public endpoint that returns VALUES is the OGC WPS at
 *      redata.jrc.ec.europa.eu/gis/ (PointGDRv4 / HexBinGDRv4, GeoJSON out). Every variant of it
 *      answered 503, while /oss/ and /chart/ on the same host answered 200: the WPS backend alone
 *      is down. What is still up is the station registry (Atom, 6,259 sites, NO values) and
 *      per-station charts as PNG — pixels, and stale ones: the series end in May 2024. The
 *      Advanced map, the half that reaches back 35 days, is behind a CAPTCHA.
 *    · LEGALLY — the consent screen that gates the map states: "All data that is exchanged via
 *      EURDEP are subject to copyright of the original data provider and cannot be used for other
 *      purposes, including scientific research, without their prior written agreement."
 *  ⚠ SO EURDEP-DERIVED DATA IS NOT CARRIED HERE BY ANY ROUTE. In particular the BfS open-data WFS
 *  also publishes `opendata:eurdep_latestValue` — 3,633 stations over 44 countries, CORS `*`, and
 *  it FETCHES FINE. It is not used: it carries no dataset registration in GovData, so there is no
 *  open licence under it, and the original providers' copyright survives the mirror. A source that
 *  can be fetched is not thereby a source that may be shown.
 *
 *  ── WHAT IS CARRIED INSTEAD ────────────────────────────────────────────────────────────────
 *  National networks that publish under a licence which explicitly permits redistribution. The
 *  roster, the licences and the measured station counts live in ONE place — the provider registry
 *  in supabase/functions/_shared/radiation-sources.js — and this file never names a country. It
 *  draws whatever `sources[]` the feed declares, and prints the attribution each one carries.
 *  docs/RADIATION.md is the canonical document.
 *
 *  ── ONE QUANTITY, ONE RAMP ─────────────────────────────────────────────────────────────────
 *  The upstreams disagree about units (uSv/h, nSv/h, uGy/h) and about the quantity (H*(10),
 *  "ambient gamma", air kerma). Normalisation to nSv/h happens SERVER-SIDE, once, so that no
 *  per-country branch reaches the browser and one legend can describe every dot. Each record still
 *  carries the quantity its provider named, so the popup can say what was actually measured rather
 *  than pretending the networks are identical.
 *
 *  ── RENDERER / MODULE RULES ────────────────────────────────────────────────────────────────
 *  · No <style> — CSS in css/intmap.css.  · Every DOM value through window.IntMapSafe.
 *  · Five languages inline; the rest in js/locales/ui.*.js.
 *  · Load-on-demand (js/lazy-modules.js → `radiationLayer`); the Layers row is eager in
 *    js/beta-overlays.js, so the row exists before this file does.
 * ==========================================================================*/
import { everyTick, stopTick } from './runtime.js';
window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.radiationLayer = function (HOST) {
  const L = window.IntMapLang.pick(() => HOST.lang);
  const LA = window.IntMapLang.pickArgs();
  const GE = () => window.IntMapGeoEngine;
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  function canDraw() { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } }
  const setVis = (ids, on) => ids.forEach(id => { try { if (GE().layers.has(id)) GE().layers.setLayout(id, 'visibility', on ? 'visible' : 'none'); } catch (_) { } });
  const before = () => { try { return GE().layers.has('tool-poly') ? 'tool-poly' : undefined; } catch (_) { return undefined; } };

  const SRC = 'imrad-obs-src', IDS = ['imrad-obs-halo', 'imrad-obs-pt', 'imrad-obs-lbl'];
  const state = { on: false, iso: null, loading: false, err: null };
  let feed = null;              /* the last successful {v,at,unit,sources,stations} */
  const subs = new Set();
  const notify = () => { for (const fn of subs) { try { fn(); } catch (_) { } } };

  /* ══ THE RAMP ═══════════════════════════════════════════════════════════════════════════════
     Absolute nSv/h, fixed, and anchored on numbers the PROVIDERS publish as their own action
     thresholds — not on the spread of whatever happens to have been fetched today, which would
     recolour the world every hour and make two screenshots incomparable.
       · 50 / 100  — the natural terrestrial band. Observation (2026-09-09): the 151 Dutch annual
         means in the CC0 RIVM set span 56.0–116.0 nSv/h, and RIVM states the national range as
         55–100 nSv/h, the spread being soil composition.
       · 200       — RIVM's published threshold for an automatic alert to RIVM.
       · 1000      — the alarm threshold the Swiss NADAM network publishes for its own probes.
         (Cited as a published public fact; NADAM's DATA is not carried — no open licence.)
       · 2000      — RIVM's published threshold for also notifying the safety region.
     EXPIRY: if a provider republishes a different action threshold, this ramp is wrong and the
     step it came from must move with it. CANONICAL: docs/RADIATION.md holds the same table in
     prose, and tests/r585-checks.test.mjs measures that the two agree.
     ⚠ The colours run cool→hot but 50–200 is NOT a warning: almost every healthy station on earth
     sits inside it. The legend says so in words, because a red-ish dot with no sentence beside it
     is how a normal Tuesday gets read as an accident. */
  const RAMP = [[0, '#4c8dff'], [50, '#39c07c'], [100, '#8fbf3f'], [200, '#d8c53a'], [1000, '#f0912d'], [2000, '#e02f2f']];
  const radColor = () => { const e = ['step', ['coalesce', ['get', 'v'], -1], '#6b7280']; for (const t of RAMP) { e.push(t[0], t[1]); } return e; };
  /* the dot grows a little with the reading so a hot station is findable at world zoom, but the
     COLOUR carries the value — radius alone is not readable against a basemap. */
  const SIZE = ['+', 0.55, ['*', 0.35, ['ln', ['+', 1, ['max', 0, ['coalesce', ['get', 'v'], 0]]]]]];
  const radRadius = ['interpolate', ['linear'], ['zoom'], 1, ['*', 1.7, SIZE], 5, ['*', 3.4, SIZE], 9, ['*', 6.2, SIZE]];
  const radHalo = ['interpolate', ['linear'], ['zoom'], 1, ['*', 4.6, SIZE], 5, ['*', 9.2, SIZE], 9, ['*', 16.8, SIZE]];

  const feedUrl = (qs) => { try { const b = (window.SUPABASE_URL || '').replace(/\/$/, ''); return b ? (b + '/functions/v1/radiation-feed?' + qs) : ''; } catch (_) { return ''; } };

  /* ── the data ─────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ `stations` AND `reference` ARE NOT THE SAME CLAIM, and the feed keeps them apart for that
     reason: `stations` is "somebody measured this recently", `reference` is "a published mean for a
     period" (today, the 151 Dutch annual means for 2011 — RIVM's live display is down and its own
     page sends readers to EURDEP). Painting a 2011 average in the same ramp as an hourly reading
     would make the map say something nobody measured. So reference points are drawn only when the
     CLOCK IS IN THEIR PERIOD, which is the same rule every other source follows, and the legend
     says they exist the rest of the time. */
  function refRows(f) {
    if (!f || !Array.isArray(f.reference) || !f.reference.length) return [];
    const yr = state.iso ? state.iso.slice(0, 4) : null;
    if (!yr) return [];
    const per = {};
    for (const s of (f.sources || [])) if (s.asOf) per[s.id] = String(s.asOf).slice(0, 4);
    return f.reference.filter(r => per[r.s] === yr);
  }
  function toFC(f) {
    const out = [];
    if (!f) return { type: 'FeatureCollection', features: out };
    const rows = (Array.isArray(f.stations) ? f.stations : []).concat(refRows(f));
    for (const s of rows) {
      /* a station whose coordinate could not be resolved is KEPT by the feed and dropped HERE:
         the feed's job is to say what exists, this file's job is to draw what can be drawn. */
      if (typeof s.y !== 'number' || typeof s.x !== 'number') continue;
      if (!(s.y >= -90 && s.y <= 90 && s.x >= -180 && s.x <= 180)) continue;
      out.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: [s.x, s.y] },
        properties: { c: s.c, s: s.s, n: s.n || '', v: (typeof s.v === 'number' ? s.v : null), t: s.t || '', q: s.q || '', k: s.k || '', b: s.b ? 1 : 0 }
      });
    }
    return { type: 'FeatureCollection', features: out };
  }

  function paint() { if (!feed) return; try { GE().layers.setSourceData(SRC, toFC(feed)); } catch (_) { } }

  function load(iso) {
    if (state.loading) return Promise.resolve(false);
    state.loading = true; state.err = null; notify();
    const url = iso ? feedUrl('mode=day&iso=' + encodeURIComponent(iso)) : feedUrl('mode=latest');
    if (!url) { state.loading = false; state.err = 'no-backend'; notify(); return Promise.resolve(false); }
    return fetch(url, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => {
        if (!j || j.v !== 1) throw new Error('bad payload');
        feed = j; state.iso = iso || null; state.loading = false; notify(); paint(); legend();
        if (!iso) chunked();
        return true;
      })
      .catch(e => { state.loading = false; state.err = (e && e.message) || 'fetch failed'; notify(); legend(); return false; });
  }

  /* ── the networks that cannot answer in one request ──────────────────────────────────────────
     ⚠ RadNet's only keyless route is one CSV per station per year: 140 requests, 67 MB and 102 s
     measured upstream, so the feed leaves it out of `mode=latest` on a request budget rather than
     by name, and offers it in chunks. Leaving it there would put an empty United States on a world
     radiation map, and an empty country reads as a safe one. So the chunks are followed HERE, in
     the background, after the map already has everything else — the reader sees the world at once
     and the thin source fills in. It runs once per session; the legend says while it is running. */
  const chunkState = { running: 0, done: 0, total: 0 };
  const dead = new Set();
  let chunkedOnce = false;
  function chunked() {
    if (chunkedOnce || !feed) return; chunkedOnce = true;
    const thin = (feed.sources || []).filter(s => (s.chunks > 1) && !s.n);
    if (!thin.length) return;
    chunkState.total = thin.reduce((a, s) => a + s.chunks, 0); chunkState.done = 0; legend();
    const jobs = [];
    for (const s of thin) for (let i = 0; i < s.chunks; i++) jobs.push([s.id, i]);
    let at = 0;
    const step = () => {
      if (at >= jobs.length) { chunkState.running--; if (!chunkState.running) legend(); return; }
      const [id, i] = jobs[at++];
      if (dead.has(id)) { chunkState.done++; step(); return; }
      const u = feedUrl('mode=latest&provider=' + encodeURIComponent(id) + '&chunk=' + i);
      fetch(u).then(r => r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))).then(j => {
        if (j && j.v === 1 && Array.isArray(j.stations) && j.stations.length) {
          feed.stations = feed.stations.concat(j.stations);
          const src = (feed.sources || []).find(x => x.id === id);
          if (src) { src.n = (src.n || 0) + j.stations.length; src.read = true; }
          paint();
        }
      }).catch(() => {
        /* ⚠ (#R621) ONE FAILURE ENDS THE SWEEP FOR THAT SOURCE, AND SAYS SO. Measured in production:
           all twenty-eight RadNet chunks answered 502 `upstream_unreachable` — the relay's own
           network cannot reach radnet.epa.gov, though the host answers fine from a desktop. The
           first version caught and ignored each one, so the reader got twenty-eight silent failures,
           an empty United States, and a legend that said nothing at all about why. An empty country
           on a radiation map reads as a safe one; «取得できず» is the only honest thing to print. */
        dead.add(id);
        const src = (feed.sources || []).find(x => x.id === id);
        if (src) { src.read = false; src.reason = 'unreachable'; }
        legend();
      }).then(() => { chunkState.done++; if (chunkState.done % 6 === 0) legend(); step(); });
    };
    /* four at a time: enough to finish in a few seconds, few enough that the reader's own panning
       is not competing with twenty-eight of our requests. */
    for (let k = 0; k < 4; k++) { chunkState.running++; step(); }
  }

  /* ── the map ──────────────────────────────────────────────────────────────────────────────── */
  function ensure() {
    if (GE().layers.hasSource(SRC)) return true;
    if (!canDraw()) return false;
    try {
      /* ⚠ (#R546) a `geojson` source takes `attribution`; passing an extra key to an `image`
         source makes it vanish silently. The string below is a fallback — the real, per-provider
         attribution is printed by the legend from `feed.sources[]`, because which networks
         answered is not knowable until they have. */
      GE().layers.addSource(SRC, { type: 'geojson', data: toFC(feed), attribution: 'National radiation monitoring networks' });
      const b = before();
      GE().layers.add({
        id: 'imrad-obs-halo', type: 'circle', source: SRC, layout: { visibility: 'none' },
        filter: ['>=', ['coalesce', ['get', 'v'], -1], 200],
        paint: { 'circle-radius': radHalo, 'circle-color': radColor(), 'circle-opacity': 0.20, 'circle-blur': 0.6 }
      }, b);
      GE().layers.add({
        id: 'imrad-obs-pt', type: 'circle', source: SRC, layout: { visibility: 'none' }, paint: {
          'circle-radius': radRadius, 'circle-color': radColor(),
          'circle-stroke-color': '#eaf4ff', 'circle-stroke-width': 0.7, 'circle-opacity': 0.94
        }
      }, b);
      GE().layers.add({
        id: 'imrad-obs-lbl', type: 'symbol', source: SRC, minzoom: 7, layout: {
          visibility: 'none',
          'text-field': ['concat', ['to-string', ['coalesce', ['get', 'v'], '—']], ' nSv/h'],
          'text-size': window.IntMapLabelScale.sub(0.78), 'text-offset': [0, 1.0], 'text-anchor': 'top',
          'text-font': ['literal', ['Noto Sans Regular']]
        },
        paint: { 'text-color': '#d8ecff', 'text-halo-color': 'rgba(0,0,0,0.8)', 'text-halo-width': 1.2 }
      }, b);
      GE().events.onLayer('click', 'imrad-obs-pt', e => { const f = e.features && e.features[0]; if (!f) return; popup(f); });
    } catch (_) { return false; }
    return true;
  }

  /* ── the popup: what was measured, by whom, under what licence, and its history ───────────── */
  function srcOf(id) { try { return (feed && feed.sources || []).find(s => s.id === id) || null; } catch (_) { return null; } }
  function popup(f) {
    const p = f.properties || {}, src = srcOf(p.s);
    const q = p.q ? (' · ' + S(p.q)) : '';
    const head = '<div class="rad-pop-h">' + S(p.n || p.c) + '</div>';
    /* ⚠ "BELOW THE DETECTOR'S FLOOR" IS NOT "ZERO". Seven Japanese stations report 0 with a declared
       measuring range that starts at 200 nSv/h; printing 0 would put a claim on the map that the
       instrument is incapable of making, and dropping the station would delete seven working
       monitors. The feed marks them and the popup says what the number means. */
    const val = '<div class="rad-pop-v">' + (p.b ? ('&lt; ' + S(p.v)) : (p.v == null ? '—' : S(p.v))) + ' <span>nSv/h</span></div>'
      + (p.b ? ('<div class="rad-pop-t">' + S(L('below this detector’s stated range', 'この検出器の測定下限未満', 'unter dem angegebenen Messbereich', 'ниже заявленного диапазона детектора', 'por debajo del rango declarado del detector')) + '</div>') : '')
      + (p.k === 'period-mean' ? ('<div class="rad-pop-t">' + S(L('published average for a period — not a current reading', '期間平均として公表された値 — 現在値ではありません', 'veröffentlichter Zeitraum-Mittelwert — kein aktueller Messwert', 'опубликованное среднее за период — не текущее показание', 'promedio publicado de un periodo — no es una lectura actual')) + '</div>') : '');
    const when = p.t ? ('<div class="rad-pop-t">' + S(new Date(p.t).toLocaleString()) + q + '</div>') : '';
    const who = src ? ('<div class="rad-pop-s">' + S(src.attribution || src.name) + (src.licence ? (' · ' + S(src.licence)) : '') + '</div>') : '';
    const hist = (src && src.historyDays > 0) ? ('<div class="rad-pop-x" data-rad-series="' + S(p.c) + '">' +
      S(L('Loading history…', '履歴を読み込み中…', 'Verlauf wird geladen…', 'Загрузка истории…', 'Cargando historial…')) + '</div>') : '';
    let el = null;
    /* ⚠ (#R621) `GE().popup` DOES NOT EXIST. The renderer contract puts the renderer-owned UI
       objects behind `ui` — `GE().ui.popup(options)` returns a bare popup that the caller positions
       and fills, and `GE().ui.attach(...)` puts it on the map (js/geo-engine.js, and every other
       call site: js/app-body.js, js/atlas-console.js, js/beta-overlays.js). This round invented a
       one-call shape that resolved to `undefined`, the surrounding try/catch swallowed the
       TypeError, and NOT ONE station popup opened in production — no value, no quantity, no
       licence, no history, and no «below this detector's stated range». Found by production
       verification, after every local check was green: the checks read the source and never asked
       the shipped facade whether the door they name is a door (#R552's shape, again). */
    try {
      el = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, className: 'plc-popup', maxWidth: '280px' })
        .setLngLat(f.geometry.coordinates)
        .setHTML('<div class="rad-pop country-popup">' + head + val + when + who + hist + '</div>'));
    } catch (_) { }
    if (hist) series(p.c).then(rows => {
      try {
        const host = document.querySelector('[data-rad-series="' + CSS.escape(p.c) + '"]'); if (!host) return;
        host.innerHTML = rows && rows.length ? spark(rows) : S(L('No history published for this station.', 'この観測局の履歴は公開されていません。', 'Für diese Station wird kein Verlauf veröffentlicht.', 'Для этой станции история не публикуется.', 'No se publica historial para esta estación.'));
      } catch (_) { }
    });
    return el;
  }
  function series(code) {
    const url = feedUrl('mode=series&station=' + encodeURIComponent(code));
    if (!url) return Promise.resolve([]);
    return fetch(url).then(r => r.ok ? r.json() : null).then(j => (j && Array.isArray(j.series)) ? j.series : []).catch(() => []);
  }
  /* an inline sparkline, drawn as an SVG path rather than a canvas so it survives being written
     into a popup that the renderer may re-create. */
  function spark(rows) {
    const vs = rows.map(r => r && typeof r.v === 'number' ? r.v : null).filter(v => v != null);
    if (vs.length < 2) return '';
    const lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs), span = (hi - lo) || 1;
    const W = 180, H = 34, step = W / (vs.length - 1);
    const d = vs.map((v, i) => (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + (H - ((v - lo) / span) * H).toFixed(1)).join(' ');
    return '<svg class="rad-spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="#7ec8ff" stroke-width="1.4"/></svg>' +
      '<div class="rad-spark-r">' + lo.toFixed(0) + '–' + hi.toFixed(0) + ' nSv/h</div>';
  }

  /* ── the legend ───────────────────────────────────────────────────────────────────────────── */
  function legend() {
    if (!state.on) { try { window._hideGenericLegend && window._hideGenericLegend('imrad-obs'); } catch (_) { } return; }
    try {
      if (!window._registerLayerOpacity) return;
      const el = window._registerLayerOpacity('imrad-obs',
        LA('Measured radiation — ambient gamma dose rate', '実測放射線 — 周辺γ線量率', 'Gemessene Strahlung — Umgebungs-Gammadosisleistung', 'Измеренная радиация — мощность амбиентной дозы гамма-излучения', 'Radiación medida — tasa de dosis gamma ambiental'),
        IDS, 'beta-dl-radobs');
      if (!el) return;
      let key = el.querySelector('.rad-key');
      if (!key) {
        key = document.createElement('div'); key.className = 'rad-key';
        const op = el.querySelector('.dl-op-row'); if (op) el.insertBefore(key, op); else el.appendChild(key);
      }
      const band = RAMP.map((r, i) => {
        const next = RAMP[i + 1];
        return '<span class="rad-k"><i style="background:' + r[1] + '"></i>' + (next ? (r[0] + '–' + next[0]) : ('≥' + r[0])) + '</span>';
      }).join('');
      /* ⚠ WHAT THE SOURCES SAID, NOT WHAT WE HOPED THEY WOULD SAY. `read:false` is printed as its
         own state: #R499 and #R536 both cost a round because "could not read" and "read, nothing
         there" were collapsed into one silence. */
      const rows = (feed && feed.sources || []).map(s => '<div class="rad-src' + (s.read ? '' : ' off') + '">' +
        S(s.attribution || s.name) + ' · ' + (s.read ? (S(s.n) + ' ' + S(L('stations', '局', 'Stationen', 'станций', 'estaciones'))) :
          S(L('unavailable', '取得できず', 'nicht verfügbar', 'недоступно', 'no disponible'))) +
        (s.licence ? (' · ' + S(s.licence)) : '') + '</div>').join('');
      const note = '<div class="rad-note">' + S(L(
        '50–200 nSv/h is normal natural background almost everywhere. Rain alone can lift a station up to three times higher for a few hours, and most of these readings are published unvalidated — so one high station is not evidence of a release.',
        '50〜200 nSv/h はほぼ全世界で通常の自然放射線量です。降雨だけでも数時間、最大3倍まで上がることがあり、これらの値の多くは未検証で公開されています。1局が高いことは放出の証拠にはなりません。',
        '50–200 nSv/h ist fast überall normale natürliche Hintergrundstrahlung. Allein Regen kann eine Station für einige Stunden bis auf das Dreifache heben, und die meisten dieser Werte sind unvalidiert veröffentlicht — eine einzelne hohe Station ist kein Beleg für eine Freisetzung.',
        '50–200 нЗв/ч — обычный природный фон почти везде. Один только дождь может на несколько часов поднять показания станции втрое, а большинство этих значений публикуется без верификации — одна станция с высоким показанием не является доказательством выброса.',
        '50–200 nSv/h es el fondo natural normal en casi todo el mundo. La lluvia por sí sola puede triplicar la lectura de una estación durante unas horas, y la mayoría de estos valores se publican sin validar: una estación alta no es prueba de una emisión.')) + '</div>';
      const clock = state.iso ? ('<div class="rad-when">' + S(state.iso) + '</div>') : '';
      /* the two states a reader would otherwise mistake for "that country has no radiation": a
         source still arriving, and a source whose values are a published average for a year the
         clock is not on. */
      const busy = (chunkState.total && chunkState.done < chunkState.total)
        ? ('<div class="rad-src">' + S(L('still loading one network…', 'ある観測網を読み込み中…', 'ein Netz wird noch geladen…', 'одна сеть ещё загружается…', 'aún cargando una red…')) + ' ' + chunkState.done + '/' + chunkState.total + '</div>') : '';
      const nRef = (feed && feed.reference || []).length, nShown = refRows(feed).length;
      const ref = (nRef && !nShown) ? ('<div class="rad-src">' + S(L(
        '{n} more stations publish a period average, not a current reading — set the clock to their year to see them.',
        'ほかに {n} 局が、現在値ではなく期間平均を公表しています。時計をその年に合わせると表示されます。',
        '{n} weitere Stationen veröffentlichen einen Zeitraum-Mittelwert statt eines aktuellen Werts — stellen Sie die Uhr auf ihr Jahr.',
        'Ещё {n} станций публикуют среднее за период, а не текущее показание — установите часы на их год.',
        'Otras {n} estaciones publican un promedio de periodo, no una lectura actual — ajuste el reloj a su año.').split('{n}').join(nRef)) + '</div>') : '';
      const err = state.err ? ('<div class="rad-err">' + S(L('Could not reach the networks.', '観測網に到達できませんでした。', 'Netze nicht erreichbar.', 'Не удалось связаться с сетями.', 'No se pudo contactar con las redes.')) + '</div>') : '';
      key.innerHTML = '<div class="rad-band">' + band + '</div>' + note + clock + rows + busy + ref + err;
    } catch (_) { }
  }

  /* ── the clock ────────────────────────────────────────────────────────────────────────────── */
  /* ⚠ THE DEPTH IS THE PROVIDER'S, NOT A NUMBER OF OURS. Each source declares `historyDays`; the
     feed answers `mode=day` with whichever of them can reach that date and says so in `sources[]`.
     So travelling to 2015 does not blank the layer — it shows the networks that go back that far
     and prints, in the legend, that the others do not. */
  let clockOff = null;
  function watchClock() {
    if (clockOff) return;
    try {
      clockOff = window.IntMapTime.on(e => {
        if (!state.on) return;
        const want = e && e.isLive ? null : ((e && e.iso) || null);
        if (want === state.iso) return;
        load(want);
      });
    } catch (_) { }
  }

  /* ── public ───────────────────────────────────────────────────────────────────────────────── */
  function toggle(on) {
    state.on = !!on;
    if (state.on) {
      if (!ensure()) return false;
      setVis(IDS, true); watchClock();
      if (!feed) load(state.iso);
      else { paint(); legend(); }
      /* the networks publish hourly or every ten minutes; re-reading every five minutes while the
         layer is VISIBLE and the clock is live keeps it current without polling a closed tab. */
      everyTick('rad-obs:refresh', 300000, () => { if (state.on && !state.iso) load(null); });
    } else {
      setVis(IDS, false); stopTick('rad-obs:refresh'); legend();
    }
    notify(); return true;
  }

  /* the join that makes the chain work: given a point, the measuring stations around it.
     js/sims.js uses this to put the real readings beside a modelled plume. */
  function near(lat, lon, km) {
    const R = (typeof km === 'number' && km > 0) ? km : 150, out = [];
    if (!feed || !Array.isArray(feed.stations)) return out;
    const rad = Math.PI / 180, cos = Math.cos(lat * rad);
    for (const s of feed.stations) {
      if (typeof s.y !== 'number' || typeof s.x !== 'number') continue;
      const dy = (s.y - lat) * 111.32, dx = (s.x - lon) * 111.32 * cos;
      const d = Math.sqrt(dy * dy + dx * dx);
      if (d <= R) out.push({ code: s.c, name: s.n, src: s.s, nsvh: s.v, at: s.t, km: d, lat: s.y, lon: s.x });
    }
    out.sort((a, b) => a.km - b.km);
    return out;
  }

  GE().events.on('styledata', () => { if (state.on) { setTimeout(() => { if (ensure()) { setVis(IDS, true); paint(); } }, 80); } });
  window.addEventListener('intmap-lang', () => setTimeout(legend, 20));

  window.IntMapRadiationObs = {
    toggle, load, near, legend,
    state: () => ({
      on: state.on, iso: state.iso, loading: state.loading, err: state.err,
      stations: (feed && feed.stations || []).length,
      sources: (feed && feed.sources || []).map(s => ({ id: s.id, read: !!s.read, n: s.n, licence: s.licence, historyDays: s.historyDays }))
    }),
    stations: () => ((feed && feed.stations) || []).slice(),
    sources: () => ((feed && feed.sources) || []).slice(),
    ramp: () => RAMP.map(r => r.slice()),
    series,
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); }
  };
  return window.IntMapRadiationObs;
};
