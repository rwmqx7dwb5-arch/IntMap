/* ============================================================================
 *  IntMap · WATCHED PLACES — a saved place that tells you when something happens near it   (watch-places)
 * ----------------------------------------------------------------------------
 *  The reader-facing half of supabase/migrations/20261003211700_place_watches.sql. A place in My places
 *  (js/my-places.js) can be WATCHED: earthquakes (USGS), official weather warnings (the warnings layer's
 *  own normalised records), volcano alert levels (USGS / JMA / the Smithsonian weekly report, through
 *  js/volcano-intel.js) and news events corroborated by independent outlets (news_events) near it are
 *  read; what is NEW since the reader last looked is announced in the app (one toast, a mark on the
 *  account button) and gathered in a digest sheet with every record's source and link.
 *
 *  ══ WHY THIS IS NOT THE AREA MONITORS COMING BACK ═════════════════════════════════════════════
 *  #R231 withdrew the Area Monitors' every entry point (「一旦撤去」) and left the base running
 *  (docs/architecture/18-area-monitors.md). What the record shows that base cost and did not deliver:
 *    · a whole tab and a workspace window of its own — the round that withdrew it was the round
 *      cutting the phone's start-up; the window threw on every desktop start for a round (#R142);
 *    · ONE source (news) behind a form that offered «sources»;
 *    · a server run on a cron with a shared secret and an AI call per detected change — a cost that
 *      grows with readers, for a sentence the code already had;
 *    · the reader's own save path never worked from the page until #R150 (it was only ever tested
 *      as the service role).
 *  This product answers each: it lives INSIDE things the reader already has (a saved place, the
 *  account sheet, Atlas) and adds no tab; it reads FOUR kinds from feeds the map
 *  already draws; it runs in the page while IntMap is open — no cron, no secret, no AI, nothing
 *  billed; and every door is the reader's own row under RLS, tested as the reader
 *  (supabase/tests/26_place_watches_test.sql). What the page cannot do — tell a reader whose IntMap
 *  is CLOSED — is designed and awaiting approval (Web Push: docs/AREA-MONITORS.md §«Watched places»).
 *
 *  THE RULES («near», «strong enough», «new») ARE NOT HERE. They are supabase/functions/_shared/place-watch.js,
 *  so the page and a future server evaluator are one copy. This file reads the feeds, keeps the
 *  account's state, and draws.
 *
 *  Reached from: the account sheet (js/auth-ui.js — and it starts the watcher on sign-in), My places
 *  (js/my-places.js) and Atlas
 *  (js/atlas-cap-places.js: places.watch / places.unwatch / places.watchDigest / places.watchSeen).
 *  Loaded on demand — never on the boot path of a signed-out reader.
 * ==========================================================================*/
import { IntMapLang } from './lang-registry.js';
import { IntMapGeoEngine } from './geo-engine.js';
import { loadData } from './data-door.js';
import { jsonWithin } from './fetch-deadline.js';   /* a read that is guaranteed to end */
import { clockFor } from './proxy-fetch.js';        /* …and how long a given host may take — decided there, per host */
import { everyTick, stopTick } from './runtime.js';  /* the one timer wheel (it already skips a hidden page) */
import { listPlaces, placeFailureText } from './my-places.js';
import {
  WATCH_DEFAULTS, QUAKE_FLOOR_MAG, RADIUS_MAX_KM, KINDS, USGS_WEEK_FEED, NEWS_WINDOW_MS,
  watchSettings, watchedKinds, quakeItems, warningItems, volcanoItems, newsItems, evaluate, nextSeen, triage,
} from '../supabase/functions/_shared/place-watch.js';

const WCOLS = 'place_id,radius_km,quake_min_mag,alert_min_level,volcano_min_rank,news_min_sources,enabled,seen_at,seen_keys,created_at,updated_at';
const NEWS_COLS = 'public_id,representative_title,rep_lng,rep_lat,rep_place_name_en,independent_source_count,article_count,last_article_at,first_published_at,status,'
  + 'representative:news_articles!news_events_representative_article_id_fkey(canonical_url,source_id)';
/* The news read is ONE query for every watch. MEASURED 2026-10-03: 296 active events in the last 72 h
   with ≥ 2 independent outlets, 48.8 kB. 1,000 is ~3× that; a full page is REPORTED (`truncated`),
   never treated as «that is all there was». */
const NEWS_PAGE = 1000;
/* How often the page looks while IntMap is open: 10 minutes — the granularity the Area Monitors'
   cron used (docs/AREA-MONITORS.md, every ten minutes), and the feeds read here regenerate every minute (USGS) to
   every few minutes, so a reader learns of a new record at most ~10 min after IntMap could have.
   Lapses if a feed that changes faster than that is added. */
const TICK_MS = 10 * 60 * 1000;
/* The volcano warm-up and the news query get this long before they are called unavailable — the
   deadline js/volcano-intel.js already gives its slowest feed (getMonitoredVolcanoes, 20,000 ms). The
   USGS read is bounded by js/fetch-deadline.js with js/proxy-fetch.js clockFor's clock for that host. */
const READ_MS = 20000;
/* How many announced keys this DEVICE remembers, so a reload does not announce the same record twice.
   The same bound as the account's SEEN_MAX would be the generous choice; this is a per-device cache. */
const NOTIFIED_MAX = 2000;

/* ── the account's rows ───────────────────────────────────────────────────────────────────────── */

function errOf(error) {
  const c = error && error.code;
  if (c === '42501') return 'sign_in';
  if (c === '23503') return 'no_place';
  if (c === '23514' || c === '22023' || c === '22P02') return 'invalid';
  if (c === '42P01' || c === 'PGRST205') return 'not_deployed';
  return 'failed';
}

/** The account's watches, each with its saved place. @returns {Promise<{ok, watches?, error?}>} */
export async function listWatches(DB) {
  if (!DB) return { ok: false, error: 'unavailable' };
  try {
    const { data, error } = await DB.from('place_watches').select(WCOLS + ',saved_places(id,name,lng,lat,collection,note,zoom)');
    if (error) return { ok: false, error: errOf(error) };
    return { ok: true, watches: (Array.isArray(data) ? data : []).filter((w) => w && w.saved_places) };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Watch a saved place, or change how it is watched. Only the fields given are written (a second
 *  watch of a watched place updates it — one row per place). `off: ['news', …]` turns kinds off.
 *  @returns {Promise<{ok, created?, error?}>} */
export async function setWatch(DB, placeId, s) {
  if (!DB) return { ok: false, error: 'unavailable' };
  if (!placeId) return { ok: false, error: 'invalid' };
  s = s || {};
  const row = { place_id: String(placeId) };
  const n = (v) => (v == null || v === '' || !isFinite(+v) ? undefined : +v);
  if (n(s.radiusKm) !== undefined) row.radius_km = Math.max(1, Math.min(RADIUS_MAX_KM, n(s.radiusKm)));
  if (n(s.quakeMinMag) !== undefined) row.quake_min_mag = Math.max(QUAKE_FLOOR_MAG, Math.min(9.5, n(s.quakeMinMag)));
  if (n(s.alertMinLevel) !== undefined) row.alert_min_level = Math.max(1, Math.min(4, Math.round(n(s.alertMinLevel))));
  if (n(s.volcanoMinRank) !== undefined) row.volcano_min_rank = Math.max(1, Math.min(4, Math.round(n(s.volcanoMinRank))));
  if (n(s.newsMinSources) !== undefined) row.news_min_sources = Math.max(1, Math.min(50, Math.round(n(s.newsMinSources))));
  const col = { quake: 'quake_min_mag', warning: 'alert_min_level', volcano: 'volcano_min_rank', news: 'news_min_sources' };
  (Array.isArray(s.off) ? s.off : []).forEach((k) => { if (col[k]) row[col[k]] = null; });
  if (s.enabled != null) row.enabled = !!s.enabled;
  try {
    const { data, error } = await DB.from('place_watches').upsert(row, { onConflict: 'place_id' }).select('place_id,created_at,updated_at');
    if (error) return { ok: false, error: errOf(error) };
    const r = Array.isArray(data) ? data[0] : data;
    if (!r) return { ok: false, error: 'failed' };
    /* the trigger stamps both with the same now() on insert; an update keeps created_at */
    return { ok: true, created: String(r.created_at) === String(r.updated_at) };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/** Stop watching places (the saved places stay). @returns {Promise<{ok, removed?, error?}>} */
export async function unwatch(DB, placeIds) {
  if (!DB) return { ok: false, error: 'unavailable' };
  const ids = (Array.isArray(placeIds) ? placeIds : [placeIds]).map(String).filter(Boolean);
  if (!ids.length) return { ok: true, removed: 0 };
  try {
    const { data, error } = await DB.from('place_watches').delete().in('place_id', ids).select('place_id');
    if (error) return { ok: false, error: errOf(error) };
    if (last) last.results = last.results.filter((r) => ids.indexOf(String(r.placeId)) < 0);
    publish();
    return { ok: true, removed: Array.isArray(data) ? data.length : 0 };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

async function writeSeen(DB, watch, ev) {
  const keys = nextSeen(watch.seen_keys, ev);
  try {
    const { error } = await DB.from('place_watches').update({ seen_at: new Date().toISOString(), seen_keys: keys }).eq('place_id', String(watch.place_id));
    if (error) return { ok: false, error: errOf(error) };
    watch.seen_keys = keys; watch.seen_at = new Date().toISOString();
    return { ok: true };
  } catch (_) { return { ok: false, error: 'failed' }; }
}

/* ── reading the feeds — each kind once per run, for every watch ──────────────────────────────── */

async function withDeadline(p, ms) {
  let t; const d = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('deadline')), ms); });
  try { return await Promise.race([p, d]); } finally { clearTimeout(t); }
}

/** The network read and the globals are parameters so tests/watch-places-checks.test.mjs runs the real readers. */
export function makeReaders(env) {
  env = env || {};
  const getJSON = env.json || ((u) => jsonWithin(u, clockFor(u), { cache: 'no-cache' }));
  const W = env.window || (typeof window !== 'undefined' ? window : {});
  const load = env.loadData || loadData;
  return {
    async quake() {
      try {
        return { state: 'ok', data: await getJSON(USGS_WEEK_FEED) };
      } catch (e) {
        const why = e && e.reason;   /* js/fetch-deadline.js says why nothing arrived */
        return { state: 'unavailable', reason: why === 'timeout' ? 'usgs-deadline' : why === 'http' ? 'usgs-http-' + e.status : why === 'parse' ? 'usgs-unparseable' : 'usgs-unreachable' };
      }
    },
    /* ⚠ THE ONE NORMALISATION. The warnings are read from the warnings layer's own records
       (js/world-packs.js IntMapWorld.alertsQuery — the list the map paints, already on the agencies'
       1–4 ladder), and only while that layer has loaded them. This file never fetches warnings itself:
       a second, simpler warnings pipeline would disagree with the map (the rule #R292 wrote for the
       widget board). When the layer is off the kind is «not read», with that reason — never «none». */
    warning() {
      const Wd = W.IntMapWorld;
      if (!Wd || typeof Wd.alertsQuery !== 'function') return { state: 'unavailable', reason: 'warnings-layer-off' };
      const probe = Wd.alertsQuery({ limit: 1 });
      if (!probe || !probe.on) return { state: 'unavailable', reason: 'warnings-layer-off' };
      return { state: 'ok', at: probe.at || null,
        /* the records whose area CONTAINS the point: the layer's own point test (__wpAlerts.at, the
           tap's answer) when it is there, the record's bbox otherwise */
        near(lng, lat) {
          const q = Wd.alertsQuery({ lng, lat, padDeg: 0 });
          const rows = (q && q.alerts) || [];
          let inside = null;
          try { if (W.__wpAlerts && typeof W.__wpAlerts.at === 'function') inside = W.__wpAlerts.at(lng, lat); } catch (_) { inside = null; }
          if (!Array.isArray(inside)) return rows;
          const hit = new Set(inside.map((a) => String(a.feed) + '|' + String(a.unit)));
          return rows.filter((a) => hit.has(String(a.feed) + '|' + String(a.unit)));
        } };
    },
    async volcano() {
      try {
        const ok = W.IntMapLazy && typeof W.IntMapLazy.need === 'function' ? await W.IntMapLazy.need('volcanoIntel') : !!W.IntMapVolcano;
        const V = ok && W.IntMapVolcano;
        if (!V) return { state: 'unavailable', reason: 'volcano-module-unavailable' };
        await withDeadline(V.warm(), READ_MS + 5000);
        const feeds = typeof V.feeds === 'function' ? V.feeds() : {};
        const states = Object.keys(feeds).map((k) => feeds[k].state);
        if (states.length && states.every((s) => s !== 'ok')) return { state: 'unavailable', reason: 'volcano-feeds-down' };
        const j = await load('data/volcanoes_gvp.json');
        const vols = [];
        for (const f of ((j && j.features) || [])) {
          const c = f && f.geometry && f.geometry.coordinates, p = (f && f.properties) || {};
          if (c && p.v != null) vols.push({ v: +p.v, name: String(p.n || ''), lng: +c[0], lat: +c[1] });
        }
        const index = V.statusIndex();
        const down = Object.keys(feeds).filter((k) => feeds[k].state !== 'ok');
        return { state: 'ok', volcanoes: vols, statusOf: (vn) => index.get(vn) || null, partial: down };
      } catch (e) { return { state: 'unavailable', reason: (e && e.message === 'deadline') ? 'volcano-deadline' : 'volcano-unreadable' }; }
    },
    async news(DB, minSources) {
      if (!DB) return { state: 'unavailable', reason: 'no-database' };
      try {
        const since = new Date(Date.now() - NEWS_WINDOW_MS).toISOString();
        const { data, error } = await withDeadline(DB.from('news_events').select(NEWS_COLS)
          .eq('status', 'active').gte('last_article_at', since).not('rep_lng', 'is', null)
          .gte('independent_source_count', minSources).order('last_article_at', { ascending: false }).limit(NEWS_PAGE), READ_MS);
        if (error) return { state: 'unavailable', reason: 'news-query-' + (error.code || 'failed') };
        const rows = Array.isArray(data) ? data : [];
        return { state: 'ok', rows, truncated: rows.length >= NEWS_PAGE };
      } catch (e) { return { state: 'unavailable', reason: (e && e.message === 'deadline') ? 'news-deadline' : 'news-unreachable' }; }
    },
  };
}

/**
 * runWatches(HOST, watches, readers) — every watch against one read of each feed it needs.
 * A watch looked at for the first time takes the current records as its baseline (stored as seen):
 * nothing is announced as new on the first look — the digest still shows what is in force.
 * @returns {Promise<{at, results:[{placeId, place, watch, ev}], feeds}>}
 */
export async function runWatches(HOST, watches, readers) {
  const on = (watches || []).filter((w) => watchSettings(w).enabled);
  const want = new Set(); on.forEach((w) => watchedKinds(w).forEach((k) => want.add(k)));
  const minNews = Math.min.apply(null, on.map((w) => watchSettings(w).newsMinSources).filter((x) => x != null).concat([50]));
  const [q, wv, v, nw] = await Promise.all([
    want.has('quake') ? readers.quake() : null,
    want.has('warning') ? readers.warning() : null,
    want.has('volcano') ? readers.volcano() : null,
    want.has('news') ? readers.news(HOST && HOST.DB, minNews) : null,
  ]);
  const results = [];
  /* a paused watch is listed (so the digest can resume it) and read for nothing */
  for (const w of (watches || []).filter((x) => !watchSettings(x).enabled)) {
    const sp = w.saved_places || {};
    const place = { id: String(w.place_id), name: String(sp.name || ''), lng: +sp.lng, lat: +sp.lat };
    const sources = {}; KINDS.forEach((k) => { sources[k] = { state: 'off', n: 0 }; });
    results.push({ placeId: place.id, place, watch: w, paused: true, ev: { placeId: place.id, name: place.name, items: [], fresh: [], sources, baseline: false, notes: {} } });
  }
  for (const w of on) {
    const sp = w.saved_places || {};
    const place = { id: String(w.place_id), name: String(sp.name || ''), lng: +sp.lng, lat: +sp.lat };
    const feeds = {
      quake: q && q.state === 'ok' ? { state: 'ok', items: quakeItems(q.data, place, w) } : q,
      warning: wv && wv.state === 'ok' ? { state: 'ok', items: warningItems(wv.near(place.lng, place.lat), place, w) } : wv,
      volcano: v && v.state === 'ok' ? { state: 'ok', items: volcanoItems(v.volcanoes, v.statusOf, place, w), partial: v.partial } : v,
      news: nw && nw.state === 'ok' ? { state: 'ok', items: newsItems(nw.rows, place, w), truncated: nw.truncated } : nw,
    };
    const ev = evaluate(w, place, feeds);
    ev.notes = { volcanoPartial: v && v.partial && v.partial.length ? v.partial : null, newsTruncated: !!(nw && nw.truncated) };
    results.push({ placeId: place.id, place, watch: w, ev });
  }
  return { at: Date.now(), results, feeds: { quake: q, warning: wv && { state: wv.state, reason: wv.reason }, volcano: v && { state: v.state, reason: v.reason }, news: nw && { state: nw.state, reason: nw.reason } } };
}

/* ── the watcher: while IntMap is open and the reader is signed in ─────────────────────────────── */

let host = null, timer = null, running = null, last = null, lastErr = null, visBound = false, watchingFor = '';
const subs = new Set();
function publish() { badge(); subs.forEach((fn) => { try { fn(last); } catch (_) { } }); }
/** Subscribe to each completed run (the open digest sheet). @returns unsubscribe */
function onWatchRun(fn) { subs.add(fn); return () => subs.delete(fn); }
/** The last run (or null). */
export function lastRun() { return last; }
/** How many records are new across every watched place, as of the last run. */
export function freshCount() { return last ? last.results.reduce((n, r) => n + r.ev.fresh.length, 0) : 0; }

function notifiedKey() { return 'intmap_watch_notified:' + (host && host.user ? host.user.id : ''); }
function notifiedGet() { try { const a = JSON.parse(localStorage.getItem(notifiedKey()) || '[]'); return new Set(Array.isArray(a) ? a : []); } catch (_) { return new Set(); } }
function notifiedPut(set) { try { localStorage.setItem(notifiedKey(), JSON.stringify(Array.from(set).slice(-NOTIFIED_MAX))); } catch (_) { } }

/** One check, now. Every caller gets the same promise while a check is running.
 *  `opts.readers` replaces the feed readers (tests/watch-places-checks.test.mjs runs the watcher on stand-ins). */
export function checkNow(HOST, opts) {
  if (HOST) host = HOST;
  if (!host || !host.user || !host.DB) return Promise.resolve({ ok: false, error: 'sign_in' });
  if (running) return running;
  running = (async () => {
    const lw = await listWatches(host.DB);
    if (!lw.ok) { lastErr = lw.error; publish(); return { ok: false, error: lw.error }; }
    lastErr = null;
    const run = await runWatches(host, lw.watches, (opts && opts.readers) || makeReaders());
    /* the first look at a watch is its baseline: stored as seen, announced as nothing */
    for (const r of run.results) { if (r.ev.baseline) { await writeSeen(host.DB, r.watch, r.ev); } }
    run.watchCount = lw.watches.length;
    last = run;
    announce(run);
    publish();
    return { ok: true, run };
  })().finally(() => { running = null; });
  return running;
}

function announce(run) {
  const told = notifiedGet();
  const news = [];
  run.results.forEach((r) => r.ev.fresh.forEach((it) => { if (!told.has(it.key)) news.push({ r, it }); }));
  if (!news.length) return;
  news.forEach((x) => told.add(x.it.key));
  notifiedPut(told);
  const lang = host && host.lang, T = (en, jp) => IntMapLang.t(lang, en, jp);
  const top = triage(news.map((x) => x.it))[0];
  const owner = news.find((x) => x.it === top).r.place.name;
  const more = news.length - 1;
  const line = T('Watched place', '見守る場所') + ' · ' + owner + ': ' + itemLine(top, lang)
    + (more > 0 ? T(' — and ' + more + ' more', ' ほか ' + more + ' 件') : '');
  try { host.imToast(line); } catch (_) { }
}

/** Start watching for the signed-in reader (idempotent). The first check waits for the page to be
 *  idle, so it never competes with the map's first paint. */
export function startWatching(HOST) {
  host = HOST || host;
  if (!host || !host.user) { stopWatching(); return; }
  if (timer && watchingFor === String(host.user.id)) return;
  if (timer) stopWatching();                     /* another account signed in on this page: start over for it */
  watchingFor = String(host.user.id);
  const first = () => { checkNow().catch(() => { }); };
  try { if (typeof requestIdleCallback === 'function') requestIdleCallback(first, { timeout: 20000 }); else setTimeout(first, 8000); } catch (_) { setTimeout(first, 8000); }
  timer = everyTick('place-watch:check', TICK_MS, () => { checkNow().catch(() => { }); });
  if (!visBound && typeof document !== 'undefined') {
    visBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && timer && (!last || Date.now() - last.at > TICK_MS)) checkNow().catch(() => { });
    });
  }
}

/** Signed out: stop, and forget what this page showed. */
export function stopWatching() {
  if (timer) { stopTick(timer); timer = null; }
  watchingFor = '';
  last = null; lastErr = null;
  publish();
}

/* ── words ────────────────────────────────────────────────────────────────────────────────────── */

function kindWord(k, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (k === 'quake') return T('Earthquake', '地震');
  if (k === 'warning') return T('Warning', '警報');
  if (k === 'volcano') return T('Volcano', '火山');
  if (k === 'news') return T('News', 'ニュース');
  return String(k);
}
/* the warnings layer's ladder, in the words js/widget-render.js severityWord already uses */
function levelWord(n, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  return [T('none', 'なし'), T('advisory', '注意'), T('warning', '警報'), T('danger', '危険'), T('emergency', '特別警報')][Math.max(0, Math.min(4, n | 0))];
}
function volcanoWord(n, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  return [T('normal', '平常'), T('baseline', '平常（監視中）'), T('advisory (yellow)', '注意（黄）'), T('watch (orange)', '警戒（橙）'), T('warning (red)', '警告（赤）')][Math.max(0, Math.min(4, n | 0))];
}
function kmText(km) { return km == null ? '' : (km < 10 ? km.toFixed(1) : String(Math.round(km))) + ' km'; }
function agoText(ms, lang) {
  if (!ms) return '';
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (m < 1) return T('just now', 'たった今');
  if (m < 60) return T(m + ' min ago', m + '分前');
  const h = Math.round(m / 60);
  if (h < 48) return T(h + ' h ago', h + '時間前');
  return T(Math.round(h / 24) + ' d ago', Math.round(h / 24) + '日前');
}
/** One record as a line: what, how strong, where, how far, when. */
export function itemLine(it, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (it.kind === 'quake') return T('M' + it.measure.toFixed(1) + ' earthquake', 'M' + it.measure.toFixed(1) + ' の地震') + (it.title ? ' — ' + it.title : '') + (it.km != null ? ' (' + kmText(it.km) + ')' : '');
  if (it.kind === 'warning') return levelWord(it.measure, lang) + ' — ' + it.title;
  if (it.kind === 'volcano') return it.title + ': ' + (it.measureText || volcanoWord(it.measure, lang)) + (it.km != null ? ' (' + kmText(it.km) + ')' : '');
  return it.title + T(' — ' + it.measure + ' independent outlets', ' — 独立した ' + it.measure + ' 媒体');
}
function reasonText(reason, lang) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (reason === 'warnings-layer-off') return T('not read — switch on the Weather warnings layer to include warnings', '未確認 — 警報を含めるには「気象警報」レイヤーをオンにしてください');
  if (reason === 'not-read') return T('not read yet', 'まだ確認していません');
  return T('could not be read this time', '今回は読み取れませんでした') + ' (' + reason + ')';
}
/** The digest of the last run as structured data — what Atlas reads (places.watchDigest). */
export function digestData(run) {
  if (!run) return null;
  return {
    at: new Date(run.at).toISOString(),
    places: run.results.map((r) => ({
      placeId: r.placeId, name: r.place.name, lng: r.place.lng, lat: r.place.lat,
      settings: watchSettings(r.watch), baseline: r.ev.baseline,
      sources: r.ev.sources,
      fresh: r.ev.fresh.map(slim), current: r.ev.items.map(slim),
    })),
  };
  function slim(it) { return { key: it.key, kind: it.kind, title: it.title, measure: it.measure, measureText: it.measureText, km: it.km == null ? null : Math.round(it.km * 10) / 10, at: it.at ? new Date(it.at).toISOString() : null, source: it.source, url: it.url, ref: it.ref, lng: it.lng, lat: it.lat }; }
}

/** Mark records as seen: every watched place, or the ones named. */
export async function markSeen(HOST, placeIds) {
  host = HOST || host;
  if (!host || !host.DB || !host.user) return { ok: false, error: 'sign_in' };
  if (!last) { const c = await checkNow(); if (!c.ok) return c; }
  const want = placeIds && placeIds.length ? new Set(placeIds.map(String)) : null;
  let n = 0;
  for (const r of last.results) {
    if (want && !want.has(String(r.placeId))) continue;
    const w = await writeSeen(host.DB, r.watch, r.ev);
    if (!w.ok) return w;
    n += r.ev.fresh.length;
    r.ev = Object.assign({}, r.ev, { fresh: [] });
  }
  publish();
  return { ok: true, cleared: n };
}

/* ── the account button's mark ────────────────────────────────────────────────────────────────── */

function badge() {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const b = document.getElementById('btn-account');
  if (!b) return;
  const n = freshCount();
  if (n > 0) {
    b.setAttribute('data-watch-new', String(n));
    b.title = IntMapLang.t(host && host.lang, n + ' new at your watched places', '見守る場所に新着 ' + n + ' 件');
  } else { b.removeAttribute('data-watch-new'); if (b.title && /watched places|見守る場所/.test(b.title)) b.removeAttribute('title'); }
}

/* ── the digest sheet ─────────────────────────────────────────────────────────────────────────── */

function el(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'text') n.textContent = props[k];
    else if (k === 'cls') n.className = props[k];
    else n.setAttribute(k, props[k]);
  }
  (kids || []).forEach((c) => { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return n;
}

function ensureStyle() {
  if (document.getElementById('pw-css')) return;
  const st = document.createElement('style'); st.id = 'pw-css';
  st.textContent = '#btn-account{position:relative;}'
    + '#btn-account[data-watch-new]::after{content:"";position:absolute;top:3px;right:3px;width:9px;height:9px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 2px var(--card-bg,#fff);}'
    + '.pw-lead{margin:2px 0 12px;font-size:13px;line-height:1.55;color:var(--text-muted);}'
    + '.pw-bar{display:flex;gap:8px;align-items:center;margin:0 0 12px;}'
    + '.pw-bar .acct-btn{flex:0 0 auto;}'
    + '.pw-when{flex:1;font-size:11.5px;color:var(--text-muted);}'
    + '.pw-place{padding:4px 0 2px;}'
    + '.pw-head{display:flex;align-items:center;gap:8px;}'
    + '.pw-head b{flex:1;min-width:0;font-size:14px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.pw-new{font-size:11px;font-weight:700;color:#fff;background:#ff3b30;border-radius:9px;padding:1px 7px;}'
    + '.pw-sub{font-size:11.5px;color:var(--text-muted);margin:2px 0 6px;}'
    + '.pw-src{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 6px;}'
    + '.pw-chip{font-size:11px;padding:2px 8px;border-radius:9px;background:rgba(128,128,128,0.12);color:var(--text-main);}'
    + '.pw-chip.off{opacity:.55;}'
    + '.pw-chip.bad{background:rgba(255,149,0,0.16);}'
    + '.pw-item{display:flex;gap:8px;align-items:flex-start;padding:7px 0;box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.pw-item button.pw-go{flex:1;min-width:0;text-align:left;border:none;background:transparent;padding:0;font:inherit;color:inherit;cursor:pointer;}'
    + '.pw-item .pw-k{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--text-muted);margin-right:6px;}'
    + '.pw-item .pw-t{font-size:13px;line-height:1.4;color:var(--text-main);}'
    + '.pw-item .pw-m{display:block;font-size:11px;color:var(--text-muted);margin-top:1px;}'
    + '.pw-item.fresh .pw-t{font-weight:600;}'
    + '.pw-item a{flex:0 0 auto;font-size:11.5px;color:var(--accent,#007aff);text-decoration:none;padding:2px 4px;}'
    + '.pw-acts{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 2px;}'
    + '.pw-acts button{border:none;background:rgba(128,128,128,0.12);color:var(--text-main);font-size:12px;font-weight:600;padding:6px 10px;border-radius:9px;cursor:pointer;}'
    + '.pw-acts button.pw-stop:hover{background:#ff3b30;color:#fff;}'
    + '.pw-set{display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center;margin:8px 0 2px;font-size:12.5px;}'
    + '.pw-set select,.pw-set input{padding:6px 8px;border-radius:9px;border:1px solid rgba(128,128,128,0.22);background:var(--card-bg);color:var(--text-main);font-size:12.5px;}'
    + '.pw-add{display:flex;align-items:center;gap:8px;padding:7px 0;}'
    + '.pw-add + .pw-add{box-shadow:inset 0 0.5px 0 rgba(128,128,128,0.22);}'
    + '.pw-add span{flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}';
  document.head.appendChild(st);
}

function flyToItem(it) {
  try {
    const GE = IntMapGeoEngine;
    if (!GE || !GE.hasRenderer || !GE.hasRenderer()) return;
    if (it.bbox) GE.camera.fitBounds([[it.bbox[0], it.bbox[1]], [it.bbox[2], it.bbox[3]]], { padding: 60, maxZoom: 9, duration: 900 });
    else if (isFinite(it.lng) && isFinite(it.lat)) GE.camera.flyTo({ center: [it.lng, it.lat], zoom: Math.max(GE.camera.getZoom(), 7), duration: 900 });
  } catch (_) { }
  /* the record's own card where the app has one */
  try {
    if (it.kind === 'volcano' && window.IntMapVolcano && window.IntMapVolcano.open) window.IntMapVolcano.open(+it.ref.id);
    else if (it.kind === 'news' && window.IntMapNewsEvents && window.IntMapNewsEvents.openByPublicId) window.IntMapNewsEvents.openByPublicId(it.ref.id);
  } catch (_) { }
}

function settingsEditor(w, lang, onSave) {
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  const s = watchSettings(w);
  const sel = (id, label, cur, opts) => {
    const x = el('select', { id, 'aria-label': label });
    opts.forEach(([v, t]) => { const o = el('option', { value: String(v), text: t }); if (String(cur) === String(v)) o.selected = true; x.appendChild(o); });
    return [el('label', { for: id, text: label }), x];
  };
  const off = ['off', T('Off', 'オフ')];
  const id = 'pw-' + String(w.place_id).slice(0, 8);
  const radius = el('input', { id: id + '-r', type: 'number', min: '1', max: String(RADIUS_MAX_KM), step: '10', value: String(s.radiusKm), 'aria-label': T('Radius (km)', '半径（km）') });
  const q = sel(id + '-q', T('Earthquakes', '地震'), s.quakeMinMag == null ? 'off' : s.quakeMinMag, [off].concat([2.5, 3.5, 4.5, 5.5, 6.5].map((m) => [m, 'M' + m.toFixed(1) + T(' or larger', ' 以上')])));
  const a = sel(id + '-a', T('Weather warnings', '気象警報'), s.alertMinLevel == null ? 'off' : s.alertMinLevel, [off].concat([1, 2, 3, 4].map((n) => [n, levelWord(n, lang) + T(' or higher', ' 以上')])));
  const v = sel(id + '-v', T('Volcanoes', '火山'), s.volcanoMinRank == null ? 'off' : s.volcanoMinRank, [off].concat([2, 3, 4].map((n) => [n, volcanoWord(n, lang) + T(' or higher', ' 以上')])));
  const n = sel(id + '-n', T('News', 'ニュース'), s.newsMinSources == null ? 'off' : s.newsMinSources, [off].concat([1, 2, 3, 5].map((k) => [k, T(k + '+ independent outlets', '独立した ' + k + ' 媒体以上')])));
  const save = el('button', { type: 'button', text: T('Save', '保存') });
  save.dataset.effect = 'private';
  save.onclick = () => {
    const pick = (x) => x[1].value;
    const out = { radiusKm: +radius.value, off: [] };
    [['quake', 'quakeMinMag', q], ['warning', 'alertMinLevel', a], ['volcano', 'volcanoMinRank', v], ['news', 'newsMinSources', n]].forEach(([k, f, x]) => {
      if (pick(x) === 'off') out.off.push(k); else out[f] = +pick(x);
    });
    onSave(out);
  };
  return el('div', {}, [
    el('div', { cls: 'pw-set' }, [el('label', { for: id + '-r', text: T('Radius (km)', '半径（km）') }), radius].concat(q, a, v, n)),
    el('div', { cls: 'pw-acts' }, [save]),
  ]);
}

/** Open the «Watched places» digest. */
export async function openWatchDigest(HOST) {
  host = HOST || host;
  const lang = host && host.lang;
  const T = (en, jp) => IntMapLang.t(lang, en, jp);
  if (!host || !host.user) { try { host && host.openAuthModal && host.openAuthModal(); } catch (_) { } return; }
  ensureStyle();
  const old = document.getElementById('pw-modal'); if (old) old.remove();

  const msg = el('p', { cls: 'acct-msg', role: 'status', 'aria-live': 'polite' });
  const body = el('div', { id: 'pw-body' });
  const when = el('span', { cls: 'pw-when' });
  const check = el('button', { cls: 'acct-btn', id: 'pw-check', text: T('Check now', '今すぐ確認') });
  check.dataset.effect = 'private';   /* a first look stores the watch's baseline in the account (writeSeen) */
  const seenAll = el('button', { cls: 'acct-btn acct-btn-quiet', id: 'pw-seen-all', text: T('Mark all seen', 'すべて既読') });
  seenAll.dataset.effect = 'private';
  const close = el('button', { cls: 'acct-close', id: 'pw-close', text: T('Close', '閉じる') });
  const sheet = el('div', { cls: 'acct-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pw-h', tabindex: '-1' }, [
    el('h2', { cls: 'acct-h', id: 'pw-h', text: T('Watched places', '見守る場所') }),
    el('p', { cls: 'pw-lead', text: T('Earthquakes, official weather warnings, volcano alert levels and news reported by independent outlets near your saved places. IntMap checks while it is open — every 10 minutes — and tells you what is new. Nothing is sent to you while IntMap is closed.',
      '保存した場所の周辺の地震・公式の気象警報・火山の警戒レベル・独立した複数の媒体が報じたニュースです。IntMap を開いている間、10 分ごとに確認し、新しいものをお知らせします。IntMap を閉じている間に通知が届くことはありません。') }),
    el('div', { cls: 'pw-bar' }, [when, seenAll, check]),
    msg, body, close,
  ]);
  const m = el('div', { id: 'pw-modal' }, [sheet]);
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:calc(var(--z-toast) + 2001);padding:20px;';
  let unsub = null;
  const shut = () => { try { if (unsub) unsub(); m.remove(); } catch (_) { } };
  close.onclick = shut;
  const editing = new Set();

  const itemRow = (it, fresh) => {
    const go = el('button', { cls: 'pw-go', type: 'button', title: T('Show on the map', '地図に表示') }, [
      el('span', { cls: 'pw-t' }, [el('span', { cls: 'pw-k', text: kindWord(it.kind, lang) }), itemLine(it, lang)]),
      el('span', { cls: 'pw-m', text: [agoText(it.at, lang), it.source, it.kind === 'warning' ? T('your place is inside the warned area', '場所は警報の区域内です') : ''].filter(Boolean).join(' · ') }),
    ]);
    go.onclick = () => { flyToItem(it); shut(); };
    const kids = [go];
    if (it.url) { const a = el('a', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: T('Source', '出典') }); kids.push(a); }
    return el('div', { cls: 'pw-item' + (fresh ? ' fresh' : '') }, kids);
  };

  let gen = 0;
  const render = async () => {
    const mine = ++gen;   /* a run that lands while this render waits for the places list must not draw twice */
    body.textContent = '';
    if (lastErr === 'not_deployed') { body.appendChild(el('div', { cls: 'acct-card' }, [el('p', { cls: 'pw-lead', text: T('Watched places are not available on this server yet.', 'このサーバーではまだ「見守る場所」を利用できません。') })])); return; }
    if (lastErr) { msg.textContent = placeFailureText(lastErr, lang); }
    when.textContent = last ? T('Checked ', '確認: ') + agoText(last.at, lang) : '';
    const results = last ? last.results : [];
    seenAll.disabled = !results.some((r) => r.ev.fresh.length);
    results.forEach((r) => {
      const ev = r.ev, s = watchSettings(r.watch);
      const src = el('div', { cls: 'pw-src' }, KINDS.map((k) => {
        const st = ev.sources[k];
        const t = kindWord(k, lang) + ' · ' + (st.state === 'off' ? T('off', 'オフ') : st.state === 'ok' ? String(st.n) : T('not read', '未確認'));
        const c = el('span', { cls: 'pw-chip' + (st.state === 'off' ? ' off' : st.state === 'ok' ? '' : ' bad'), text: t });
        if (st.state === 'unavailable') c.title = reasonText(st.reason, lang);
        return c;
      }));
      const freshKeys = new Set(ev.fresh.map((i) => i.key));
      const ordered = triage(ev.fresh).concat(triage(ev.items.filter((i) => !freshKeys.has(i.key))));
      const kids = [
        el('div', { cls: 'pw-head' }, [el('b', { text: r.place.name }), ev.fresh.length ? el('span', { cls: 'pw-new', text: T(ev.fresh.length + ' new', '新着 ' + ev.fresh.length) }) : null]),
        el('div', { cls: 'pw-sub', text: T('within ' + Math.round(s.radiusKm) + ' km', '半径 ' + Math.round(s.radiusKm) + ' km') + (ev.baseline ? T(' · first look — what follows from now on is announced as new', ' · 初回の確認 — 以後の新しい出来事をお知らせします') : '') }),
        src,
      ];
      Object.keys(ev.sources).forEach((k) => { const st = ev.sources[k]; if (st.state === 'unavailable') kids.push(el('div', { cls: 'pw-sub', text: kindWord(k, lang) + ': ' + reasonText(st.reason, lang) })); });
      if (ev.notes && ev.notes.newsTruncated) kids.push(el('div', { cls: 'pw-sub', text: T('News: more events than one read returns — the oldest may be missing.', 'ニュース: 1 回で読める件数を超えました。古いものが欠けている可能性があります。') }));
      if (!ordered.length && !r.paused) kids.push(el('div', { cls: 'pw-sub', text: T('Nothing above your thresholds in what could be read.', '読み取れた範囲では、基準を超えるものはありません。') }));
      ordered.forEach((it) => kids.push(itemRow(it, freshKeys.has(it.key))));
      if (r.paused) kids.splice(1, 1, el('div', { cls: 'pw-sub', text: T('Paused — nothing is checked for this place.', '一時停止中 — この場所は確認していません。') }));
      const pause = el('button', { type: 'button', text: r.paused ? T('Resume', '再開') : T('Pause', '一時停止') }); pause.dataset.effect = 'private';
      pause.onclick = async () => { const x = await setWatch(host.DB, r.placeId, { enabled: !!r.paused }); if (!x.ok) { msg.textContent = placeFailureText(x.error, lang); return; } await checkNow(); render(); };
      const seen = el('button', { type: 'button', text: T('Mark seen', '既読にする') }); seen.dataset.effect = 'private';
      seen.disabled = !ev.fresh.length;
      seen.onclick = async () => { const x = await markSeen(host, [r.placeId]); if (!x.ok) msg.textContent = placeFailureText(x.error, lang); render(); };
      const edit = el('button', { type: 'button', text: editing.has(r.placeId) ? T('Close settings', '設定を閉じる') : T('Settings', '設定') });
      edit.dataset.effect = 'none';   /* it only opens the editor; the editor's own Save is the write */
      edit.onclick = () => { if (editing.has(r.placeId)) editing.delete(r.placeId); else editing.add(r.placeId); render(); };
      const stop = el('button', { cls: 'pw-stop', type: 'button', text: T('Stop watching', '見守りをやめる') }); stop.dataset.effect = 'private';
      stop.onclick = async () => { const x = await unwatch(host.DB, [r.placeId]); if (!x.ok) { msg.textContent = placeFailureText(x.error, lang); return; } msg.textContent = T('Stopped watching: ' + r.place.name, '見守りをやめました: ' + r.place.name); render(); };
      kids.push(el('div', { cls: 'pw-acts' }, [seen, pause, edit, stop]));
      if (editing.has(r.placeId)) kids.push(settingsEditor(r.watch, lang, async (out) => {
        const x = await setWatch(host.DB, r.placeId, out);
        if (!x.ok) { msg.textContent = placeFailureText(x.error, lang); return; }
        editing.delete(r.placeId); msg.textContent = T('Saved. Checking…', '保存しました。確認しています…');
        await checkNow(); msg.textContent = ''; render();
      }));
      body.appendChild(el('div', { cls: 'acct-card' }, [el('div', { cls: 'pw-place' }, kids)]));
    });

    /* the saved places not yet watched — watching one is one press */
    const lp = await listPlaces(host.DB);
    if (mine !== gen || !lp.ok) return;
    const watched = new Set(results.map((r) => String(r.placeId)));
    const rest = lp.places.filter((p) => !watched.has(String(p.id)));
    body.appendChild(el('div', { cls: 'acct-grp-t', text: T('Watch a saved place', '保存した場所を見守る') }));
    if (!lp.places.length) {
      body.appendChild(el('div', { cls: 'acct-card' }, [el('p', { cls: 'pw-lead', text: T('Save a place first (Account ▸ My places, or a pin’s Save), then watch it here.', 'まず場所を保存してください（アカウント ▸ マイプレイス、またはピンの「保存」）。保存した場所をここで見守れます。') })]));
      return;
    }
    if (!rest.length) { body.appendChild(el('div', { cls: 'acct-card' }, [el('p', { cls: 'pw-lead', text: T('Every saved place is watched.', '保存したすべての場所を見守っています。') })])); return; }
    body.appendChild(el('div', { cls: 'acct-card' }, rest.map((p) => {
      const b = el('button', { cls: 'acct-btn', type: 'button', text: T('Watch', '見守る') }); b.dataset.effect = 'private';
      b.onclick = async () => {
        b.disabled = true;
        const x = await setWatch(host.DB, p.id, {});
        if (!x.ok) { b.disabled = false; msg.textContent = placeFailureText(x.error, lang); return; }
        msg.textContent = T('Watching ' + p.name + '. Checking…', p.name + ' を見守ります。確認しています…');
        await checkNow(); msg.textContent = ''; render();
      };
      return el('div', { cls: 'pw-add' }, [el('span', { text: p.name + (p.collection ? ' · ' + p.collection : '') }), b]);
    })));
  };

  check.onclick = async () => { check.disabled = true; msg.textContent = T('Checking…', '確認しています…'); await checkNow(host); check.disabled = false; msg.textContent = ''; render(); };
  seenAll.onclick = async () => { const x = await markSeen(host); if (!x.ok) msg.textContent = placeFailureText(x.error, lang); render(); };

  try {
    if (window.IntMapDialog) window.IntMapDialog.open(m, { panel: sheet, labelledby: 'pw-h', backdrop: true, close: shut });
    else document.body.appendChild(m);
  } catch (_) { document.body.appendChild(m); }
  try { sheet.focus(); } catch (_) { }
  body.appendChild(el('p', { cls: 'pw-lead', text: T('Checking your watched places…', '見守る場所を確認しています…') }));
  if (!last || Date.now() - last.at > TICK_MS) await checkNow(host);
  await render();
  unsub = onWatchRun(() => { if (m.isConnected) render(); });
}

export { WATCH_DEFAULTS };
