/* ============================================================================
 *  IntMap · js/layer-pkg-launches.js — LAYER PACKAGE: rocket launches (dl-launches)
 * ----------------------------------------------------------------------------
 *  (layer-packages) The implementation of the row whose declaration says `pkg: 'launches'`
 *  (js/layers/dl-launches.js): the launches Launch Library 2 (The Space Devs) states around the clock's
 *  instant, drawn at their launch pads — an upcoming launch in orange, a past one in grey, a pad that
 *  carries several with a count — and the card a tap on a pad opens.
 *
 *  WHAT THE LAYER SAYS ABOUT TIME. LL2 states each launch's NET (no-earlier-than) and, for the launches
 *  that have happened, an outcome; it holds every orbital launch since 1957 and the schedule ahead. The layer
 *  draws the launches whose NET is in [instant − 7 days, instant + 30 days] — the instant being IntMapTime's
 *  (the present when the clock is live; the moment the reader moved it to otherwise). A launch after the
 *  instant is drawn as «scheduled», one before it as «launched»; that is a statement about the NET, not
 *  about what was known then: the status a card shows is LL2's record as it stands today, and the legend says
 *  so whenever the clock is not live. Nothing else is drawn — no interpolation, no launch LL2 does not state.
 *  The row's `record` declaration (js/layer-time-decl.js) names `launchesToPads` as where the instant is applied.
 *
 *  THE UPSTREAM AND ITS BUDGET (measured 2026-11-17, `mode=normal`, `ordering=net`):
 *    · https://ll.thespacedevs.com/2.3.0/launches/ answers with `access-control-allow-origin: *`, so the page reads
 *      it directly (js/widget-defs-data.js `space.launch` reads the same host). `mode=list` carries NO pad,
 *      rocket or mission, so the card needs `normal`: 25 launches were 232,726 B, i.e. ~9 KB each.
 *    · the free tier allows about 15 requests an hour. One request covers the WHOLE window (`net__gte` and
 *      `net__lte` on the one `/launches/` list, 100 a page; at most MAX_PAGES pages are followed, and a window
 *      that still has more says so in the legend rather than drawing it as complete). The answer is kept for the
 *      session per UTC day of the instant, and the same day is not asked again within REFRESH_MS; a clock
 *      being dragged waits for the reader to stop (SETTLE_MS) before the first request.
 *    · a 429 carries «Expected available in N seconds» in its body: that number is told to the reader, and no
 *      request is made before it has passed. It is a refusal that was observed, so it is a toast and a state on
 *      the row (layerState.report), never an empty map.
 *    REFRESH_MS = 30 min — the budget above (15 an hour) with room for the widget that shares it; lapses if
 *    The Space Devs change the tier.
 *
 *  ⚠ LAZY: nothing is fetched or drawn until the row is switched on (`on`), and `off` removes everything it added.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import * as bus from './bus.js';
import { IntMapLang } from './lang-registry.js';
import { layerState } from './layer-state.js';
import { readWithin, untilObserved } from './fetch-deadline.js';
import { clockFor } from './proxy-fetch.js';

const DAY = 86400000;
/** the launches drawn lie in [instant − PAST_DAYS, instant + AHEAD_DAYS] (the reader's ask: 「今後30日の予定＋過去7日」) */
const PAST_DAYS = 7, AHEAD_DAYS = 30;
const REFRESH_MS = 30 * 60000, SETTLE_MS = 450, MAX_PAGES = 3, PAGE = 100;
const ROW = 'dl-launches', SRC = 'iml-launch-src', PADS = 'iml-launch-pads', COUNT = 'iml-launch-count';
const LL2 = 'https://ll.thespacedevs.com/2.3.0/launches/';

/** the request for one UTC day's window: every launch whose NET is in [day − 7 d, day + 1 d + 30 d] */
export function launchesUrl(dayKey) {
  const iso = (/** @type {number} */ ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const from = dayKey * DAY - PAST_DAYS * DAY, to = (dayKey + 1) * DAY + AHEAD_DAYS * DAY;
  return LL2 + '?mode=normal&ordering=net&limit=' + PAGE + '&net__gte=' + iso(from) + '&net__lte=' + iso(to);
}
/** the UTC day an instant is in — the unit the fetched windows are kept by */
export const dayKeyOf = (/** @type {number} */ ms) => Math.floor(ms / DAY);

/* a missing value is null — `Number(null)` is 0, which would put a pad with no position at 0°N 0°E */
const num = (/** @type {any} */ v) => { const n = v == null || (typeof v === 'string' && v.trim() === '') ? NaN : Number(v); return Number.isFinite(n) ? n : null; };
const httpsUrl = (/** @type {any} */ v) => { try { const u = new URL(String(v)); return u.protocol === 'https:' ? u.href : ''; } catch (_) { return ''; } };

/** one LL2 launch (mode=normal) → what the layer uses, or null when it has no NET or no pad position */
function normaliseLaunch(/** @type {any} */ r) {
  if (!r || typeof r !== 'object') return null;
  const net = Date.parse(r.net);
  const pad = r.pad || {};
  const lat = num(pad.latitude), lon = num(pad.longitude);
  if (!Number.isFinite(net) || lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const st = r.status || {};
  const vids = [].concat(r.vid_urls || [], (r.mission && r.mission.vid_urls) || [])
    .map((/** @type {any} */ v) => httpsUrl(v && typeof v === 'object' ? v.url : v)).filter(Boolean);
  const cfg = (r.rocket && r.rocket.configuration) || {};
  return {
    id: String(r.id || r.slug || r.name), name: String(r.name || ''), net,
    precision: (r.net_precision && r.net_precision.name) ? String(r.net_precision.name) : '',
    status: { id: num(st.id), abbrev: String(st.abbrev || ''), name: String(st.name || '') },
    provider: String((r.launch_service_provider && r.launch_service_provider.name) || ''),
    rocket: String(cfg.full_name || cfg.name || ''),
    orbit: String((r.mission && r.mission.orbit && r.mission.orbit.name) || ''),
    mission: String((r.mission && r.mission.name) || ''),
    padId: String(pad.id != null ? pad.id : lat + ',' + lon), padName: String(pad.name || ''),
    place: String((pad.location && pad.location.name) || ''), lat, lon,
    vids: [...new Set(vids)], live: !!r.webcast_live,
  };
}

/** the launches whose NET is in the instant's window, grouped by pad — the ONE place the clock's instant is applied.
    → [{ id, name, place, lat, lon, up, past, launches: [upcoming ascending…, past newest first…] }] */
export function launchesToPads(/** @type {any[]} */ results, /** @type {number} */ tMs) {
  const from = tMs - PAST_DAYS * DAY, to = tMs + AHEAD_DAYS * DAY;
  /** @type {Map<string, any>} */ const pads = new Map();
  for (const r of results || []) {
    const l = normaliseLaunch(r);
    if (!l || l.net < from || l.net > to) continue;
    let p = pads.get(l.padId);
    if (!p) { p = { id: l.padId, name: l.padName, place: l.place, lat: l.lat, lon: l.lon, up: 0, past: 0, launches: [] }; pads.set(l.padId, p); }
    if (l.net > tMs) p.up++; else p.past++;
    p.launches.push(l);
  }
  for (const p of pads.values()) {
    p.launches.sort((/** @type {any} */ a, /** @type {any} */ b) => {
      const au = a.net > tMs, bu = b.net > tMs;
      return au !== bu ? (au ? -1 : 1) : au ? a.net - b.net : b.net - a.net;
    });
  }
  return [...pads.values()];
}

/** the pads as a FeatureCollection. `name` is on every feature because the shared place reader (js/map-ui.js onLabel)
    hands a tap to a reader only when the feature has one. `lbl` is the count badge, present only when a pad has several. */
export function padsToGeoJSON(/** @type {any[]} */ pads) {
  return { type: 'FeatureCollection', features: pads.map((p) => ({
    type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { id: p.id, name: p.name || p.place || 'Launch pad', up: p.up, past: p.past, count: p.launches.length, lbl: p.launches.length > 1 ? String(p.launches.length) : '' },
  })) };
}

/** the seconds LL2's 429 says to wait («Request was throttled. Expected available in 1789 seconds.»), or null */
export function throttleSeconds(/** @type {any} */ body) {
  const m = /available in (\d+) second/i.exec(typeof body === 'string' ? body : '');
  return m ? Number(m[1]) : null;
}

/** @param {any} K the layer kit js/data-layers.js hands every package (`packageKit` there)
    @returns {{ rows: Record<string, { on: () => any, off: () => void, opacity: (v: number) => void }> }} */
export function launchesPackage(K) {
  const { GE, HOST, opacities, satToast } = K;
  const text = IntMapLang.pick(() => HOST.lang);
  const LA = IntMapLang.pickArgs();   /* the translation tuple builder, bound here so scripts/i18n-audit.mjs counts the row's name */
  const escape = (/** @type {any} */ v) => window.IntMapSafe.html(String(v == null ? '' : v));
  const tag = () => IntMapLang.htmlTag(HOST.lang);

  let enabled = false, pending = null, popup = null, timer = 0, liveTimer = 0, seq = 0, blockedUntil = 0, legendEl = null;
  let opacity = typeof opacities.launches === 'number' ? opacities.launches : 0.9;
  /** @type {(() => void)[]} */ let stops = [];
  /** the windows read this session, by UTC day: { at, results, count, truncated } */
  /** @type {Map<number, any>} */ const kept = new Map();
  /** @type {Map<number, Promise<any>>} */ const inflight = new Map();
  /** what was last drawn, for the card and the legend */
  /** @type {{ pads: Map<string, any>, entry: any, t: number, live: boolean } | null} */ let shown = null;
  /** the last failure, told in the legend as well as the toast */
  let lastFail = '';

  const instant = () => IntMapTime.nowMs();
  const empty = () => ({ type: 'FeatureCollection', features: [] });
  function close() { if (popup) popup.remove(); popup = null; }

  /* ── reading LL2 ──────────────────────────────────────────────────────────────────────────── */
  async function page(/** @type {string} */ url, /** @type {number} */ scale) {
    const r = await readWithin(url, clockFor(url) * scale, undefined, { idle: true });
    if (r.ok) {
      try { return JSON.parse(r.text); } catch (e) { throw Object.assign(/** @type {any} */ (e), { reason: 'parse', status: r.status, url }); }
    }
    throw Object.assign(new Error('http ' + r.status), { reason: 'http', status: r.status, url, body: r.text });
  }
  async function read(/** @type {number} */ key) {
    /** @type {any[]} */ const results = [];
    let url = launchesUrl(key), count = 0, pages = 0, more = false;
    while (url && pages < MAX_PAGES) {
      if (!enabled) throw Object.assign(new Error('no longer wanted'), { reason: 'aborted' });
      const j = await untilObserved((scale) => page(url, scale), { base: 1500, wanted: () => enabled });
      for (const r of (j && j.results) || []) results.push(r);
      count = Number(j && j.count) || results.length; pages++;
      const next = httpsUrl(j && j.next);
      /* only ever to the host that answered: a `next` pointing elsewhere is not followed */
      url = next && new URL(next).hostname === new URL(LL2).hostname ? next : '';
      more = !!url;
    }
    return { at: Date.now(), results, count, truncated: more && results.length < count };
  }
  function windowFor(/** @type {number} */ key) {
    const have = kept.get(key);
    if (have && Date.now() - have.at < REFRESH_MS) return Promise.resolve(have);
    if (inflight.has(key)) return /** @type {Promise<any>} */ (inflight.get(key));
    if (Date.now() < blockedUntil) return Promise.reject(Object.assign(new Error('throttled'), { reason: 'http', status: 429, wait: blockedUntil - Date.now() }));
    const p = read(key).then((e) => { kept.set(key, e); while (kept.size > 24) kept.delete(/** @type {number} */ (kept.keys().next().value)); return e; })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
  }

  /* ── drawing ──────────────────────────────────────────────────────────────────────────────── */
  const circlePaint = () => ({
    'circle-radius': ['interpolate', ['linear'], ['zoom'], ...[[1, 0.75], [6, 1.1], [10, 1.5]].flatMap(([z, k]) => [z, ['*', k, ['step', ['get', 'count'], 5, 2, 7, 5, 9, 10, 11]]])],
    'circle-color': ['case', ['>', ['get', 'up'], 0], '#ff9f0a', '#8e8e93'],
    'circle-opacity': 0.95 * opacity,
    'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.2, 'circle-stroke-opacity': opacity,
    'circle-pitch-alignment': 'map',
  });
  function ensureLayers(/** @type {any} */ fc) {
    if (!GE().layers.hasSource(SRC)) GE().layers.addSource(SRC, { type: 'geojson', data: fc, attribution: 'Launch Library 2 — The Space Devs' });
    else GE().layers.setSourceData(SRC, fc);
    if (!GE().layers.has(PADS)) GE().layers.add({ id: PADS, type: 'circle', source: SRC, layout: { 'circle-sort-key': ['get', 'up'] }, paint: circlePaint() });
    if (!GE().layers.has(COUNT)) {
      GE().layers.add({ id: COUNT, type: 'symbol', source: SRC, filter: ['>', ['get', 'count'], 1],
        layout: { 'text-field': ['get', 'lbl'], 'text-font': window.IntMapMapTypography.readerFont(), 'text-size': 11, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': '#1c1c1e', 'text-opacity': opacity } });
    }
  }
  function remove() {
    close();
    for (const id of [COUNT, PADS]) { try { if (GE().layers.has(id)) GE().layers.remove(id); } catch (_) { /* gone with the style */ } }
    try { if (GE().layers.hasSource(SRC)) GE().layers.removeSource(SRC); } catch (_) { /* gone with the style */ }
  }
  function draw(/** @type {any} */ entry, /** @type {number} */ t) {
    const drawable = HOST.canDraw ? HOST.canDraw() : GE().ready();
    const pads = launchesToPads(entry.results, t);
    shown = { pads: new Map(pads.map((p) => [p.id, p])), entry, t, live: IntMapTime.isLive() };
    lastFail = '';
    if (drawable) { try { ensureLayers(padsToGeoJSON(pads)); } catch (e) { console.warn('launches draw', e); } }
    legend();
  }

  /* ── the clock ────────────────────────────────────────────────────────────────────────────── */
  function refresh() {
    if (!enabled) return Promise.resolve();
    const mine = ++seq, t = instant(), key = dayKeyOf(t);
    return windowFor(key).then((entry) => { if (enabled && mine === seq) draw(entry, t); }).catch((e) => {
      if (!enabled || mine !== seq) return;
      if (e && e.reason === 'aborted') return;
      fail(e);
    });
  }
  /** the clock moved: a window already read is redrawn at once; one that is not waits for the reader to stop moving it */
  function onClock() {
    if (!enabled) return;
    clearTimeout(timer);
    const t = instant(), have = kept.get(dayKeyOf(t));
    if (have && Date.now() - have.at < REFRESH_MS) { ++seq; draw(have, t); return; }
    timer = setTimeout(refresh, SETTLE_MS);
  }
  /* the present moves on without the clock being touched: an upcoming launch becomes a past one, and the schedule
     is asked again no sooner than REFRESH_MS */
  function keepLive() {
    if (!enabled) return;
    liveTimer = setTimeout(() => { if (IntMapTime.isLive()) refresh(); keepLive(); }, REFRESH_MS + 1000);
  }

  function fail(/** @type {any} */ e) {
    const status = e && e.status;
    let why;
    if (status === 429) {
      const s = throttleSeconds(e.body);
      if (s != null) blockedUntil = Date.now() + s * 1000;
      else if (!(e.wait > 0)) blockedUntil = Date.now() + REFRESH_MS;
      const min = Math.max(1, Math.ceil(((blockedUntil - Date.now()) || 0) / 60000));
      why = text('Launch Library 2 has reached its request limit; it can be asked again in about ' + min + ' min',
        'Launch Library 2 のリクエスト上限に達しました。約 ' + min + ' 分後に再取得できます');
    } else why = text('Launch data could not be loaded', '打ち上げデータを取得できませんでした');
    lastFail = why;
    try { satToast(why); } catch (_) { /* a toast is the reader's cue, not the layer's state */ }
    try { layerState.report(ROW, e, { told: true }); } catch (_) { /* the record is the row's own business */ }
    legend();
  }

  /* ── the legend (the shared generic legend box: title, opacity, drag, ×) ───────────────────── */
  function legend() {
    if (!legendEl) return;
    let body = legendEl.querySelector('.iml-legend');
    if (!body) { body = document.createElement('div'); body.className = 'iml-legend'; body.style.cssText = 'font-size:11px;line-height:1.5;margin-top:6px;'; const h = legendEl.querySelector('h4'); if (h) h.after(body); else legendEl.appendChild(body); }
    const dot = (/** @type {string} */ c) => '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + c + ';border:1.5px solid #fff;box-shadow:0 0 0 .5px rgba(0,0,0,.25);vertical-align:-1px;margin-right:6px"></span>';
    const n = shown ? [...shown.pads.values()].reduce((a, p) => a + p.launches.length, 0) : 0;
    const lines = [
      '<div>' + dot('#ff9f0a') + escape(text('Scheduled — after the clock', '予定 — 時計より後')) + '</div>',
      '<div>' + dot('#8e8e93') + escape(text('Launched — before the clock', '実施済み — 時計より前')) + '</div>',
      '<div style="color:var(--text-muted)">' + escape(text('A number is the count of launches from that pad.', '数字はそのパッドからの打ち上げ件数です。')) + '</div>',
    ];
    if (shown) {
      let s = text(n + ' launches at ' + shown.pads.size + ' pads, ' + PAST_DAYS + ' days before to ' + AHEAD_DAYS + ' days after the clock',
        '時計の前 ' + PAST_DAYS + ' 日〜後 ' + AHEAD_DAYS + ' 日: ' + shown.pads.size + ' か所のパッドで ' + n + ' 件');
      if (shown.entry.truncated) s += text(' (the first ' + shown.entry.results.length + ' of ' + shown.entry.count + ' that Launch Library 2 lists for the window)',
        '（Launch Library 2 がこの期間に挙げる ' + shown.entry.count + ' 件のうち先頭 ' + shown.entry.results.length + ' 件）');
      lines.push('<div style="margin-top:4px">' + escape(s) + '</div>');
      if (!shown.live) lines.push('<div style="color:var(--text-muted);margin-top:2px">' + escape(text('Each status is Launch Library 2’s record today, not what was known at that moment.', '各状態は Launch Library 2 の現在の記録で、その時点で分かっていた内容ではありません。')) + '</div>');
    } else if (!lastFail) lines.push('<div style="margin-top:4px;color:var(--text-muted)">' + escape(text('Loading launches…', '打ち上げを読み込み中…')) + '</div>');
    if (lastFail) lines.push('<div style="margin-top:4px;color:#ff453a">' + escape(lastFail) + '</div>');
    lines.push('<div style="font-size:10px;margin-top:4px;color:var(--text-muted)">Launch Library 2 · The Space Devs</div>');
    body.innerHTML = lines.join('');
  }

  /* ── the card ─────────────────────────────────────────────────────────────────────────────── */
  /** LL2 status ids → IntMap's own words; an id this table does not know shows LL2's own name, never a guess */
  const STATUS = /** @type {Record<number, [string, string]>} */ ({
    1: LA('Go for launch', '打ち上げ決定'), 2: LA('Date to be determined', '日時未定'), 3: LA('Launch successful', '成功'), 4: LA('Launch failure', '失敗'),
    5: LA('On hold', '保留'), 6: LA('In flight', '飛行中'), 7: LA('Partial failure', '一部失敗'), 8: LA('Date to be confirmed', '日時未確認'),
  });
  function when(/** @type {any} */ l) {
    const precise = !l.precision || /minute|hour/i.test(l.precision);
    const f = new Intl.DateTimeFormat(tag(), precise ? { dateStyle: 'medium', timeStyle: 'short', timeZoneName: 'short' } : { dateStyle: 'medium' });
    return f.format(new Date(l.net)) + (precise ? '' : ' (' + l.precision + ')');
  }
  function card(/** @type {any} */ pad, /** @type {number} */ t) {
    const note = (/** @type {string} */ s) => '<p style="font-size:11px;color:var(--text-muted);margin:6px 0">' + escape(s) + '</p>';
    const row = (/** @type {string} */ k, /** @type {string} */ v) => v ? '<tr><td style="color:var(--text-muted);padding-right:8px;vertical-align:top">' + escape(k) + '</td><td>' + v + '</td></tr>' : '';
    const shownN = 6;
    const items = pad.launches.slice(0, shownN).map((/** @type {any} */ l) => {
      const up = l.net > t, sp = STATUS[/** @type {number} */ (l.status.id)];
      const status = sp ? text.arr(sp) : (l.status.name || l.status.abbrev);
      const links = l.vids.slice(0, 3).map((/** @type {string} */ u, /** @type {number} */ i) => '<a href="' + window.IntMapSafe.url(u) + '" target="_blank" rel="noopener noreferrer">' + escape(text('Webcast', '配信') + (l.vids.length > 1 ? ' ' + (i + 1) : '')) + '</a>').join(' · ');
      return '<div style="padding:6px 0;border-top:1px solid var(--glass-border,rgba(128,128,128,.25))"><strong>' + escape(l.name) + '</strong>'
        + ' <span style="color:' + (up ? '#ff9f0a' : 'var(--text-muted)') + '">' + escape(up ? text('scheduled', '予定') : text('launch completed', '実施済み')) + '</span>'
        + '<table style="border-collapse:collapse;font-size:12px;margin-top:2px"><tbody>'
        + row(text('NET', '打ち上げ予定'), escape(when(l)))
        + row(text('Status', '状態'), escape(status))
        + row(text('Rocket', 'ロケット'), escape(l.rocket))
        + row(text('Operator', '運用者'), escape(l.provider))
        + row(text('Mission', 'ミッション'), escape(l.mission))
        + row(text('Orbit', '軌道'), escape(l.orbit))
        + row(text('Webcast', '配信'), links + (l.live && !links ? escape(text('live now', '配信中')) : ''))
        + '</tbody></table></div>';
    }).join('');
    const more = pad.launches.length > shownN ? note(text('+ ' + (pad.launches.length - shownN) + ' more from this pad in the window', 'このパッドからあと ' + (pad.launches.length - shownN) + ' 件があります')) : '';
    return '<div style="min-width:240px;max-width:340px;max-height:50vh;overflow:auto;padding-right:20px"><strong>' + escape(pad.name || pad.place) + '</strong>'
      + (pad.name && pad.place ? '<div style="color:var(--text-muted)">' + escape(pad.place) + '</div>' : '')
      + items + more
      + (shown && !shown.live ? note(text('Status is Launch Library 2’s record today, not what was known at the clock’s moment.', '状態は Launch Library 2 の現在の記録で、時計の時点で分かっていた内容ではありません。')) : '')
      + '<div style="font-size:10px;margin-top:6px">' + escape(text('Source', '出典')) + ': <a href="https://thespacedevs.com/llapi" target="_blank" rel="noopener noreferrer">Launch Library 2 · The Space Devs</a></div></div>';
  }
  function open(/** @type {any} */ id, /** @type {any} */ at) {
    const pad = shown && shown.pads.get(String(id));
    if (!pad || !shown) return false;
    let lng = pad.lon;
    if (at && Number.isFinite(at.lng)) { while (lng - at.lng > 180) lng -= 360; while (lng - at.lng < -180) lng += 360; }
    close();
    popup = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, maxWidth: '360px', className: 'plc-popup' })
      .setLngLat({ lng, lat: pad.lat }).setHTML(card(pad, shown.t)));
    return !!popup;
  }

  /* ── the switch ───────────────────────────────────────────────────────────────────────────── */
  function on() {
    if (enabled) return pending;
    enabled = true;
    pending = K.whenStyleReady().then(() => {
      if (!enabled) return undefined;
      const fromFeature = (/** @type {any} */ f, /** @type {any} */ e) => open(f && f.properties && f.properties.id, e && e.lngLat);
      /* the layers are made first so a reader can be registered against them; they hold an empty set until the read lands */
      try { ensureLayers(empty()); } catch (e) { console.warn('launches layers', e); }
      for (const id of [COUNT, PADS]) stops.push(window.IntMapPlaceReaders.register(id, { open: fromFeature, close }));
      try { legendEl = window._registerLayerOpacity('launches', LA('Rocket launches', 'ロケット打ち上げ'), [PADS, COUNT], ROW); } catch (_) { legendEl = null; }
      legend();
      const rebuild = () => { try { legend(); } catch (_) { /* repainted on the next move */ } };
      stops.push(IntMapTime.on(onClock), bus.on('intmap-lang', rebuild));
      /* a basemap change rebuilds the style and takes the layers with it: put them back from what is held */
      const restyle = () => { if (enabled && shown && !GE().layers.has(PADS)) draw(shown.entry, shown.t); };
      GE().events.on('styledata', restyle);
      stops.push(() => { GE().events.off('styledata', restyle); });
      keepLive();
      return refresh();
    }).catch((e) => {
      console.warn('Launches could not load', e);
      try { layerState.report(ROW, e); } catch (_) { /* the report is the row's own business */ }
    });
    return pending;
  }
  function off() {
    enabled = false; pending = null; seq++;
    clearTimeout(timer); clearTimeout(liveTimer);
    for (const stop of stops.splice(0)) { try { stop(); } catch (_) { /* already detached */ } }
    remove();
    try { window._hideGenericLegend('launches'); } catch (_) { /* no legend yet */ }
    legendEl = null; shown = null; lastFail = '';
  }

  return { rows: { [ROW]: {
    on, off,
    opacity: (/** @type {number} */ v) => {
      opacity = v;
      try {
        if (GE().layers.has(PADS)) { const p = circlePaint(); for (const k of ['circle-opacity', 'circle-stroke-opacity']) GE().layers.setPaint(PADS, k, p[k]); }
        if (GE().layers.has(COUNT)) GE().layers.setPaint(COUNT, 'text-opacity', v);
      } catch (_) { /* not drawn yet: `opacity` is read when it is */ }
    },
  } } };
}
