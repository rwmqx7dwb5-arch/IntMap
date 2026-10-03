/* ============================================================================
 *  IntMap · IF IT ERUPTED NOW — window.IntMapAshPlume  (science-instruments)
 * ----------------------------------------------------------------------------
 *  A volcano card answered three questions — what has it done (GVP), what do agencies say it is
 *  doing (the status ladder), what does aviation have in force (SIGMET). The fourth one a reader
 *  asks next had no answer anywhere in the program: 「いま噴火したら、灰はどこへ、いつ、どれだけ？」
 *
 *  This panel answers it with the physics in js/ash-model.js over the LIVE upper-air wind
 *  (Open-Meteo, 850–50 hPa), and joins the answer to three things IntMap already has:
 *    · the ground deposit (mm) — and which NAMED towns stand under ≥ 1 mm, with their population
 *      (GeoNames, js/gazetteer.js — the same join js/shakemap.js uses, said the same way);
 *    · the airborne cloud by the London VAAC's flight-level bands and concentration thresholds,
 *      hour by hour on a slider — and which AERODROMES (OpenStreetMap, IATA-coded) the low-level
 *      cloud reaches, and from which hour;
 *    · the dataset registry (js/sim-datasets.js): the deposit and the cloud become two records the
 *      analysis tools and Atlas's `data.query` can read, with the run's arguments and seed as their
 *      provenance.
 *
 *  ⚠ NOTHING RUNS UNTIL THE READER PRESSES 実行. The eruption type defaults from the volcano's own
 *  dominant rock (Mastin et al. 2009's rule) and SAYS so; every number is editable.
 *  ⚠ IT IS NOT A FORECAST and says so on the panel: a VAAC forecasts from an OBSERVED eruption; this
 *  is a what-if over a hypothetical one. The model's assumptions are in science.html#ash.
 * ==========================================================================*/
import { ASH } from './ash-model.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { IntMapLang } from './lang-registry.js';
import { icon, iconNode } from './icons.js';
import { loadData } from './data-door.js';
import { everyTick, stopTick } from './runtime.js';
import { registerSimOutput } from './sim-datasets.js';
import { overpassQuery } from './overpass.js';   /* the one Overpass client, with a clock */
import { jsonWithin } from './fetch-deadline.js';   /* a read with a deadline — js/fetch-deadline.js */

const ASH_VERSION = 'ash-1';

export function ashPlume(HOST) {
  const GE = () => IntMapGeoEngine;
  const L = IntMapLang.pick(() => HOST.lang);
  const S = (v) => { try { return window.IntMapSafe.html(v == null ? '' : String(v)); } catch (_) { return ''; } };
  const loc = () => { try { return IntMapLang.locale(HOST.lang, 'en-GB'); } catch (_) { return 'en-GB'; } };
  const fmt = (v, d) => (v == null || !isFinite(v)) ? '—' : Number(v).toLocaleString(loc(), { maximumFractionDigits: d == null ? 0 : d });
  const sci = (v) => { if (!isFinite(v) || v <= 0) return '—'; const e = Math.floor(Math.log10(v)); return (v / Math.pow(10, e)).toFixed(1) + '×10^' + e; };

  const DEP_SRC = 'imash-dep-src', CLOUD_SRC = 'imash-cloud-src', VENT_SRC = 'imash-vent-src';
  const DEP_COL = ['#e6dcc0', '#c4a46a', '#8f6230', '#4d2a10'];          /* ≥0.1 / 1 / 10 / 100 mm */
  const CONC_COL = ['#64d2ff', '#ff9f0a', '#ff453a'];                    /* ≥0.2 / 2 / 4 mg/m³ */

  /* the eruption types' names — the model keys them, the words are here */
  const styleName = (k) => ({ M1: () => L('Small mafic', '小規模・苦鉄質'), M0: () => L('Standard mafic', '標準・苦鉄質'), S1: () => L('Small silicic', '小規模・珪長質'),
    S0: () => L('Standard silicic', '標準・珪長質'), S3: () => L('Large silicic', '大規模・珪長質') }[k] || (() => k))();

  /* ── where: a volcano of the bundled GVP catalogue, or a point the caller states ─────────── */
  let _gvp = null;
  async function gvp() {
    if (_gvp) return _gvp;
    const j = await loadData('data/volcanoes_gvp.json');
    const rocks = (j && j.rocks) || [];
    _gvp = ((j && j.features) || []).map((f) => { const p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
      return c ? { v: p.v, name: p.n || '', country: p.c || '', lng: +c[0], lat: +c[1], elevM: isFinite(+p.e) ? +p.e : 0,
        rock: p.k != null ? rocks[p.k] || null : null, type: p.t || '' } : null; }).filter(Boolean);
    return _gvp;
  }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ').trim();
  /* A name resolves to a GVP volcano or to nothing — never to the nearest stranger a geocoder knows
     (.agents/rules/no-ad-hoc-hardcoding.md #R515). JMA's own Japanese unit names reach their GVP
     number through the card's join table when the card module is loaded. */
  async function resolveVolcano(q) {
    if (q == null) return null;
    const rows = await gvp();
    if (typeof q === 'number' || /^\d{6}$/.test(String(q))) return rows.find((r) => r.v === +q) || null;
    const s = String(q).trim(); if (!s) return null;
    try { const V = window.IntMapVolcano; if (V && V._jmaMap) { const k = V._jmaKey ? V._jmaKey(s) : s; const vn = V._jmaMap[k] || V._jmaMap[s.replace(/(火山|山)$/, '')]; if (vn) return rows.find((r) => r.v === vn) || null; } } catch (_) {}
    const n = norm(s);
    let hit = rows.find((r) => norm(r.name) === n);
    if (!hit) { const c = rows.filter((r) => norm(r.name).indexOf(n) >= 0 || (n.length >= 4 && n.indexOf(norm(r.name)) >= 0)); if (c.length === 1) hit = c[0]; else if (c.length > 1) hit = c.sort((a, b) => a.name.length - b.name.length)[0]; }
    return hit || null;
  }

  /* ── the wind field ───────────────────────────────────────────────────────────────────────── */
  async function fetchJSON(url) {
    try { if (window.IntMapWx && window.IntMapWx.isOpenMeteo(url)) return await window.IntMapWx.guardedJSON(url, 300000); } catch (_) {}
    /* not Open-Meteo is not a path this panel takes (every URL here is omURL); the remainder still runs under a clock */
    try { return await jsonWithin(url, 30000); } catch (_) {}
    return null;
  }
  function omURL(plan, startMs, windowH) {
    const pts = ASH.planPoints(plan), now = Date.now();
    const past = startMs < now ? Math.min(92, Math.ceil((now - startMs) / 86400e3) + 1) : 0;
    const ahead = Math.max(1, Math.min(16, Math.ceil((startMs + (windowH + 2) * 3600e3 - now) / 86400e3) + 1));
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.LA.join(',') + '&longitude=' + pts.LO.join(',')
      + '&wind_speed_unit=ms&timezone=GMT' + (past ? '&past_days=' + past : '') + '&forecast_days=' + ahead + '&hourly=' + ASH.hourlyVars();
  }
  async function fetchField(lng, lat, startMs, windowH) {
    const need = Math.ceil(windowH) + 2;
    const pin = ASH.innerPlan(lng, lat);
    const jIn = await fetchJSON(omURL(pin, startMs, windowH));
    if (!jIn) return null;
    const a0 = Array.isArray(jIn) ? jIn[0] : jIn; const times = (a0 && a0.hourly && a0.hourly.time) || [];
    const s0 = ASH.resolveStart(times, new Date(startMs).toISOString());
    const inner = ASH.buildNest(pin, jIn, s0, need); if (!inner) return null;
    let sum = 0, n = 0;
    for (let l = 3; l < ASH.LEVELS.length; l++) for (let h = 0; h < inner.H; h += 3) { const u = inner.u[l][h], v = inner.v[l][h]; for (let i = 0; i < u.length; i++) { sum += Math.hypot(u[i], v[i]); n++; } }
    const pout = ASH.outerPlan(lng, lat, n ? sum / n : 15, windowH);
    let outer = null; try { const jo = await fetchJSON(omURL(pout, startMs, windowH)); if (jo) outer = ASH.buildNest(pout, jo, s0, need); } catch (_) { outer = null; }
    return { inner, outer: outer || inner, outerOK: !!outer, half: (outer || inner).half, startISO: times[s0] ? times[s0] + 'Z' : new Date(startMs).toISOString(), hoursAvail: Math.min(inner.H, outer ? outer.H : inner.H) };
  }

  /* ── state ───────────────────────────────────────────────────────────────────────────────── */
  let site = null, res = null, F = null, panel = null, busy = false, progress = 0, cancelTok = null;
  let ui = { style: 'S0', styleFrom: null, hKm: 11, hours: 3, window: 24, m63: 0.4, distal: 0.05, start: '', seed: 1 };
  let view = { band: 0, hour: 0, playing: null };
  let exposure = null, airports = null, datasets = null, lastErr = '';

  function setStyle(k, from) { const st = ASH.STYLES[k]; if (!st) return; ui.style = k; ui.styleFrom = from || null; ui.hKm = st.h; ui.hours = st.hours; ui.m63 = st.m63; }
  function setSite(v) {
    site = v; res = null; exposure = null; airports = null; datasets = null;
    const k = ASH.styleForRock(v && v.rock);
    if (k) setStyle(k, 'rock'); else setStyle('S0', null);
  }

  /* ── layers ──────────────────────────────────────────────────────────────────────────────── */
  function ensureLayers() {
    try { GE().render.claim([DEP_SRC, CLOUD_SRC, VENT_SRC], 'map.ashPlume'); } catch (_) {}
    try {
      if (GE().layers.hasSource(DEP_SRC)) return true;
      const ok = (() => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } })();
      if (!ok) return false;
      GE().layers.addSource(DEP_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      GE().layers.add({ id: 'imash-dep', type: 'fill', source: DEP_SRC, paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.62 } });
      GE().layers.addSource(CLOUD_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      GE().layers.add({ id: 'imash-cloud', type: 'fill', source: CLOUD_SRC, paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.42 } });
      GE().layers.add({ id: 'imash-cloud-line', type: 'line', source: CLOUD_SRC, paint: { 'line-color': ['get', 'c'], 'line-width': 0.6, 'line-opacity': 0.7 } });
      GE().layers.addSource(VENT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      GE().layers.add({ id: 'imash-vent', type: 'circle', source: VENT_SRC, paint: { 'circle-radius': 7, 'circle-color': '#ff453a', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
      return true;
    } catch (_) { return false; }
  }
  const square = (x0, y0, d) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x0 + d, y0], [x0 + d, y0 + d], [x0, y0 + d], [x0, y0]]] });
  function depBand(mm) { let b = -1; for (let i = 0; i < ASH.DEPOSIT_BANDS.length; i++) if (mm >= ASH.DEPOSIT_BANDS[i]) b = i; return b; }
  function concBand(mg) { let b = -1; for (let i = 0; i < ASH.CONC_BANDS.length; i++) if (mg >= ASH.CONC_BANDS[i]) b = i; return b; }
  function depositFeatures() {
    if (!res) return [];
    const out = [];
    for (const c of res.deposit) { const b = depBand(c.mm); if (b < 0) continue;
      out.push({ type: 'Feature', geometry: square(c.ix * res.depCell, c.iy * res.depCell, res.depCell), properties: { c: DEP_COL[b], mm: +c.mm.toFixed(3), band: ASH.DEPOSIT_BANDS[b], n: c.n } }); }
    return out;
  }
  function cloudFeatures(hourIdx, band) {
    const sn = res && res.conc[hourIdx]; if (!sn) return [];
    const out = [];
    for (const c of sn.cells) { const b = concBand(c.mg[band]); if (b < 0) continue;
      out.push({ type: 'Feature', geometry: square(c.ix * res.concCell, c.iy * res.concCell, res.concCell), properties: { c: CONC_COL[b], mg: +c.mg[band].toFixed(3), n: c.n[band] } }); }
    return out;
  }
  function paint(fit) {
    if (!ensureLayers()) return false;
    try { GE().layers.setSourceData(VENT_SRC, { type: 'FeatureCollection', features: site ? [{ type: 'Feature', geometry: { type: 'Point', coordinates: [site.lng, site.lat] }, properties: {} }] : [] }); } catch (_) {}
    const dep = depositFeatures();
    try { GE().layers.setSourceData(DEP_SRC, { type: 'FeatureCollection', features: dep }); } catch (_) {}
    try { GE().layers.setSourceData(CLOUD_SRC, { type: 'FeatureCollection', features: cloudFeatures(view.hour, view.band) }); } catch (_) {}
    if (fit && res) {
      let a = 180, b = 90, c = -180, d = -90;
      const take = (x, y) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); };
      take(site.lng, site.lat);
      for (const f of dep) take(f.geometry.coordinates[0][0][0], f.geometry.coordinates[0][0][1]);
      for (const sn of res.conc) for (const cl of sn.cells) if (concBand(cl.mg[0]) >= 0 || concBand(cl.mg[1]) >= 0) take(cl.ix * res.concCell, cl.iy * res.concCell);
      try { if (c > a) GE().camera.fitBounds([[a - 1, b - 1], [c + 1, d + 1]], { padding: 60, maxZoom: 8, duration: 900 }); } catch (_) {}
    }
    return true;
  }
  function clearMap() { for (const s of [DEP_SRC, CLOUD_SRC, VENT_SRC]) { try { GE().layers.setSourceData(s, { type: 'FeatureCollection', features: [] }); } catch (_) {} } }

  /* ── the run ─────────────────────────────────────────────────────────────────────────────── */
  async function run(opts) {
    opts = opts || {};
    if (opts.volcano != null && !opts.lng) { const v = await resolveVolcano(opts.volcano); if (!v) return { ok: false, reason: 'no-volcano' }; setSite(v); }
    else if (opts.lng != null && opts.lat != null && isFinite(+opts.lng)) setSite({ v: null, name: opts.name || '', lng: +opts.lng, lat: +opts.lat, elevM: isFinite(+opts.ventM) ? +opts.ventM : 0, rock: null });
    if (!site) return { ok: false, reason: 'no-site' };
    if (opts.style && ASH.STYLES[opts.style]) setStyle(opts.style, 'asked');
    if (isFinite(+opts.hKm) && +opts.hKm > 0) ui.hKm = Math.max(0.5, Math.min(40, +opts.hKm));
    if (isFinite(+opts.hours) && +opts.hours > 0) ui.hours = Math.max(0.1, Math.min(120, +opts.hours));
    if (isFinite(+opts.window) && +opts.window > 0) ui.window = Math.max(6, Math.min(72, Math.round(+opts.window)));
    if (isFinite(+opts.m63) && +opts.m63 > 0) ui.m63 = Math.max(0.005, Math.min(0.95, +opts.m63));
    if (isFinite(+opts.distalFrac) && +opts.distalFrac > 0) ui.distal = Math.max(0.001, Math.min(0.5, +opts.distalFrac));
    if (opts.start != null) ui.start = String(opts.start || '');
    ui.seed = (isFinite(+opts.seed) && +opts.seed > 0) ? Math.floor(+opts.seed) : (Math.floor(Math.random() * 1e9) + 1);
    if (cancelTok) cancelTok.cancelled = true;
    const tok = cancelTok = { cancelled: false };
    busy = true; progress = 0; lastErr = ''; res = null; exposure = null; airports = null; datasets = null; render();
    /* a time with no zone is read as UTC — the field says so */
    const startMs = ui.start ? new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(ui.start) ? ui.start : ui.start + 'Z').getTime() : Date.now();
    if (!isFinite(startMs)) { busy = false; lastErr = 'start'; render(); return { ok: false, reason: 'start' }; }
    if (startMs < Date.now() - 92 * 86400e3 || startMs > Date.now() + 14 * 86400e3) { busy = false; lastErr = 'range'; render(); return { ok: false, reason: 'range' }; }
    F = await fetchField(site.lng, site.lat, startMs, ui.window);
    if (tok.cancelled) return { ok: false, reason: 'cancelled' };
    if (!F) { busy = false; lastErr = 'wind'; render(); return { ok: false, reason: 'wind' }; }
    const winH = Math.min(ui.window, Math.max(2, F.hoursAvail - 1));
    const r = await ASH.solve(F, { lng: site.lng, lat: site.lat, ventM: site.elevM || 0, hKm: ui.hKm, hours: ui.hours, window: winH,
      m63: ui.m63, distalFrac: ui.distal, seed: ui.seed }, {
      cancelled: () => tok.cancelled,
      /* the bar is the solve's own fraction of steps done — a measured value, not a spinner in disguise */
      yieldEvery: (frac) => new Promise((rs) => setTimeout(() => { progress = Math.round(100 * frac); if (panel) { const b = panel.querySelector('.ash-bar > i'); if (b) b.style.width = progress + '%'; } rs(); }, 0)),
    });
    if (tok.cancelled || !r) return { ok: false, reason: 'cancelled' };
    res = r; res.startISO = F.startISO; res.window = winH; res.outerOK = F.outerOK; res.domainHalf = F.half;
    busy = false; view.hour = Math.max(0, res.conc.length - 1); view.band = 0;
    exposure = await citiesUnder(1);
    paint(true); render();
    registerOutputs().then((d) => { datasets = d; render(); });
    return summary();
  }

  /* ── what the run SAYS — the one summary the panel, Atlas and the tests all read ─────────── */
  function summary() {
    if (!res) return { ok: false, reason: 'no-run' };
    const peakFL = [0, 1, 2].map((b) => Math.max(0, ...res.conc.map((s) => s.peak[b])));
    const reachKm = (() => { let m = 0; for (const sn of res.conc) for (const c of sn.cells) { if (concBand(Math.max(...c.mg)) < 0) continue;
      const dx = ((c.ix + 0.5) * res.concCell - site.lng) * 111.32 * Math.cos(site.lat * Math.PI / 180), dy = ((c.iy + 0.5) * res.concCell - site.lat) * 111.32; m = Math.max(m, Math.hypot(dx, dy)); } return Math.round(m); })();
    return { ok: true, version: ASH_VERSION, volcano: site.name || null, gvp: site.v || null, lng: site.lng, lat: site.lat, ventM: site.elevM || 0,
      style: ui.style, styleFrom: ui.styleFrom, hKm: ui.hKm, eruptionHours: ui.hours, windowHours: res.window, m63: ui.m63, distalFrac: res.distal,
      seed: res.seed, startISO: res.startISO, merKgS: res.mer, totalKg: res.totalKg,
      depositedKg: res.depositedKg, escapedKg: res.escapedKg, airborneKg: res.airborneKg, notPlacedKg: res.notPlacedKg, aboveTopKg: res.aboveTopKg,
      peakDepositMm: res.peak ? res.peak.mm : null, peakDepositRelSE: res.peak ? 1 / Math.sqrt(res.peak.n) : null,
      depositKm2: Object.fromEntries(ASH.DEPOSIT_BANDS.map((b, i) => ['≥' + b + 'mm', Math.round(res.bandKm2[i])])),
      peakConcMgM3: { 'SFC-FL200': peakFL[0], 'FL200-350': peakFL[1], 'FL350-550': peakFL[2] }, cloudReachKm: reachKm,
      domainComplete: res.outerOK, exposure: exposure ? { minMm: exposure.minMm, towns: exposure.towns, population: exposure.population, top: exposure.top.slice(0, 8) } : null,
      datasets: datasets ? datasets.map((d) => d && d.id).filter(Boolean) : null };
  }

  /* ── exposure: NAMED towns under the deposit — the js/shakemap.js join, worded the same way ─ */
  async function citiesUnder(minMm) {
    if (!res) return null;
    let rows = [];
    try { await window.IntMapGazetteer.warm(); rows = window.IntMapGazetteer.world() || []; } catch (_) { rows = []; }
    if (!rows.length) return { ok: false, minMm, towns: 0, population: 0, top: [] };
    let w = 180, s = 90, e = -180, n = -90;
    for (const c of res.deposit) { if (c.mm < minMm) continue; w = Math.min(w, c.ix * res.depCell); e = Math.max(e, (c.ix + 1) * res.depCell); s = Math.min(s, c.iy * res.depCell); n = Math.max(n, (c.iy + 1) * res.depCell); }
    const hit = []; let pop = 0;
    if (e > w) for (const r of rows) { const lon = +r[2], lat = +r[3]; if (!(lon >= w && lon <= e && lat >= s && lat <= n)) continue;
      const mm = ASH.depositAt(res, lon, lat); if (mm < minMm) continue; const p = +r[6] || 0; pop += p;
      hit.push({ name: r[4], nameJa: r[5], lng: lon, lat, pop: p, mm: +mm.toFixed(1) }); }
    hit.sort((a, b) => (b.mm - a.mm) || (b.pop - a.pop));
    return { ok: true, minMm, towns: hit.length, population: pop, top: hit.slice(0, 40) };
  }

  /* ── aerodromes the cloud or the deposit reaches — asked of OpenStreetMap on demand ───────── */
  async function airportsHit() {
    if (!res) return null;
    let w = 180, s = 90, e = -180, n = -90; const grow = (x0, y0, d) => { w = Math.min(w, x0); s = Math.min(s, y0); e = Math.max(e, x0 + d); n = Math.max(n, y0 + d); };
    for (const c of res.deposit) if (c.mm >= 0.1) grow(c.ix * res.depCell, c.iy * res.depCell, res.depCell);
    for (const sn of res.conc) for (const c of sn.cells) if (c.mg[0] >= ASH.CONC_BANDS[0]) grow(c.ix * res.concCell, c.iy * res.concCell, res.concCell);
    if (!(e > w)) return { ok: true, rows: [] };
    s = Math.max(-85, s); n = Math.min(85, n);
    const q = '[out:json][timeout:40];nwr["aeroway"="aerodrome"]["iata"](' + s.toFixed(2) + ',' + w.toFixed(2) + ',' + n.toFixed(2) + ',' + e.toFixed(2) + ');out center tags 2000;';
    let j = null; try { j = await overpassQuery(q, { race: true }); } catch (_) { j = null; }
    if (!j) return { ok: false, rows: [] };
    const out = [];
    for (const el of (j.elements || [])) {
      const t = el.tags || {}, lat = el.lat != null ? el.lat : (el.center && el.center.lat), lon = el.lon != null ? el.lon : (el.center && el.center.lon);
      if (lat == null || lon == null) continue;
      const mm = ASH.depositAt(res, lon, lat);
      const key = Math.floor(lon / res.concCell) + ':' + Math.floor(lat / res.concCell);
      let first = null, maxMg = 0;
      res.conc.forEach((sn) => { if (!sn._idx) { sn._idx = new Map(); for (const c of sn.cells) sn._idx.set(c.ix + ':' + c.iy, c); }
        const c = sn._idx.get(key); if (c && c.mg[0] >= ASH.CONC_BANDS[0]) { if (first == null) first = sn.h; maxMg = Math.max(maxMg, c.mg[0]); } });
      if (mm < 0.1 && first == null) continue;
      out.push({ name: t['name:' + (HOST.lang === 'jp' ? 'ja' : 'en')] || t['name:en'] || t.name || t.iata, iata: t.iata || '', icao: t.icao || '', lng: lon, lat, mm: +mm.toFixed(2), firstHour: first, maxMg: +maxMg.toFixed(2) });
    }
    out.sort((a, b) => ((a.firstHour == null ? 1e9 : a.firstHour) - (b.firstHour == null ? 1e9 : b.firstHour)) || (b.mm - a.mm));
    return { ok: true, rows: out };
  }

  /* ── into the dataset registry: the deposit and the cloud, with the run as their provenance ─ */
  async function registerOutputs() {
    if (!res || !site) return null;
    const params = { volcano: site.name || null, gvp: site.v || null, lng: site.lng, lat: site.lat, ventM: site.elevM || 0, style: ui.style,
      hKm: ui.hKm, eruptionHours: ui.hours, windowHours: res.window, m63: ui.m63, distalFrac: res.distal, start: res.startISO };
    const t0 = new Date(res.startISO).getTime();
    const dep = depositFeatures().map((f) => ({ type: 'Feature', geometry: f.geometry, properties: { mm: f.properties.mm, band_mm: f.properties.band, particles: f.properties.n } }));
    const cloud = [];
    res.conc.forEach((sn) => { for (const c of sn.cells) for (let b = 0; b < 3; b++) { if (!(c.mg[b] >= ASH.CONC_BANDS[0])) continue;
      cloud.push({ type: 'Feature', geometry: square(c.ix * res.concCell, c.iy * res.concCell, res.concCell),
        properties: { at: new Date(t0 + sn.h * 3600e3).toISOString(), hour: sn.h, fl_band: ASH.FL_BANDS[b].join('-'), mg_m3: +c.mg[b].toFixed(3), particles: c.n[b] } }); } });
    const nm = site.name || (site.lat.toFixed(2) + ', ' + site.lng.toFixed(2));
    const a = await registerSimOutput({ sim: 'ashDeposit', version: ASH_VERSION, seed: res.seed, params, features: dep,
      title: L('Ash deposit (model) — ', '降灰（モデル） — ') + nm, file: 'IntMap · ash model (' + ASH_VERSION + ')',
      time: { kind: 'constant', start: res.startISO, end: new Date(t0 + res.window * 3600e3).toISOString() },
      fieldStatements: { mm: { unit: 'mm', unitStated: 'source', unitFrom: 'ash model' } } });
    const b = await registerSimOutput({ sim: 'ashCloud', version: ASH_VERSION, seed: res.seed, params, features: cloud,
      title: L('Ash cloud (model) — ', '火山灰雲（モデル） — ') + nm, file: 'IntMap · ash model (' + ASH_VERSION + ')',
      time: { kind: 'instant', field: 'at' },
      fieldStatements: { mg_m3: { unit: 'mg/m3', unitStated: 'source', unitFrom: 'ash model' } } });
    return [a, b];
  }

  /* ── the panel ───────────────────────────────────────────────────────────────────────────── */
  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    panel = document.createElement('div'); panel.id = 'ash-panel'; panel.className = 'ash-panel';
    (document.getElementById('map-container') || document.body).appendChild(panel);
    panel.addEventListener('click', onClick); panel.addEventListener('change', onChange); panel.addEventListener('input', onInput);
    return panel;
  }
  const row = (k, v) => '<div class="acp-row"><span class="acp-k">' + S(k) + '</span><span class="acp-v">' + S(v) + '</span></div>';
  const rowSw = (k, col, v) => '<div class="acp-row"><span class="acp-k">' + S(k) + '</span><span class="acp-v"><span class="ash-sw" style="background:' + S(col) + '"></span>' + S(v) + '</span></div>';
  const sec = (t) => '<div class="acp-sec">' + S(t) + '</div>';
  const note = (t) => '<div class="acp-note">' + S(t) + '</div>';
  const num = (cls, v, min, max, step, name) => '<input class="ash-in ' + S(cls) + '" type="number" aria-label="' + S(name) + '" min="' + S(min) + '" max="' + S(max) + '" step="' + S(step) + '" value="' + S(v) + '">';
  function controlsHTML() {
    const st = ASH.STYLES[ui.style];
    let h = '<label class="ash-lb">' + S(L('Eruption type (Mastin et al. 2009)', '噴火の型（Mastin ほか 2009）')) + '<select class="ash-in ash-style" aria-label="' + S(L('Eruption type', '噴火の型')) + '">'
      + Object.keys(ASH.STYLES).map((k) => '<option value="' + S(k) + '"' + (k === ui.style ? ' selected' : '') + '>' + S(k) + ' · ' + S(styleName(k)) + ' (' + S(ASH.STYLES[k].ex) + ')</option>').join('') + '</select></label>';
    if (ui.styleFrom === 'rock' && site && site.rock) h += '<div class="ash-hint">' + S(L('Chosen from this volcano\'s dominant rock (', 'この火山の主要岩石（') + site.rock + L(') — Mastin\'s default for its composition. Change it freely.', '）から選んだ既定値です（Mastin の組成別の既定）。自由に変えられます。')) + '</div>';
    else if (site && !ASH.styleForRock(site.rock)) h += '<div class="ash-hint">' + S(L('The catalogue gives no dominant rock for this point, so no type is implied — the silicic standard is shown; choose the one you mean.', 'カタログにこの地点の主要岩石が無いため、型は推定していません（珪長質の標準を表示）。想定する型を選んでください。')) + '</div>';
    h += '<div class="ash-grid">'
      + '<label class="ash-lb">' + S(L('Column height above vent (km)', '噴煙柱の高さ・火口上 (km)')) + num('ash-h', ui.hKm, 0.5, 40, 0.5, L('Column height above vent (km)', '噴煙柱の高さ・火口上 (km)')) + '</label>'
      + '<label class="ash-lb">' + S(L('Eruption duration (h)', '噴火の継続 (h)')) + num('ash-dur', ui.hours, 0.1, 120, 0.5, L('Eruption duration (h)', '噴火の継続 (h)')) + '</label>'
      + '<label class="ash-lb">' + S(L('Fine ash < 63 µm (fraction)', '63 µm 未満の細粒分（割合）')) + num('ash-m63', ui.m63, 0.005, 0.95, 0.005, L('Fine ash < 63 µm (fraction)', '63 µm 未満の細粒分（割合）')) + '</label>'
      + '<label class="ash-lb">' + S(L('Hours to follow', '追跡する時間 (h)')) + num('ash-win', ui.window, 6, 72, 1, L('Hours to follow', '追跡する時間 (h)')) + '</label>'
      + '</div>'
      + '<label class="ash-lb">' + S(L('Eruption start (UTC; empty = now)', '噴火開始（UTC・空欄＝いま）')) + '<input class="ash-in ash-start" type="datetime-local" aria-label="' + S(L('Eruption start (UTC)', '噴火開始 (UTC)')) + '" value="' + S(String(ui.start).slice(0, 16)) + '"></label>'
      + '<div class="ash-hint">' + S(L('Mass eruption rate follows from the height (Mastin\'s fit): ', '噴出率は高さから決まります（Mastin の回帰式）: ')) + '<b>' + S(sci(ASH.merFromHeight(ui.hKm)) + ' kg/s') + '</b>'
      + (st ? ' · ' + S(L('type values: ', '型の値: ') + st.h + ' km · ' + st.hours + ' h · m63 ' + st.m63) : '') + '</div>';
    return h;
  }
  function resultsHTML() {
    if (busy) return '<div class="ash-bar"><i style="width:' + S(progress) + '%"></i></div><div class="ash-hint">' + S(L('Fetching the upper-air wind and following the particles…', '上空の風を取得し、粒子を追跡しています…')) + '</div>';
    if (lastErr) return note(lastErr === 'wind' ? L('The upper-air wind could not be fetched, so nothing was computed.', '上空の風を取得できなかったため、計算していません。')
      : lastErr === 'range' ? L('The wind service covers the last 92 days and the next 14; this start is outside it.', '風のデータは過去92日〜先14日の範囲です。この開始時刻は範囲外です。')
      : L('That start time could not be read.', '開始時刻を読めませんでした。'));
    if (!res) return '';
    const sm = summary();
    let h = sec(L('Source', '噴出源'))
      + row(L('Mass eruption rate', '噴出率'), sci(res.mer) + ' kg/s')
      + row(L('Erupted mass', '総噴出量'), sci(res.totalKg) + ' kg')
      + row(L('Start (UTC)', '開始 (UTC)'), String(res.startISO).replace('T', ' ').slice(0, 16))
      + note(L('The rate is inferred from the column height. The eruptions this relation was fitted to scatter around it by a factor of several — the least certain number in the run.', '噴出率は噴煙柱の高さから推定した値です。この関係式の元になった噴火は式の周りに数倍ばらつき、この計算で最も不確かな数です。'));
    h += sec(L('Ground deposit', '地表の降灰'));
    if (res.peak) h += row(L('Thickest (well-sampled cell)', '最大の厚さ（十分に標本化されたセル）'), fmt(res.peak.mm, res.peak.mm < 10 ? 1 : 0) + ' mm ±' + Math.round(100 / Math.sqrt(res.peak.n)) + '%');
    ASH.DEPOSIT_BANDS.forEach((b, i) => { h += rowSw('≥ ' + b + ' mm', DEP_COL[i], fmt(res.bandKm2[i]) + ' km²'); });
    h += note(L('About 1 mm is where ash fall starts closing airports and hiding road markings; roofs begin to be at risk around 100 mm (more when wet). Assumes a deposit density of 1000 kg/m³.', '降灰はおよそ 1 mm で空港の閉鎖や路面標示の視認不能が始まり、100 mm 前後（濡れるとより少なく）で屋根への危険が出始めます。堆積物の密度は 1000 kg/m³ と仮定。'));
    if (exposure && exposure.ok) {
      h += row(L('Named towns under ≥ 1 mm', '≥ 1 mm の範囲にある地名辞典の町'), fmt(exposure.towns)) + row(L('Population of those towns', 'それらの町の人口'), fmt(exposure.population));
      for (const t of exposure.top.slice(0, 8)) h += row((HOST.lang === 'jp' && t.nameJa) ? t.nameJa : t.name, fmt(t.mm, 1) + ' mm');
      h += note(L('Counted at each named place in the GeoNames gazetteer — the population of those places, not of everyone under the deposit.', 'GeoNames の地名辞典にある各地点で数えた値で、降灰域にいる全員ではなく、それらの町の人口です。'));
    }
    h += sec(L('Ash cloud (London VAAC bands)', '火山灰雲（ロンドン VAAC の区分）'));
    const bands = ['SFC–FL200', 'FL200–350', 'FL350–550'];
    h += '<div class="ash-seg">' + bands.map((b, i) => '<button type="button" class="ash-segb' + (view.band === i ? ' on' : '') + '" data-ashband="' + S(i) + '">' + S(b) + '</button>').join('') + '</div>';
    const sn = res.conc[view.hour];
    h += '<div class="ash-time"><button type="button" class="ash-play" aria-label="' + S(L('Play', '再生')) + '">' + icon(view.playing ? 'pause' : 'play') + '</button>'
      + '<input class="ash-slider" type="range" aria-label="' + S(L('Hour after the start', '開始からの時刻')) + '" min="0" max="' + S(Math.max(0, res.conc.length - 1)) + '" step="1" value="' + S(view.hour) + '">'
      + '<span class="ash-tl">' + S('T+' + (sn ? sn.h : 0) + ' h') + '</span></div>';
    if (sn) h += row(L('Peak at this hour', 'この時刻の最大濃度'), fmt(sn.peak[view.band], 2) + ' mg/m³');
    h += '<div class="ash-legend">' + ASH.CONC_BANDS.map((c, i) => '<span><i class="ash-sw" style="background:' + S(CONC_COL[i]) + '"></i>' + S('≥ ' + c + ' mg/m³') + '</span>').join('') + '</div>';
    h += row(L('Farthest reach of ≥ 0.2 mg/m³', '0.2 mg/m³ 以上の最遠到達'), fmt(sm.cloudReachKm) + ' km');
    h += note(L('Only the distal fine ash is carried in the cloud: ', '雲として運ぶのは遠方まで残る細粒火山灰だけです: ') + Math.round(res.distal * 100) + L('% of the erupted mass (the fraction the UK Met Office used for Eyjafjallajökull).', '%（英国気象局がエイヤフィヤトラヨークトルで用いた割合）。'));
    h += sec(L('Aerodromes', '空港'));
    if (!airports) h += '<button type="button" class="acp-mini ash-apts">' + S(L('Find the airports the ash reaches', '灰が届く空港を探す')) + '</button>';
    else if (airports === 'busy') h += '<div class="ash-hint">' + S(L('Asking OpenStreetMap…', 'OpenStreetMap に問い合わせ中…')) + '</div>';
    else if (!airports.ok) h += note(L('OpenStreetMap did not answer.', 'OpenStreetMap が応答しませんでした。'));
    else if (!airports.rows.length) h += note(L('No IATA-coded aerodrome lies under the low-level cloud or the ≥ 0.1 mm deposit.', '低層の雲・0.1 mm 以上の降灰の下に IATA コードのある空港はありません。'));
    else for (const a of airports.rows.slice(0, 14)) h += row(a.name + (a.iata ? ' (' + a.iata + ')' : ''),
      (a.firstHour != null ? 'T+' + a.firstHour + ' h · ' + fmt(a.maxMg, 2) + ' mg/m³' : '') + (a.mm >= 0.1 ? (a.firstHour != null ? ' · ' : '') + fmt(a.mm, 1) + ' mm' : ''));
    h += sec(L('What this run leaves out', 'この計算が扱っていないもの'));
    const pct = (x) => Math.round(100 * x / res.totalKg) + '%';
    h += row(L('Fine ash not placed (aggregation not modelled)', '置き場所を計算していない細粒分（凝集を扱わない）'), pct(res.notPlacedKg));
    if (res.escapedKg / res.totalKg > 0.01) h += row(L('Left the modelled area', 'モデル領域の外へ'), pct(res.escapedKg));
    if (res.airborneKg / res.totalKg > 0.01) h += row(L('Still airborne at the end', '計算終了時にまだ空中'), pct(res.airborneKg));
    if (res.aboveTopKg / res.totalKg > 0.01) h += row(L('Rose above 50 hPa (wind held constant there)', '50 hPa より上へ（そこでは風を一定とみなす）'), pct(res.aboveTopKg));
    if (!res.outerOK) h += note(L('The far-field wind could not be fetched; only the near field was modelled, so material leaves the domain early.', '遠方の風を取得できず、近傍だけで計算しました。早い段階で領域外へ出ます。'));
    h += '<div class="ash-hint">' + S(L('Seed ', '乱数の種 ') + res.seed + ' · ' + res.particles.toLocaleString(loc())) + S(L(' particles · re-running with the same seed and wind repeats the run exactly.', ' 粒子・同じ種と同じ風なら同じ結果を再現します。')) + '</div>';
    if (datasets && datasets.some(Boolean)) h += '<div class="ash-hint">' + S(L('Saved for analysis as ', '分析用データセットとして保存: ')) + datasets.filter(Boolean).map((d) => '<code>' + S(d.id) + '</code>').join(' · ') + '</div>';
    return h;
  }
  function render() {
    const p = ensurePanel();
    const where = site ? (site.name || (site.lat.toFixed(3) + ', ' + site.lng.toFixed(3))) + (site.elevM ? ' · ' + fmt(site.elevM) + ' m' : '') : L('No volcano chosen', '火山が選ばれていません');
    p.innerHTML = '<div class="ash-head">' + icon('volcano') + '<span class="ash-title">' + S(L('If it erupted now — volcanic ash', 'いま噴火したら — 火山灰')) + '</span><button type="button" class="ash-x" aria-label="' + S(L('Close', '閉じる')) + '">' + icon('close') + '</button></div>'
      + '<div class="ash-body"><div class="ash-where">' + S(where) + '</div>'
      + (site ? controlsHTML() : '')
      + '<button type="button" class="ash-go"' + (site && !busy ? '' : ' disabled') + '>' + S(busy ? L('Computing…', '計算中…') : L('Run on the live upper-air wind', '実際の上空の風で計算する')) + '</button>'
      + resultsHTML()
      + '<div class="ash-foot">' + S(L('A what-if over a hypothetical eruption, not a forecast. Real ash advisories come from the Volcanic Ash Advisory Centres.', '仮想の噴火に対する「もしも」の計算で、予報ではありません。実際の火山灰情報は航空路火山灰情報センター（VAAC）が発表します。'))
      + ' <a href="./science.html#ash" target="_blank" rel="noopener">' + S(L('Method and assumptions', '手法と仮定')) + '</a></div></div>';
    try { if (typeof HOST.makeDraggable === 'function') HOST.makeDraggable(p, p.querySelector('.ash-head')); } catch (_) {}
  }
  function onClick(ev) {
    const t = ev.target && ev.target.closest ? ev.target.closest('button') : null; if (!t) return;
    if (t.classList.contains('ash-x')) { close(); return; }
    if (t.classList.contains('ash-go')) { run({}); return; }
    if (t.classList.contains('ash-apts')) { airports = 'busy'; render(); airportsHit().then((r) => { airports = r || { ok: false, rows: [] }; render(); }); return; }
    if (t.dataset.ashband != null) { view.band = +t.dataset.ashband; paint(false); render(); return; }
    if (t.classList.contains('ash-play')) { togglePlay(); }
  }
  function onChange(ev) {
    const t = ev.target; if (!t || !t.classList) return;
    if (t.classList.contains('ash-style')) { setStyle(t.value, 'chosen'); render(); return; }
    const v = +t.value;
    if (t.classList.contains('ash-h') && isFinite(v)) { ui.hKm = Math.max(0.5, Math.min(40, v)); render(); }
    else if (t.classList.contains('ash-dur') && isFinite(v)) ui.hours = Math.max(0.1, Math.min(120, v));
    else if (t.classList.contains('ash-m63') && isFinite(v)) ui.m63 = Math.max(0.005, Math.min(0.95, v));
    else if (t.classList.contains('ash-win') && isFinite(v)) ui.window = Math.max(6, Math.min(72, Math.round(v)));
    else if (t.classList.contains('ash-start')) ui.start = t.value || '';
  }
  function onInput(ev) {
    const t = ev.target; if (!t || !t.classList || !t.classList.contains('ash-slider')) return;
    view.hour = +t.value; paint(false);
    const sn = res && res.conc[view.hour], lab = panel.querySelector('.ash-tl'); if (lab && sn) lab.textContent = 'T+' + sn.h + ' h';
  }
  function togglePlay() {
    if (view.playing) { stopTick(view.playing); view.playing = null; render(); return; }
    if (!res) return;
    if (view.hour >= res.conc.length - 1) view.hour = 0;
    view.playing = everyTick('ash-plume:play', 450, () => {
      if (!res || view.hour >= res.conc.length - 1) { stopTick(view.playing); view.playing = null; render(); return; }
      view.hour++; paint(false); const s = panel && panel.querySelector('.ash-slider'); if (s) s.value = view.hour;
      const sn = res.conc[view.hour], lab = panel && panel.querySelector('.ash-tl'); if (lab && sn) lab.textContent = 'T+' + sn.h + ' h';
    });
    render();
  }

  async function open(target) {
    if (target != null) {
      let v = null;
      if (typeof target === 'object' && target.lng != null) v = { v: target.v || null, name: target.name || '', lng: +target.lng, lat: +target.lat, elevM: isFinite(+target.elevM) ? +target.elevM : 0, rock: target.rock || null };
      else v = await resolveVolcano(target);
      if (v) setSite(v);
    }
    const p = ensurePanel(); p.style.display = 'flex'; render();
    try { if (typeof HOST.bringToFront === 'function') HOST.bringToFront(p); } catch (_) {}
    if (site) { try { GE().camera.easeTo({ center: [site.lng, site.lat], zoom: Math.min(Math.max(GE().camera.getZoom(), 5), 7), duration: 800 }); } catch (_) {} paint(false); }
    return !!site;
  }
  function close() { if (cancelTok) cancelTok.cancelled = true; if (view.playing) { stopTick(view.playing); view.playing = null; } busy = false;
    if (panel) panel.style.display = 'none'; clearMap(); return true; }
  const panelOpen = () => !!(panel && panel.style.display !== 'none');
  const isOpen = () => { if (panelOpen()) return true; try { const d = GE().layers.sourceData(DEP_SRC); return !!(d && d.features && d.features.length); } catch (_) { return false; } };

  try { window.IntMapLangSwitch.bind(() => HOST.lang, () => { if (panelOpen()) render(); }); } catch (_) {}
  try { GE().events.on('styledata', () => { setTimeout(() => { if (res && panelOpen()) paint(false); }, 160); }); } catch (_) {}

  const API = { open, close, isOpen, run, summary, resolveVolcano, citiesUnder, airportsHit, clear: () => { res = null; clearMap(); if (panelOpen()) render(); return true; },
    STYLES: ASH.STYLES, version: ASH_VERSION, _state: () => ({ site, ui: Object.assign({}, ui), view: Object.assign({}, view, { playing: !!view.playing }), hasRun: !!res }) };
  window.IntMapAshPlume = API;
  return API;
}
