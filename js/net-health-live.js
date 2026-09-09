/* ============================================================================
 *  IntMap · INTERNET HEALTH — the measuring body   (#R565)
 * ----------------------------------------------------------------------------
 *  「インターネット障害検知」— IntMap がゼロから作る必要は無い。すでに観測網がある。
 *  The rows are js/net-health.js (eager, so they exist before this file does).
 *
 *  ══ WHY THERE IS A REGISTRY AND NOT A FUNCTION PER SOURCE ═══════════════════
 *  Five services measure this and they disagree about what they can answer, what
 *  they charge, whether a browser may talk to them at all, and what licence the
 *  answer carries. A file with `if (source === 'cloudflare')` in it is the shape
 *  .agents/rules/no-ad-hoc-hardcoding.md forbids, and it is also wrong here for a
 *  concrete reason: WHICH SOURCES ARE USABLE IS NOT A CODING QUESTION, it is a
 *  question about keys and licences that changes without this file changing.
 *  So every source is one entry in PROVIDERS declaring what it yields, how it is
 *  reached, and under what terms — and nothing below PROVIDERS names a source.
 *  Adding Cloudflare Radar or OONI later is an entry plus a relay, not an edit.
 *
 *  ══ WHAT WAS MEASURED, 2026-09-09, FROM THE PRODUCTION ORIGIN ══════════════
 *  · IODA (Georgia Tech) — no key, CORS reflects the origin, the WHOLE WORLD in
 *    14 kB, freshness 18 minutes. Country codes are ISO 3166-1 alpha-2, which is
 *    what js/countries-ui.js already keys Natural Earth by. SHIPPED.
 *  · RIPE Atlas — no key, CORS, probes carry GeoJSON Point coordinates and their
 *    own status name. SHIPPED.
 *  · RIPEstat — no key, CORS, but data lags ~3.5 h and the terms forbid
 *    re-distribution, so it is read ON DEMAND for one country and never mirrored.
 *  · Cloudflare Radar — token required AND **no `access-control-allow-origin` at
 *    all**, proven on an endpoint that answers 200 without a token. A token
 *    changes authorisation; it does not add a header that is missing. A browser
 *    therefore cannot reach it with or without a key: it needs an Edge Function.
 *    Its data is CC BY-NC 4.0. NOT SHIPPED — see docs/INTERNET-HEALTH.md.
 *  · OONI — no key, but CORS is whitelisted to `*.ooni.org` / `*.ooni.io`
 *    (measured: our origin is refused). CC BY-NC-SA 4.0. NOT SHIPPED, same file.
 *  · BGPView — `bgpview.io` has no A record at all (NXDOMAIN). The upstream is
 *    gone, which is #R514's shape, and it is recorded so nobody re-discovers it.
 *
 *  ══ ⚠⚠ THE TRAP: A TYPO AND A CALM PLANET LOOK IDENTICAL ═══════════════════
 *  MEASURED: `/outages/alerts?entityType=nonsense` answers **HTTP 200, error
 *  null, data []** — exactly what a world with no outages in it answers. That is
 *  #R536 and #R514 again: a question nothing could answer, reported as an answer.
 *  So a scope is USED only after `/entities/query` for that same scope returns a
 *  non-empty roster. An entityType with no entities does not exist, and the layer
 *  says `unsupported_scope` rather than drawing an all-clear it never measured.
 *
 *  ══ THE SIGNALS ARE NOT A LIST IN THIS FILE ════════════════════════════════
 *  IODA measures through several independent instruments (BGP visibility, active
 *  probing of /24s, a network telescope, Google's own traffic series). Their
 *  names arrive in the data — as the `datasource` of an alert — so the selector
 *  is BUILT FROM THE RESPONSE, the way js/shakemap.js takes its metric roster out
 *  of the USGS product. A signal added upstream appears here; one withdrawn
 *  disappears. There is nothing to edit.
 *
 *  ══ SCOPE → GEOMETRY, AND WHAT IS REFUSED ══════════════════════════════════
 *  Countries: the Natural Earth polygons js/countries-ui.js already holds, keyed
 *  by ISO_A2_EH / ISO_A2 — the same ladder that file uses.
 *  Regions: IODA's region entities are NETACUITY units carrying a name and a
 *  country, and `data/admin1-world.json.gz` is the first-level index this
 *  repository already ships. So this file asks js/atlas-admin1.js — it does NOT
 *  open the file a third time (js/world-packs.js and js/atlas-admin1.js are the
 *  two that do, and a third reader is a third opinion).
 *  ⚠ MEASURED join rate 1,958 / 1,999 = 97.9 %. The 41 that miss are things that
 *  ARE NOT first-level units — villages in Anguilla, municipalities of Åland,
 *  「[Invalid Region (54)]」 placeholders — so they are REFUSED and COUNTED, not
 *  fuzzily attached to whatever polygon is nearest. The legend says how many.
 * ==========================================================================*/
import { makeAtlasAdmin1 } from './atlas-admin1.js';
import { everyTick, stopTick } from './runtime.js';

window.IntMapModules = window.IntMapModules || {};
window.IntMapModules.netHealthLive = function (HOST) {
  const GE = () => window.IntMapGeoEngine;
  const L = window.IntMapLang.pick(() => HOST.lang);
  /* ⚠ `pickArgs()` BUILDS A NAME TABLE (an array); it does not RESOLVE one. Calling .replace()
     on its return value throws — and because every use of it here was the LAST statement of its
     block, the legend rendered normally with its coverage line silently missing. Found only by
     running the built app. Everything that has to come out as a STRING therefore calls
     `window.IntMapLang.t` IN FULL below: a one-line alias for it is what #R548 measured hiding a
     whole file's strings from the i18n audit, and the name TABLE the legend registers is
     nameTable(), which is the thing pickArgs() would have been for. */
  const ROW = (id) => (window.IntMapNetHealth ? window.IntMapNetHealth.label(id) : id);

  /* ── the sources ─────────────────────────────────────────────────────────────────────────────
     ⚠ `licence` and `host` are NOT decoration. js/legal-text.js §4 tells the reader which hosts
     their browser contacts and js/reference-data.js credits the source; tests/r565-checks.test.mjs
     holds this table against both, so a provider cannot be added here and stay uncredited.
     `transport:'direct'` means the reader's own browser fetches it and IntMap stores nothing —
     which is also what makes RIPE's no-redistribution term satisfiable. */
  const PROVIDERS = [
    { id: 'ioda', host: 'api.ioda.inetintel.cc.gatech.edu', transport: 'direct', key: false,
      yields: ['outage'],
      name: () => 'IODA — Internet Outage Detection and Analysis (Georgia Tech)',
      licence: 'Copyright (c) Georgia Tech Research Corporation',
      url: 'https://ioda.inetintel.cc.gatech.edu/' },
    { id: 'ripeatlas', host: 'atlas.ripe.net', transport: 'direct', key: false,
      yields: ['probe'],
      name: () => 'RIPE Atlas', licence: 'RIPE NCC service terms - read live, never mirrored',
      url: 'https://atlas.ripe.net/' },
    { id: 'ripestat', host: 'stat.ripe.net', transport: 'direct', key: false,
      yields: ['routing'],
      name: () => 'RIPEstat (RIPE NCC)', licence: 'RIPE NCC service terms - read live, never mirrored',
      url: 'https://stat.ripe.net/' },
  ];
  /* what each provider last actually did, so 「訊けていない」 and 「訊いたら平穏だった」 never look the
     same (#R499, #R504). Every fetch writes here whether it succeeded or not. */
  const STATUS = Object.create(null);
  PROVIDERS.forEach((p) => { STATUS[p.id] = { at: 0, ok: null, why: '', n: 0 }; });
  function mark(id, ok, why, n) { STATUS[id] = { at: Date.now(), ok: ok, why: why || '', n: n || 0 }; }

  const IODA = 'https://api.ioda.inetintel.cc.gatech.edu/v2';
  const WINDOW_S = 3 * 3600;          /* how far back an "is it down NOW" question looks. IODA emits
                                         alerts per five-minute bin; three hours is long enough that
                                         an outage which began before the tab opened is still on the
                                         map, and short enough that yesterday is not. */
  const REFRESH_MS = 5 * 60 * 1000;   /* the feed's measured freshness is ~18 min (2026-09-09), so
                                         polling faster asks the same question twice for one answer.
                                         Expires if IODA's own pipeline latency changes. */

  async function getJSON(url, provider) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(provider + ' ' + r.status);
    return r.json();
  }

  /* ── is this scope one the service actually has? ─────────────────────────────────────────────
     The guard the header describes. Cached per scope for the session: a roster does not appear
     mid-session, and asking again on every refresh would spend a request to learn nothing. */
  const SCOPE_OK = Object.create(null);
  async function scopeExists(kind) {
    if (kind in SCOPE_OK) return SCOPE_OK[kind];
    try {
      const j = await getJSON(IODA + '/entities/query?entityType=' + encodeURIComponent(kind) + '&limit=1', 'ioda');
      const ok = !!(j && Array.isArray(j.data) && j.data.length);
      SCOPE_OK[kind] = ok; return ok;
    } catch (_) { SCOPE_OK[kind] = null; return null; }   /* null = could not ask, which is not "no" */
  }

  /* ── the observations ────────────────────────────────────────────────────────────────────────
     ⚠ THE COUNTRY OF A REGION COMES FROM THE ENTITY, NOT FROM A POSITION IN A STRING when the
     entity says it. The dotted identifier is the fallback, and a shape it cannot read is refused
     rather than guessed — an outage attached to the wrong country is worse than one not drawn. */
  function ccOf(ent) {
    const a = (ent && ent.attrs) || {};
    if (/^[A-Za-z]{2}$/.test(String(a.country_code || ''))) return String(a.country_code).toUpperCase();
    const seg = String(a.fqid || '').split('.').filter((s) => /^[A-Za-z]{2}$/.test(s));
    return seg.length ? seg[seg.length - 1].toUpperCase() : '';
  }
  /* How far below its own recent normal the service says this reading is. Both numbers are IODA's:
     nothing here decides what an outage IS — the service decides that by emitting an alert at all
     — this only shades how deep the one it emitted goes. */
  /* ⚠ `+null` IS 0 AND `isFinite(0)` IS TRUE. Coercing first and testing afterwards reports a
     reading whose value is MISSING as a value of zero — i.e. as a total outage, at the darkest end
     of the ramp, for an entity the source said nothing numeric about. That is #R543's shape
     (`isFinite(+v)` does not ask whether v is a number), and it is why the coercion is refused
     BEFORE it happens rather than inspected after. */
  function num(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    if (typeof x === 'string' && x.trim() !== '' && isFinite(+x)) return +x;
    return null;
  }
  function deficit(value, base) {
    const v = num(value), b = num(base);
    if (v === null || b === null || b <= 0) return null;
    return Math.max(0, Math.min(1, 1 - v / b));
  }

  async function fetchOutages(kind) {
    const exists = await scopeExists(kind);
    if (exists === false) { mark('ioda', false, 'unsupported_scope', 0); return { obs: [], scopeOk: false }; }
    const until = Math.floor(Date.now() / 1000), from = until - WINDOW_S;
    const q = '?from=' + from + '&until=' + until + '&entityType=' + encodeURIComponent(kind) + '&limit=1000';
    let j;
    try { j = await getJSON(IODA + '/outages/alerts' + q, 'ioda'); }
    catch (_) { mark('ioda', false, 'unreachable', 0); return { obs: [], scopeOk: exists, error: 'unreachable' }; }
    const obs = [];
    ((j && j.data) || []).forEach((a) => {
      const e = a.entity || {};
      if (String(e.type || '') !== kind) return;   /* the answer must be about what was asked */
      const code = String(e.code == null ? '' : e.code); if (!code) return;
      obs.push({
        provider: 'ioda', scope: kind, code: code, name: String(e.name || code), cc: ccOf(e),
        datasource: String(a.datasource || ''), level: String(a.level || ''),
        at: +a.time || 0, value: +a.value, base: +a.historyValue,
        deficit: deficit(a.value, a.historyValue), method: String(a.method || ''),
      });
    });
    mark('ioda', true, '', obs.length);
    return { obs: obs, scopeOk: exists };
  }

  /* Every distinct instrument present in what the service just returned — the roster, discovered.
     ⚠ NOT A LIST IN THIS FILE. See the header. */
  function signalsOf(obs) {
    const s = [];
    (obs || []).forEach((o) => { if (o && o.datasource && s.indexOf(o.datasource) < 0) s.push(o.datasource); });
    return s.sort();
  }

  /* ── hardware that is supposed to answer and is not ──────────────────────────────────────────
     ⚠ THE STATUS WORD IS TAKEN FROM THE PAYLOAD, not asserted from the number we filtered by. If
     the service renumbers its statuses this layer prints what it actually received instead of
     painting 「disconnected」 over something else. */
  async function fetchProbes() {
    let j;
    try { j = await getJSON('https://atlas.ripe.net/api/v2/probes/?status=2&is_public=true&page_size=500&format=json', 'ripeatlas'); }
    catch (_) { mark('ripeatlas', false, 'unreachable', 0); return { pts: [], total: 0, statusName: '' }; }
    const pts = [], names = Object.create(null);
    ((j && j.results) || []).forEach((p) => {
      const g = p && p.geometry;
      if (!g || g.type !== 'Point' || !Array.isArray(g.coordinates)) return;
      const st = (p.status && p.status.name) ? String(p.status.name) : '';
      names[st] = (names[st] || 0) + 1;
      pts.push({ id: p.id, lng: +g.coordinates[0], lat: +g.coordinates[1], cc: String(p.country_code || ''), st: st, since: (p.status && p.status.since) || '' });
    });
    const kinds = Object.keys(names);
    mark('ripeatlas', true, '', pts.length);
    return { pts: pts, total: (+(j && j.count) || pts.length), statusName: kinds.join(' / ') };
  }

  /* ── one country's routing, on demand, never stored ──────────────────────────────────────────
     RIPE's terms forbid re-distributing their data, so this is fetched by the reader's own browser
     at the moment they ask for that country and is not written anywhere. */
  async function routingFor(cc) {
    try {
      const j = await getJSON('https://stat.ripe.net/data/country-resource-stats/data.json?resource=' + encodeURIComponent(cc), 'ripestat');
      const rows = (j && j.data && j.data.stats) || [];
      const last = rows.length ? rows[rows.length - 1] : null;
      if (!last) { mark('ripestat', true, 'empty', 0); return null; }
      mark('ripestat', true, '', 1);
      return { asns: +last.asns_ris || 0, v4: +last.v4_prefixes_ris || 0, v6: +last.v6_prefixes_ris || 0, at: String(last.stats_date || '').slice(0, 10) };
    } catch (_) { mark('ripestat', false, 'unreachable', 0); return null; }
  }

  /* ── scope → geometry ──────────────────────────────────────────────────────────────────────── */
  const A1 = (function () { try { return window.IntMapAtlasAdmin1 || makeAtlasAdmin1({}); } catch (_) { return null; } })();
  function countryGeo() { try { return window.countryGeo || (HOST && HOST.countryGeo) || null; } catch (_) { return null; } }
  /* the ladder js/countries-ui.js uses, and for its reason: `-99` is Natural Earth's "no code" */
  function iso2(p) {
    p = p || {};
    const a = p.ISO_A2_EH, b = p.ISO_A2;
    const v = (a && a !== '-99') ? a : b;
    return (v && v !== '-99') ? String(v).toUpperCase() : '';
  }

  /* One shape per entity, carrying the DEEPEST reading that entity has right now — several
     instruments can alert on the same country in the same window and a map has one colour. */
  function worstBy(obs, keyOf) {
    const w = Object.create(null);
    (obs || []).forEach((o) => {
      const k = keyOf(o); if (!k) return;
      if (o.deficit == null) return;
      if (!(k in w) || o.deficit > w[k].deficit) w[k] = o;
    });
    return w;
  }

  function geomForCountries(obs) {
    const geo = countryGeo();
    const worst = worstBy(obs, (o) => (o.cc || o.code || '').toUpperCase());
    const asked = Object.keys(worst).length;
    if (!geo || !geo.features) return { feats: [], missed: asked };
    const feats = [], used = Object.create(null);
    geo.features.forEach((f) => {
      const k = iso2(f.properties); if (!k || !worst[k] || used[k]) return;
      used[k] = 1;
      const o = worst[k];
      feats.push({ type: 'Feature', geometry: f.geometry, properties: { code: k, nm: o.name, v: o.deficit, ds: o.datasource, lvl: o.level } });
    });
    return { feats: feats, missed: asked - Object.keys(used).length };
  }

  async function geomForRegions(obs) {
    const worst = worstBy(obs, (o) => o.code);
    const keys = Object.keys(worst);
    if (!keys.length) return { feats: [], missed: 0 };
    if (!A1) return { feats: [], missed: keys.length };
    const list = keys.map((k) => ({ name: worst[k].name, countryCode: worst[k].cc, code: k }));
    let res;
    try { res = await A1.resolveMany(list, {}); } catch (_) { return { feats: [], missed: keys.length }; }
    const feats = [];
    ((res && res.hits) || []).forEach((h) => {
      /* matched back BY THE NAME THAT WAS ASKED, not by position: js/atlas-admin1.js returns hits in
         the order asked but drops the misses, so the i-th hit is not the i-th question. */
      const src = list.find((x) => x.name === h.asked); if (!src) return;
      const o = worst[src.code]; if (!o || !h.geo) return;
      feats.push({ type: 'Feature', geometry: h.geo, properties: { code: o.code, nm: h.canonicalName || o.name, v: o.deficit, ds: o.datasource, lvl: o.level } });
    });
    return { feats: feats, missed: keys.length - feats.length };
  }

  /* ── painting ──────────────────────────────────────────────────────────────────────────────── */
  const SRC = 'nh-src', FILL = 'nh-fill', LINE = 'nh-line';
  const PSRC = 'nr-src', PPT = 'nr-pt';
  const RAMP = [0, '#f0c419', 0.35, '#e08a2e', 0.7, '#c8483f', 1, '#7e1d19'];

  /* ⚠ «THE STYLE IS NOT READY» IS NOT «THERE IS NOTHING TO DRAW» — the lesson js/war-layer.js
     records at its `whenDrawable`, and the exact failure this file shipped for one build: the row was
     switched on during a cold load, `addSource` threw «Style is not done loading.», the catch
     swallowed it and nothing ever asked again. So: ask again shortly, and keep ONE retry outstanding.
     ⚠ A POLL, NOT `once('idle')` — a map that is ALREADY idle never fires idle again, so the cheapest
     case to satisfy is the one an idle listener would wait for for ever. */
  const canDraw = () => { try { return !!HOST.canDraw(); } catch (_) { try { return !!GE().ready(); } catch (__) { return false; } } };
  let _pending = null, _timer2 = null, _tries = 0;
  const RETRY_MS = 300, RETRY_MAX = 60;   /* 18 s: longer than a cold style load measured on this app,
                                             and short enough that a dead renderer stops being asked.
                                             The 5-minute refresh re-tries after that in any case. */
  /* ⚠ AND THE PREDICATE IS NOT THE ANSWER EITHER. `ready()` was still false on this app minutes
     after a load that had visibly finished — MapLibre's `isStyleLoaded()` stays false while ANY
     source is still settling — so a retry that only watched the predicate would have given up on a
     map that was perfectly able to draw. What decides is whether the paint ACTUALLY SUCCEEDED, which
     is why `ok()` is asked after every attempt and the predicate only gates the first one. */
  function whenDrawable(fn, ok) {
    const attempt = () => { try { fn(); } catch (_) { } return ok ? !!ok() : true; };
    if (canDraw() && attempt()) return true;
    _pending = attempt; _tries = 0;
    if (_timer2) return false;
    const tick = () => {
      _timer2 = null;
      const f = _pending; if (!f) return;
      /* ⚠ the RETRY does not consult the predicate — see above: a map whose `ready()` never turns
         true would never be attempted again, which is the state this app was actually in. */
      if (f()) { _pending = null; return; }
      if (++_tries > RETRY_MAX) { _pending = null; return; }
      _timer2 = setTimeout(tick, RETRY_MS);
    };
    _timer2 = setTimeout(tick, RETRY_MS);
    return false;
  }

  const S = { nethlth: false, netreach: false, scope: 'country', signal: '', obs: [], sig: [], missed: 0, probes: null, painted: 0, paintError: '' };
  let timer = null;

  const fc = (feats) => ({ type: 'FeatureCollection', features: feats });

  function paintOutages(feats) {
    const data = fc(feats);
    try {
      if (GE().layers.hasSource(SRC)) GE().layers.setSourceData(SRC, data);
      else {
        GE().layers.addSource(SRC, { type: 'geojson', data: data });
        GE().layers.add({ id: FILL, type: 'fill', source: SRC, paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'v']].concat(RAMP), 'fill-opacity': 0.55 } });
        GE().layers.add({ id: LINE, type: 'line', source: SRC, paint: { 'line-color': 'rgba(0,0,0,0.28)', 'line-width': 0.5 } });
        wireClick();
      }
      /* re-asserted rather than only set at creation, for #R289's reason: the source outlives any
         one switch-on, and the branch above paints only the first time. */
      if (GE().layers.has(FILL)) GE().layers.setPaint(FILL, 'fill-color', ['interpolate', ['linear'], ['get', 'v']].concat(RAMP));
      [FILL, LINE].forEach((x) => { if (GE().layers.has(x)) GE().layers.setLayout(x, 'visibility', S.nethlth ? 'visible' : 'none'); });
      S.painted = GE().layers.has(FILL) ? feats.length : 0;
      S.paintError = '';
    } catch (e) {
      /* ⚠ `painted` USED TO BE ASSIGNED AFTER THIS CATCH, so a paint that threw on its first line
         still reported every shape as drawn — and that is exactly what happened: the click wiring
         called a method the engine does not have, the whole block threw, not one layer was created,
         and the legend said 「5 drawn」 over an empty map. A count of what was drawn has to be taken
         from the map, not from the intention. */
      S.painted = 0;
      S.paintError = (e && e.message) || 'paint_failed';
    }
  }

  function paintProbes(pts) {
    const feats = (pts || []).map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, cc: p.cc, st: p.st, since: p.since } }));
    try {
      if (GE().layers.hasSource(PSRC)) GE().layers.setSourceData(PSRC, fc(feats));
      else {
        GE().layers.addSource(PSRC, { type: 'geojson', data: fc(feats) });
        GE().layers.add({ id: PPT, type: 'circle', source: PSRC, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.4, 8, 6], 'circle-color': '#c8483f', 'circle-opacity': 0.75, 'circle-stroke-width': 0.6, 'circle-stroke-color': 'rgba(0,0,0,0.35)' } });
      }
      if (GE().layers.has(PPT)) GE().layers.setLayout(PPT, 'visibility', S.netreach ? 'visible' : 'none');
    } catch (_) { }
  }

  /* ⚠ THE DOOR IS `events.onLayer` AND `ui.popup`, NOT `layers.onClick`. There is no `onClick` on
     the layer facade and no `popup` on the engine root — the first build of this file called both,
     the whole paint block threw on the way past them, and `S.painted` was assigned AFTER the try,
     so the layer reported five shapes drawn with not one layer created. Measured in the browser:
     `GE().layers.has('nh-fill')` was false while the legend read 「5 drawn」. */
  function wireClick() {
    try {
      GE().events.onLayer('mouseenter', FILL, () => { try { GE().render.canvas().style.cursor = 'pointer'; } catch (_) { } });
      GE().events.onLayer('mouseleave', FILL, () => { try { GE().render.canvas().style.cursor = ''; } catch (_) { } });
      GE().events.onLayer('click', FILL, async (ev) => {
        const f = ev && ev.features && ev.features[0]; if (!f) return;
        const p = f.properties || {};
        const cc = String(p.code || '');
        const head = '<div style="font-weight:600;margin-bottom:3px">' + HOST.escapeHtml(String(p.nm || cc)) + '</div>';
        const body = '<div style="font-size:11px">' + HOST.escapeHtml(
          window.IntMapLang.t(HOST.lang, '{p}% below its own recent normal — {s} ({l})', '通常水準より {p}% 低下 — {s}（{l}）',
            '{p} % unter dem eigenen jüngsten Normalwert — {s} ({l})', 'На {p}% ниже собственной недавней нормы — {s} ({l})',
            '{p} % por debajo de su nivel normal reciente — {s} ({l})')
            .replace('{p}', String(Math.round((+p.v || 0) * 100))).replace('{s}', String(p.ds || '')).replace('{l}', String(p.lvl || ''))) + '</div>';
        let pop = null;
        try { pop = GE().ui.attach(GE().ui.popup({ closeButton: true, closeOnClick: true, className: 'plc-popup', maxWidth: '280px' }).setLngLat(ev.lngLat).setHTML(head + body)); } catch (_) { }
        /* the routing detail is one more request, so it is fetched only once the reader has asked
           about this country by clicking it — and it lands in the popup that is already open */
        if (/^[A-Z]{2}$/.test(cc)) {
          const r = await routingFor(cc);
          if (r && pop) {
            const extra = '<div style="margin-top:5px;font-size:11px;opacity:.85">' + HOST.escapeHtml(
              window.IntMapLang.t(HOST.lang, '{a} ASNs, {b} IPv4 and {c} IPv6 prefixes visible in RIPE routing data ({d})',
                'RIPE の経路データで見えている ASN {a}・IPv4 プレフィクス {b}・IPv6 プレフィクス {c}（{d}）',
                '{a} ASNs, {b} IPv4- und {c} IPv6-Präfixe in RIPE-Routingdaten sichtbar ({d})',
                'В данных маршрутизации RIPE видно {a} ASN, {b} префиксов IPv4 и {c} префиксов IPv6 ({d})',
                '{a} ASN, {b} prefijos IPv4 y {c} prefijos IPv6 visibles en los datos de enrutamiento de RIPE ({d})')
                .replace('{a}', String(r.asns)).replace('{b}', String(r.v4)).replace('{c}', String(r.v6)).replace('{d}', r.at)) + '</div>';
            try { pop.setHTML(head + body + extra); } catch (_) { }
          }
        }
      });
    } catch (_) { }
  }

  /* ── the legend ────────────────────────────────────────────────────────────────────────────── */
  function nameTable(id) { const n = ROW(id); return [n, n, n, n, n]; }

  function legend() {
    let el = null;
    try { el = window._registerLayerOpacity && window._registerLayerOpacity('nethlth', nameTable('nethlth'), [FILL, LINE], 'dl-nethlth'); } catch (_) { }
    if (!el) return;
    if (!S.nethlth) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    /* ⚠ #R549: ensureGenericLegend keeps the name it was FIRST given, so a heading that has to
       follow anything is written here, by the caller, exactly as js/shakemap.js does. */
    try { const h = el.querySelector('h4'); if (h) h.textContent = ROW('nethlth'); } catch (_) { }
    let box = el.querySelector('.nh-box');
    if (!box) {
      box = document.createElement('div'); box.className = 'nh-box'; box.style.cssText = 'margin-top:6px;font-size:11px;';
      box.innerHTML = '<div class="nh-scope" style="display:flex;gap:5px;margin-bottom:6px;"></div>'
        + '<select class="nh-sig" style="width:100%;font-size:11px;padding:3px 4px;border-radius:7px;"></select>'
        + '<div class="nh-key" style="margin-top:6px;"></div>'
        + '<div class="nh-cov" style="margin-top:5px;font-size:10px;color:var(--text-muted);"></div>';
      el.appendChild(box);
      /* built once and only its selected state re-set, for the reason js/wb-layers.js gives: this
         runs again on every repaint, and rebuilding a control moves it under the finger on it. */
      box.querySelector('.nh-scope').addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-s]'); if (!b) return;
        S.scope = b.getAttribute('data-s'); refresh();
      });
      box.querySelector('.nh-sig').addEventListener('change', (ev) => { S.signal = ev.target.value; render(); });
    }
    const scopes = [['country', L('Country', '国', 'Land', 'Страна', 'País')], ['region', L('Region', '地域', 'Region', 'Регион', 'Región')]];
    box.querySelector('.nh-scope').innerHTML = scopes.map((s) => '<button type="button" data-s="' + s[0]
      + '" style="flex:1;border:1px solid rgba(128,128,128,0.3);border-radius:7px;padding:4px 6px;font-size:10.5px;font-weight:600;cursor:pointer;'
      + (S.scope === s[0] ? 'background:var(--accent,#3b7ddd);color:#fff;' : '') + '">' + HOST.escapeHtml(s[1]) + '</button>').join('');
    const sel = box.querySelector('.nh-sig');
    const opts = [['', L('All signals', 'すべての信号', 'Alle Signale', 'Все сигналы', 'Todas las señales')]].concat(S.sig.map((s) => [s, s]));
    sel.innerHTML = opts.map((o) => '<option value="' + HOST.escapeHtml(o[0]) + '">' + HOST.escapeHtml(o[1]) + '</option>').join('');
    sel.value = S.signal;
    box.querySelector('.nh-key').innerHTML = '<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#f0c419,#e08a2e,#c8483f,#7e1d19)"></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:9.5px;color:var(--text-muted);margin-top:2px"><span>0%</span><span>'
      + HOST.escapeHtml(L('below its own recent normal', '通常水準からの低下', 'unter dem eigenen Normalwert', 'ниже собственной нормы', 'por debajo de su nivel normal'))
      + '</span><span>100%</span></div>';
    box.querySelector('.nh-cov').textContent = coverageLine();
  }

  /* ⚠ WHAT THE READER IS TOLD INCLUDES THE PART THAT WAS NOT MEASURED. A layer that draws six
     shapes and says nothing else is indistinguishable from one that never managed to ask (#R499,
     #R531) — and on this subject the two readings are opposite. So: how many the source reported,
     how many could be placed, and, when it could not be reached at all, THAT, in those words. */
  /* one sentence, said by both legends — the same words for the same fact (this file had two
     copies of it, which is the shape CONSTITUTION §1 records as breaking by halves) */
  function unreachableLine() {
    return L('The source could not be reached — this is not an all-clear', '情報源に到達できませんでした（障害が無いという意味ではありません）', 'Die Quelle war nicht erreichbar — das ist keine Entwarnung', 'Источник недоступен — это не значит, что сбоев нет', 'No se pudo contactar con la fuente: esto no significa que no haya cortes');
  }

  function coverageLine() {
    /* ⚠ FIRST, because a map that could not draw is a fact about the map and not about the feed:
       asking the provider's status first meant a drawing failure was invisible whenever the provider
       had not been asked yet — which is precisely the state the browser was in when it happened. */
    if (S.paintError) return L('The readings arrived but the map could not draw them', '観測値は届きましたが地図に描画できませんでした', 'Die Messwerte kamen an, konnten aber nicht gezeichnet werden', 'Данные получены, но карта не смогла их отобразить', 'Se recibieron las lecturas, pero el mapa no pudo dibujarlas');
    const st = STATUS.ioda;
    if (st.ok === false) {
      return st.why === 'unsupported_scope'
        ? L('This source does not publish that scope', 'この情報源はこの範囲を公開していません', 'Diese Quelle veröffentlicht diesen Bereich nicht', 'Этот источник не публикует такой охват', 'Esta fuente no publica ese ámbito')
        : unreachableLine();
    }
    if (st.ok === null) return '';
    if (!S.obs.length) return L('No outage alerts in the last three hours', '直近3時間の障害アラートはありません', 'Keine Ausfallwarnungen in den letzten drei Stunden', 'За последние три часа предупреждений о сбоях нет', 'Sin alertas de corte en las últimas tres horas');
    return window.IntMapLang.t(HOST.lang, '{a} alerts, {b} drawn, {c} not placed', 'アラート {a} 件／描画 {b} 件／配置できず {c} 件',
      '{a} Warnungen, {b} gezeichnet, {c} nicht verortet', 'Предупреждений {a}, показано {b}, не размещено {c}',
      '{a} alertas, {b} dibujadas, {c} sin ubicar')
      .replace('{a}', String(S.obs.length)).replace('{b}', String(S.painted)).replace('{c}', String(S.missed));
  }

  function probeLegend() {
    let el = null;
    try { el = window._registerLayerOpacity && window._registerLayerOpacity('netreach', nameTable('netreach'), [PPT], 'dl-netreach'); } catch (_) { }
    if (!el) return;
    if (!S.netreach) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    try { const h = el.querySelector('h4'); if (h) h.textContent = ROW('netreach'); } catch (_) { }
    let d = el.querySelector('.nr-cov');
    if (!d) { d = document.createElement('div'); d.className = 'nr-cov'; d.style.cssText = 'margin-top:6px;font-size:10.5px;color:var(--text-muted);'; el.appendChild(d); }
    if (STATUS.ripeatlas.ok === false) {
      d.textContent = unreachableLine();
      return;
    }
    d.textContent = probeLine();
  }

  /* the word for what these dots ARE comes out of the payload, not out of this file */
  function probeLine() {
    if (STATUS.ripeatlas.ok === false) return unreachableLine();
    const p = S.probes; if (!p) return '';
    return window.IntMapLang.t(HOST.lang, 'showing {n} of {t} probes that report «{s}»', '«{s}» を報告しているプローブ {t} 台のうち {n} 台を表示',
      'zeige {n} von {t} Sonden, die «{s}» melden', 'показано {n} из {t} зондов, сообщающих «{s}»', 'mostrando {n} de {t} sondas que informan «{s}»')
      .replace('{n}', String(p.pts.length)).replace('{t}', String(p.total)).replace('{s}', p.statusName || '?');
  }

  /* ── the loop ──────────────────────────────────────────────────────────────────────────────── */
  async function render() {
    const use = S.signal ? S.obs.filter((o) => o.datasource === S.signal) : S.obs;
    const g = (S.scope === 'region') ? await geomForRegions(use) : geomForCountries(use);
    S.missed = g.missed;
    whenDrawable(() => { paintOutages(g.feats); legend(); }, () => !S.paintError);
    legend();
  }

  async function refresh() {
    if (!S.nethlth) return;
    const r = await fetchOutages(S.scope);
    S.obs = r.obs; S.sig = signalsOf(r.obs);
    /* a signal the source has stopped publishing is not a filter — it is an empty map */
    if (S.signal && S.sig.indexOf(S.signal) < 0) S.signal = '';
    await render();
  }

  /* ⚠ THE WHEEL, NOT A RAW INTERVAL (tests/r408 ②a). A bare setInterval keeps polling two feeds
     every five minutes in a tab nobody is looking at — and this one has no reason to: a reading
     missed while the tab was hidden is replaced by the next one the moment the tab is visible
     again, which is exactly the case js/runtime.js's default (pause when hidden) is for. */
  function schedule() {
    if (timer) { stopTick(timer); timer = null; }
    if (!S.nethlth && !S.netreach) return;
    timer = everyTick('net-health:refresh', REFRESH_MS, () => {
      if (S.nethlth) refresh();
      if (S.netreach) fetchProbes().then((p) => { S.probes = p; paintProbes(p.pts); probeLegend(); });
    }, REFRESH_MS);
  }

  /* ── the doors ─────────────────────────────────────────────────────────────────────────────── */
  async function toggle(id, want) {
    want = !!want;
    if (id === 'nethlth') {
      S.nethlth = want;
      if (want) await refresh(); else { paintOutages([]); legend(); }
    } else if (id === 'netreach') {
      S.netreach = want;
      if (want) { const p = await fetchProbes(); S.probes = p; whenDrawable(() => { paintProbes(p.pts); probeLegend(); }, () => { try { return GE().layers.has(PPT); } catch (_) { return false; } }); }
      else paintProbes([]);
      probeLegend();
    } else return false;
    if (!want) { try { window._hideGenericLegend && window._hideGenericLegend(id); } catch (_) { } }
    schedule();
    return want;
  }

  /* ⚠ THE READING IS NOT THE LAYER. `report` answers 「イランのインターネットは落ちているか」 with what
     was measured — for one place or for the whole planet — WITHOUT switching anything on, because a
     question is not a request to redraw the map. */
  async function report(params) {
    const p = params || {};
    /* ⚠ AN UNRECOGNISED SCOPE IS ASKED ABOUT, NOT SUBSTITUTED. Coercing anything that is not
       'region' to 'country' answered a question nobody asked — 'asn' would have come back as a list
       of countries with `scope_supported: true` on it. The scope the caller named is handed to the
       same roster guard the layer uses, so an unknown one is reported as unsupported. */
    const kind = String(p.scope == null ? 'country' : p.scope).trim() || 'country';
    const r = await fetchOutages(kind);
    const want = String(p.country || p.place || p.code || '').trim().toUpperCase();
    let obs = r.obs;
    if (want) obs = obs.filter((o) => String(o.cc || '').toUpperCase() === want || String(o.code).toUpperCase() === want || String(o.name).toUpperCase() === want);
    const out = {
      scope: kind, asked: want || null, window_seconds: WINDOW_S,
      scope_supported: r.scopeOk,
      signals: signalsOf(r.obs),
      observations: obs.map((o) => ({ code: o.code, name: o.name, country: o.cc, signal: o.datasource, level: o.level, at: o.at, deficit: o.deficit })),
      /* ⚠ `sources` TRAVELS WITH THE ANSWER. An answer about whether a country is offline that does
         not say who measured it — and whether the other instruments could be asked at all — is the
         thing #R499 and #R504 both had to go back and add. */
      sources: PROVIDERS.map((x) => ({ id: x.id, name: x.name(), licence: x.licence, url: x.url, last: STATUS[x.id] })),
    };
    if (want && /^[A-Z]{2}$/.test(want)) out.routing = await routingFor(want);
    return out;
  }

  const API = {
    toggle: toggle,
    isOn: (id) => (id === 'netreach' ? S.netreach : S.nethlth),
    state: () => ({ loaded: true, rows: { nethlth: S.nethlth, netreach: S.netreach }, scope: S.scope, signal: S.signal, painted: S.painted, paintError: S.paintError, missed: S.missed, providers: PROVIDERS.map((p) => p.id) }),
    signals: () => S.sig.slice(),
    providers: () => PROVIDERS.map((p) => ({ id: p.id, host: p.host, transport: p.transport, key: p.key, yields: p.yields.slice(), name: p.name(), licence: p.licence, url: p.url, last: STATUS[p.id] })),
    report: report,
    /* the pieces that make a claim about the world, reachable with no browser attached so
       tests/r565-checks.test.mjs can drive THE SHIPPED ONES rather than copies of them */
    _deficit: deficit, _cc: ccOf, _signalsOf: signalsOf, _iso2: iso2, _worstBy: worstBy,
    /* ⚠ THE TWO SENTENCES THE READER ACTUALLY READS. Both were, for one build, silently empty:
       they were built with pickArgs() and .replace() threw, and each was the last statement of its
       block, so nothing else looked wrong. They are reachable from the checks for that reason. */
    _coverageLine: coverageLine, _probeLine: probeLine, _paintOutages: paintOutages,
    _geomForCountries: geomForCountries,
  };
  /* a basemap swap discards every layer this file added, so it is re-drawn on the same signal
     js/war-layer.js listens to — and only for the rows that are actually on. */
  try {
    GE().events.on('styledata', () => {
      if (S.nethlth) whenDrawable(() => { render(); });
      if (S.netreach && S.probes) whenDrawable(() => { paintProbes(S.probes.pts); probeLegend(); });
    });
  } catch (_) { }

  window.__imNetHealth = API;
  return API;
};
