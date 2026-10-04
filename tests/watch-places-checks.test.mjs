/* ============================================================================
 *  watch-places — a saved place that tells you when something happens near it
 * ----------------------------------------------------------------------------
 *  The database half is supabase/tests/26_place_watches_test.sql (pgTAP, CI's DB job). This file is
 *  the offline half, run by `node --test` with no database and no network — the code is EVALUATED:
 *    ① the rules (supabase/functions/_shared/place-watch.js): near / strong enough / new, per kind,
 *      with the key that makes a CHANGE new and a re-publication not; a first look announces nothing;
 *      an unread feed is «not read», never «nothing», and does not make its records new again;
 *    ② the numbers the rules name are the numbers the migration enforces (one source, held together);
 *    ③ the page's readers and runner (js/place-watch.js), against stand-in feeds: one USGS request for
 *      every watch, warnings only from the warnings layer's own records and «not read» when it is off,
 *      volcano ranks from js/volcano-intel.js's status index, news from news_events;
 *    ④ the watcher end to end with a stand-in account: baseline stored on the first look, a new record
 *      found on the next, announced ONCE on this device, cleared by «mark seen»;
 *    ⑤ the Atlas capabilities, evaluated: signed-out is input only the reader can give, watching twice
 *      is «already watched», «off» turns a kind off, unwatching a place that is not watched says so;
 *    ⑥ the doors: on demand (no static import on the boot path), every writing control says what it
 *      does, and nothing in the product asks a model.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';
import * as C from '../supabase/functions/_shared/place-watch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
/* every regex metacharacter, so a number or a name is matched as itself */
const reEsc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TOKYO = { id: 'pA', name: 'Home', lng: 139.69, lat: 35.69 };
const quakeFeed = (rows) => ({ type: 'FeatureCollection', features: rows.map(([id, mag, lng, lat, t]) => ({ id, properties: { mag, place: 'near ' + id, time: t, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id }, geometry: { coordinates: [lng, lat, 10] } })) });

test('① the rules: near, strong enough, and new — decided per kind on its own measure', () => {
  const w = { place_id: 'pA', radius_km: 300, quake_min_mag: 4.5, alert_min_level: 2, volcano_min_rank: 2, news_min_sources: 2 };
  /* quakes: the magnitude AND the radius both hold */
  const q = C.quakeItems(quakeFeed([['us1', 5.1, 140.5, 36.0, 1000], ['us2', 4.4, 140.0, 35.7, 2000], ['us3', 6.0, 150.0, 45.0, 3000]]), TOKYO, w);
  assert.deepEqual(q.map((i) => i.key), ['quake:us1'], 'M4.4 is below the threshold; M6.0 at ~1,300 km is outside the radius');
  assert.ok(q[0].km > 70 && q[0].km < 90, 'the distance is the great-circle distance');
  assert.equal(q[0].url.startsWith('https://'), true);

  /* warnings: re-issued at a new time is the SAME key; an upgrade is a new one */
  const a1 = C.warningItems([{ feed: 'jma', unit: '東京都23区', place: '東京都', level: 2, kind: '大雨', at: 1 }], TOKYO, w);
  const a2 = C.warningItems([{ feed: 'jma', unit: '東京都23区', place: '東京都', level: 2, kind: '大雨', at: 9 }], TOKYO, w);
  const a3 = C.warningItems([{ feed: 'jma', unit: '東京都23区', place: '東京都', level: 3, kind: '大雨', at: 9 }], TOKYO, w);
  assert.equal(a1[0].key, a2[0].key, 'the same warning re-stamped by the agency is not new');
  assert.notEqual(a1[0].key, a3[0].key, 'the same warning raised a level is new');
  assert.equal(C.warningItems([{ feed: 'jma', unit: 'x', level: 1, kind: 'k' }], TOKYO, w).length, 0, 'an advisory is below «warning»');

  /* volcanoes: a change of level is a new key */
  const vols = [{ v: 283010, name: 'Fuji', lng: 138.73, lat: 35.36 }, { v: 999, name: 'Far', lng: 10, lat: 10 }];
  const at2 = C.volcanoItems(vols, new Map([[283010, { rank: 2, label: 'レベル２', source: 'JMA', at: '2026-10-03T00:00:00Z' }], [999, { rank: 4 }]]), TOKYO, w);
  const at3 = C.volcanoItems(vols, (vn) => (vn === 283010 ? { rank: 3, label: 'レベル３' } : null), TOKYO, w);
  assert.deepEqual(at2.map((i) => i.key), ['volcano:283010:2'], 'the far volcano is outside the radius whatever its level');
  assert.notEqual(at2[0].key, at3[0].key);
  assert.equal(C.volcanoItems(vols, () => ({ rank: 1 }), TOKYO, w).length, 0, 'baseline (rank 1) is below the first raised step');
  assert.equal(C.volcanoItems(vols, () => null, TOKYO, w).length, 0, 'a volcano no agency speaks for is not an alert');

  /* news: independent outlets, active, near; the link is the representative article's, http(s) only */
  const ev = (id, n, lng, lat, extra) => Object.assign({ public_id: id, representative_title: 't' + id, independent_source_count: n, rep_lng: lng, rep_lat: lat, status: 'active', last_article_at: '2026-10-03T00:00:00Z', representative: { canonical_url: 'https://news.example/' + id, source_id: 'wire' } }, extra || null);
  const n = C.newsItems([ev('e1', 3, 139.7, 35.6), ev('e2', 1, 139.7, 35.6), ev('e3', 4, 2.3, 48.8), ev('e4', 5, 139.7, 35.6, { status: 'merged' }), ev('e5', 2, 139.7, 35.6, { representative: { canonical_url: 'javascript:alert(1)' } })], TOKYO, w);
  assert.deepEqual(n.map((i) => i.key), ['news:e1', 'news:e5']);
  assert.equal(n[1].url, '', 'a link that is not http(s) is dropped');

  /* NULL threshold = that kind is not watched */
  assert.deepEqual(C.watchedKinds(Object.assign({}, w, { news_min_sources: null })), ['quake', 'warning', 'volcano']);
  assert.equal(C.newsItems([ev('e1', 3, 139.7, 35.6)], TOKYO, Object.assign({}, w, { news_min_sources: null })).length, 0);
});

test('① a first look announces nothing; an unread feed is «not read» and keeps its seen keys', () => {
  const items = (keys) => keys.map((k, i) => ({ key: k, kind: k.split(':')[0], at: i }));
  const w0 = { place_id: 'pA', news_min_sources: 2, quake_min_mag: 4.5, alert_min_level: null, volcano_min_rank: null, seen_at: null, seen_keys: [] };
  const first = C.evaluate(w0, TOKYO, { quake: { state: 'ok', items: items(['quake:a']) }, news: { state: 'ok', items: items(['news:x']) } });
  assert.equal(first.baseline, true);
  assert.equal(first.fresh.length, 0, 'the first look is the baseline, not an announcement');
  assert.equal(first.sources.warning.state, 'off'); assert.equal(first.sources.volcano.state, 'off');
  const seen = C.nextSeen([], first);
  assert.deepEqual(seen.sort(), ['news:x', 'quake:a']);

  const w1 = Object.assign({}, w0, { seen_at: '2026-10-03T00:00:00Z', seen_keys: seen });
  /* USGS is down this time; a new news event arrived */
  const second = C.evaluate(w1, TOKYO, { quake: { state: 'unavailable', reason: 'usgs-deadline' }, news: { state: 'ok', items: items(['news:x', 'news:y']) } });
  assert.deepEqual(second.fresh.map((i) => i.key), ['news:y']);
  assert.deepEqual(second.sources.quake, { state: 'unavailable', reason: 'usgs-deadline', n: 0 }, 'an unread feed says why — it is not «0 quakes»');
  const after = C.nextSeen(w1.seen_keys, second);
  assert.ok(after.includes('quake:a'), 'the unread kind keeps what had been seen, so it is not new again when USGS answers');
  assert.ok(after.includes('news:y'));
  const third = C.evaluate(Object.assign({}, w1, { seen_keys: after }), TOKYO, { quake: { state: 'ok', items: items(['quake:a']) }, news: { state: 'ok', items: items(['news:x', 'news:y']) } });
  assert.equal(third.fresh.length, 0, 'USGS answering again does not re-announce the quake already seen');

  /* trimmed to SEEN_MAX, newest kept */
  const many = { items: Array.from({ length: C.SEEN_MAX + 50 }, (_, i) => ({ key: 'quake:k' + i, kind: 'quake', at: i })), sources: { quake: { state: 'ok' } } };
  const trimmed = C.nextSeen([], many);
  assert.equal(trimmed.length, C.SEEN_MAX);
  assert.ok(trimmed.includes('quake:k' + (C.SEEN_MAX + 49)) && !trimmed.includes('quake:k0'), 'the newest are kept');
});

test('② the numbers the rules name are the numbers the migration enforces', () => {
  const sql = codeOnly(read('supabase/migrations/20261003211700_place_watches.sql'), { lang: 'sql' });
  const col = (name) => { const m = new RegExp('\\b' + name + '\\b[^,\\n]*', 'i').exec(sql); assert.ok(m, name + ' column'); return m[0]; };
  assert.match(col('radius_km'), new RegExp('default ' + C.WATCH_DEFAULTS.radiusKm + '\\b'));
  assert.match(col('radius_km'), new RegExp('radius_km <= ' + C.RADIUS_MAX_KM + '\\b'));
  assert.match(col('quake_min_mag'), new RegExp('default ' + reEsc(C.WATCH_DEFAULTS.quakeMinMag) + '\\b'));
  assert.match(col('quake_min_mag'), new RegExp('between ' + reEsc(C.QUAKE_FLOOR_MAG) + ' and'));
  assert.match(col('alert_min_level'), new RegExp('default ' + C.WATCH_DEFAULTS.alertMinLevel + '\\b'));
  assert.match(col('volcano_min_rank'), new RegExp('default ' + C.WATCH_DEFAULTS.volcanoMinRank + '\\b'));
  assert.match(col('news_min_sources'), new RegExp('default ' + C.WATCH_DEFAULTS.newsMinSources + '\\b'));
  assert.match(sql, new RegExp('cardinality\\(seen_keys\\) <= ' + C.SEEN_MAX + '\\b'));
  /* the USGS feed is the one the rest of the app reads — (place-card-unify) through the ONE reader: js/events-near.js takes the
     URL from this file, and every other reader of the week's feed goes through it instead of naming the URL again */
  assert.match(read('js/events-near.js'), /import \{ USGS_WEEK_FEED, QUAKE_FLOOR_MAG \} from '\.\.\/supabase\/functions\/_shared\/place-watch\.js'/, 'js/events-near.js reads the feed this file names');
  for (const f of ['js/atlas-cap-research.js', 'js/place-dossier.js', 'js/place-watch.js']) assert.ok(!read(f).includes(C.USGS_WEEK_FEED), f + ' reads the week\'s feed through js/events-near.js, not by its own URL');   /* a substring, not a regex built from a URL */
});

/* ── a stand-in account: place_watches, saved_places, news_events ───────────────────────────── */
function fakeDB(state) {
  const calls = [];
  const from = (table) => {
    const ctx = { table, op: 'select', filters: [] };
    const chain = {
      select(cols) { ctx.cols = cols; return chain; }, order() { return chain; }, limit(n) { ctx.limit = n; return chain; },
      gte(c, v) { ctx.filters.push(['gte', c, v]); return chain; }, not(c, o, v) { ctx.filters.push(['not', c, v]); return chain; },
      is(c, v) { ctx.filters.push(['is', c, v]); return chain; }, range(a, b) { ctx.range = [a, b]; return chain; },
      eq(c, v) { ctx.filters.push(['eq', c, v]); return chain; }, in(c, v) { ctx.filters.push(['in', c, v]); return chain; },
      delete() { ctx.op = 'delete'; return chain; },
      update(row) { ctx.op = 'update'; ctx.row = row; return chain; },
      upsert(row, o) { ctx.op = 'upsert'; ctx.row = row; ctx.onConflict = o && o.onConflict; return chain; },
      then(res, rej) {
        calls.push(ctx);
        let data = null;
        const f = (k) => (ctx.filters.find((x) => x[1] === k) || [])[2];
        if (table === 'news_events') data = state.news.slice();
        else if (table === 'saved_places') data = state.places.slice();
        else if (table === 'place_watches') {
          const withPlace = (w) => Object.assign({}, w, { saved_places: state.places.find((p) => p.id === w.place_id) || null });
          if (ctx.op === 'select') data = state.watches.map(withPlace);
          if (ctx.op === 'update') { const w = state.watches.find((x) => x.place_id === f('place_id')); Object.assign(w, ctx.row); data = [w]; }
          if (ctx.op === 'delete') { const ids = f('place_id'); data = state.watches.filter((w) => ids.includes(w.place_id)); state.watches = state.watches.filter((w) => !ids.includes(w.place_id)); }
          if (ctx.op === 'upsert') {
            const now = 't' + (++state.clock);
            let w = state.watches.find((x) => x.place_id === ctx.row.place_id);
            if (w) { Object.assign(w, ctx.row, { updated_at: now }); }
            else { w = Object.assign({ radius_km: 300, quake_min_mag: 4.5, alert_min_level: 2, volcano_min_rank: 2, news_min_sources: 2, enabled: true, seen_at: null, seen_keys: [], created_at: now, updated_at: now }, ctx.row); state.watches.push(w); }
            data = [{ place_id: w.place_id, created_at: w.created_at, updated_at: w.updated_at }];
          }
        }
        return Promise.resolve({ data, error: null }).then(res, rej);
      },
    };
    return chain;
  };
  return { calls, from };
}
function standInWorld(opts) {
  opts = opts || {};
  const fetched = [];
  const window = {
    IntMapWorld: opts.warningsOff ? { alertsQuery: () => ({ on: false, alerts: [] }) } : {
      alertsQuery: (o) => ({ on: true, at: 5, alerts: (o.lng != null) ? [{ iso: 'JP', feed: 'jma', unit: '東京都23区', place: '東京都', level: 3, kind: '大雨', at: 5, bbox: [139, 35, 140, 36] }, { iso: 'JP', feed: 'jma', unit: '伊豆諸島', place: '東京都', level: 3, kind: '波浪', at: 5, bbox: [139, 33, 140, 36] }] : [] }),
    },
    /* the layer's own point test says the place is inside only the 23-ku unit */
    __wpAlerts: { at: () => [{ feed: 'jma', unit: '東京都23区' }] },
    IntMapLazy: { need: async () => true },
    IntMapVolcano: { warm: async () => [], feeds: () => ({ jma: { state: 'ok' }, usgs: { state: 'error' } }), statusIndex: () => new Map([[283010, { rank: 2, label: 'レベル２', source: 'JMA' }]]) },
  };
  const env = {
    window,
    json: async (u) => { fetched.push(u); if (opts.usgsDown) throw Object.assign(new Error('offline'), { reason: 'network' }); return quakeFeed(opts.quakes || [['us1', 5.1, 140.5, 36.0, 1000]]); },
    loadData: async () => ({ features: [{ properties: { v: 283010, n: 'Fuji' }, geometry: { coordinates: [138.73, 35.36] } }] }),
  };
  return { env, fetched };
}

test('③ the readers and the runner: one request per feed for every watch, one warnings normalisation', async () => {
  const W = await import('../js/place-watch.js');
  const state = { clock: 0, places: [TOKYO, { id: 'pB', name: 'Office', lng: 139.75, lat: 35.68 }],
    watches: [{ place_id: 'pA', radius_km: 300, quake_min_mag: 4.5, alert_min_level: 2, volcano_min_rank: 2, news_min_sources: 2, enabled: true, seen_at: 'x', seen_keys: [] },
      { place_id: 'pB', radius_km: 300, quake_min_mag: 4.5, alert_min_level: 2, volcano_min_rank: 2, news_min_sources: 3, enabled: true, seen_at: 'x', seen_keys: [] }],
    news: [{ public_id: 'e1', representative_title: 'Flooding in Tokyo', independent_source_count: 3, rep_lng: 139.7, rep_lat: 35.6, status: 'active', last_article_at: '2026-10-03T00:00:00Z' }] };
  const DB = fakeDB(state);
  const { env, fetched } = standInWorld();
  const lw = await W.listWatches(DB);
  const run = await W.runWatches({ DB }, lw.watches, W.makeReaders(env));
  assert.equal(fetched.length, 1, 'ONE USGS request answers both watches');
  const newsQ = DB.calls.filter((c) => c.table === 'news_events');
  assert.equal(newsQ.length, 1, 'ONE news query answers both watches');
  assert.deepEqual(newsQ[0].filters.find((f) => f[1] === 'independent_source_count'), ['gte', 'independent_source_count', 2], 'the query asks for the lowest threshold any watch uses');
  const a = run.results.find((r) => r.placeId === 'pA').ev, b = run.results.find((r) => r.placeId === 'pB').ev;
  assert.deepEqual(a.fresh.map((i) => i.kind).sort(), ['news', 'quake', 'volcano', 'warning']);
  assert.deepEqual(a.items.filter((i) => i.kind === 'warning').map((i) => i.title), ['大雨 — 東京都'], 'only the warning whose area CONTAINS the place (the layer\'s own point test), not every bbox hit');
  assert.equal(b.items.filter((i) => i.kind === 'news').length, 1, 'pB asks for 3 outlets and the event has 3');
  assert.deepEqual(run.results[0].ev.notes.volcanoPartial, ['usgs'], 'a volcano rung that did not answer is reported, not hidden');

  /* a paused watch is listed (the digest can resume it) and costs no read */
  const paused = standInWorld();
  const run3 = await W.runWatches({ DB }, [Object.assign({}, lw.watches[0], { enabled: false })], W.makeReaders(paused.env));
  assert.equal(paused.fetched.length, 0, 'nothing is read for a paused watch');
  assert.equal(run3.results.length, 1); assert.equal(run3.results[0].paused, true);
  assert.equal(run3.results[0].ev.fresh.length, 0);

  /* the warnings layer is off; USGS is down */
  const off = standInWorld({ warningsOff: true, usgsDown: true });
  const run2 = await W.runWatches({ DB }, lw.watches, W.makeReaders(off.env));
  const s2 = run2.results[0].ev.sources;
  assert.deepEqual([s2.warning.state, s2.warning.reason], ['unavailable', 'warnings-layer-off'], 'warnings are never fetched by a second pipeline — the kind is «not read» and says why');
  assert.deepEqual([s2.quake.state, s2.quake.reason], ['unavailable', 'usgs-unreachable']);
  assert.equal(s2.news.state, 'ok');
});

test('④ the watcher: a baseline on the first look, a new record on the next, announced once, cleared by «mark seen»', async () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const W = await import('../js/place-watch.js');
  const state = { clock: 0, places: [TOKYO], watches: [], news: [] };
  const toasts = [];
  const HOST = { lang: 'en', user: { id: 'u1' }, DB: fakeDB(state), imToast: (s) => toasts.push(s) };
  const set = await W.setWatch(HOST.DB, 'pA', { radiusKm: 200, off: ['warning', 'volcano', 'news'] });
  assert.deepEqual(set, { ok: true, created: true });
  assert.equal(state.watches[0].alert_min_level, null, '«off» stores NULL — that kind is not watched');
  assert.equal(state.watches[0].radius_km, 200);
  assert.deepEqual(await W.setWatch(HOST.DB, 'pA', { quakeMinMag: 1 }), { ok: true, created: false }, 'watching again updates the same row');
  assert.equal(state.watches[0].quake_min_mag, C.QUAKE_FLOOR_MAG, 'a magnitude below the feed\'s floor is raised to it, not sent to be refused');

  /* the runner the watcher uses reads the real feeds; here the readers are the stand-ins */
  const { env } = standInWorld({ quakes: [['us1', 5.1, 140.5, 36.0, 1000]] });
  const realMake = W.makeReaders;
  const run1 = await W.runWatches(HOST, (await W.listWatches(HOST.DB)).watches, realMake(env));
  assert.equal(run1.results[0].ev.baseline, true);
  assert.equal(run1.results[0].ev.fresh.length, 0, 'nothing is announced on the first look');

  /* the account's seen state is what makes the next look's «new» — written through markSeen's door */
  state.watches[0].seen_at = '2026-10-03T00:00:00Z';
  state.watches[0].seen_keys = C.nextSeen([], run1.results[0].ev);
  const later = standInWorld({ quakes: [['us1', 5.1, 140.5, 36.0, 1000], ['us9', 5.8, 139.9, 35.4, 9000]] });
  const run2 = await W.runWatches(HOST, (await W.listWatches(HOST.DB)).watches, realMake(later.env));
  assert.deepEqual(run2.results[0].ev.fresh.map((i) => i.key), ['quake:us9']);
  assert.match(W.itemLine(run2.results[0].ev.fresh[0], 'en'), /^M5\.8 earthquake — near us9 \(\d+(\.\d)? km\)$/);
  assert.match(W.itemLine(run2.results[0].ev.fresh[0], 'jp'), /^M5\.8 の地震/);

  /* the watcher itself: checkNow → announce → markSeen, against the account */
  state.watches[0].seen_at = null; state.watches[0].seen_keys = [];
  const c1 = await W.checkNow(HOST, { readers: realMake(env) });
  assert.equal(c1.ok, true);
  assert.ok(state.watches[0].seen_at && state.watches[0].seen_keys.includes('quake:us1'), 'the first look stored its baseline in the account');
  assert.equal(toasts.length, 0, 'and announced nothing');
  const c2 = await W.checkNow(HOST, { readers: realMake(later.env) });
  assert.equal(W.freshCount(), 1);
  assert.equal(toasts.length, 1, 'the new quake is announced');
  assert.match(toasts[0], /^Watched place · Home: M5\.8 earthquake/);
  await W.checkNow(HOST, { readers: realMake(later.env) });
  assert.equal(toasts.length, 1, 'the same record is not announced twice on this device');
  assert.equal(c2.run.results[0].ev.fresh.length, 1);
  const seenR = await W.markSeen(HOST);
  assert.deepEqual(seenR, { ok: true, cleared: 1 });
  assert.equal(W.freshCount(), 0);
  assert.ok(state.watches[0].seen_keys.includes('quake:us9'), '«mark seen» is stored in the account, so other devices agree');
  await W.checkNow(HOST, { readers: realMake(later.env) });
  assert.equal(W.freshCount(), 0, 'a seen record stays seen');

  const d = W.digestData(run2);
  assert.equal(d.places[0].fresh[0].ref.type, 'earthquake');
  assert.equal(JSON.parse(JSON.stringify(d)).places[0].fresh[0].key, 'quake:us9', 'the digest Atlas receives is plain data');

  assert.equal((await W.unwatch(HOST.DB, ['pA'])).removed, 1);
  assert.equal(state.watches.length, 0);
});

test('⑤ the Atlas capabilities, evaluated', async () => {
  const PLACES = (await import('../js/atlas-cap-places.js')).default;
  const cap = (id) => PLACES.find((e) => e.row[0] === id);
  const ids = ['places.watch', 'places.unwatch', 'places.watchDigest', 'places.watchSeen'];
  ids.forEach((id) => assert.ok(cap(id), id + ' is declared'));
  assert.deepEqual(ids.map((id) => cap(id).row[7]), ['persist', 'persist', 'read', 'persist'], 'the digest only reads; watching, unwatching and «seen» persist');
  const kernel = (HOST, extra) => Object.assign({ HOST, esc: (s) => String(s), R: (ok, html, x) => Object.assign({ ok: !!ok, html: html || '' }, x || null), note: (s) => s, warn: (s) => s }, extra || null);
  for (const id of ids) {
    const r = await cap(id).run({ name: 'Home' }, {}, kernel({ lang: 'en', user: null }));
    assert.equal(r.meta.code, 'SIGN_IN_REQUIRED', id + ': signed out is input only the reader can give');
  }
  const r0 = await cap('places.watch').run({}, {}, kernel({ lang: 'en', user: { id: 'u' }, DB: fakeDB({ places: [], watches: [], news: [], clock: 0 }) }));
  assert.equal(r0.meta.code, 'NEEDS_INPUT', 'no place named → asked for, never the map centre');
  const r1 = await cap('places.unwatch').run({}, {}, kernel({ lang: 'en', user: { id: 'u' } }));
  assert.equal(r1.meta.code, 'NEEDS_INPUT', 'unwatch never defaults to «everything»');

  const state = { clock: 0, places: [TOKYO], watches: [], news: [] };
  const HOST = { lang: 'en', user: { id: 'u' }, DB: fakeDB(state), imToast: () => { } };
  const K = kernel(HOST);
  const notWatched = await cap('places.unwatch').run({ name: 'Home' }, {}, K);
  assert.equal(notWatched.meta.code, 'ALREADY_DONE', 'unwatching a place that is not watched says so');
  assert.equal(cap('places.watch').schema().properties.quakeMinMag.anyOf[1].enum[0], 'off', 'a kind can be turned off by name');
  const missing = await cap('places.watch').run({ name: 'Nowhere' }, {}, K);
  assert.equal(missing.meta.code, 'NOT_FOUND', 'a saved-place name that matches nothing is not guessed into a geocode');
});

test('⑥ the doors: on demand, every writing control declares its effect, no model asked', () => {
  const auth = read('js/auth-ui.js'), places = read('js/my-places.js'), pw = read('js/place-watch.js');
  for (const [src, where] of [[auth, 'js/auth-ui.js'], [places, 'js/my-places.js']]) {
    assert.match(src, /import\('\.\/place-watch\.js'\)/, where + ' reaches the module by a dynamic import');
    assert.doesNotMatch(src, /^import[^;]*'\.\/place-watch\.js'/m, where + ' does not put it on the boot path');
  }
  assert.match(codeOnly(auth, { lang: 'js' }), /if\(HOST\.user\) import\('\.\/place-watch\.js'\)\.then\(M=>M\.startWatching\(HOST\)\)/, 'the watcher starts for a signed-in reader only');
  for (const b of ['check', 'seenAll', 'seen', 'pause', 'stop', 'save', 'b']) assert.match(pw, new RegExp('\\b' + b + "\\.dataset\\.effect = 'private'"), b + ' declares that it writes the reader\'s own rows');
  /* no AI anywhere in the product */
  assert.doesNotMatch(codeOnly(pw, { lang: 'js' }), /ai-proxy|aiCall|IntMapAI/, 'the page decides and words it from the records — no model is asked');
  assert.doesNotMatch(codeOnly(read('supabase/functions/_shared/place-watch.js'), { lang: 'js' }), /fetch\(|Date\.now\(|window\.|Deno\./, 'the rules are pure: no network, no clock, no page, no runtime');
});
