/* ============================================================================
 *  IntMap · place-card-unify — one place card, one reader of the earthquakes and the news, RUN (not read)
 * ----------------------------------------------------------------------------
 *  The place profile and «Here, now» were two cards for one point (two reverse geocodes, two time-zone reads, two
 *  tables of reason codes), and the USGS week feed / the news window had five readers between them, the watched
 *  places and Atlas. What this file holds, each by evaluating the code:
 *    ① ONE read of the USGS feed answers the card, the watched places and research.related in one session (and two
 *      callers that arrive together share the request); a read past the freshness window reads again
 *    ② a window the feed does not hold (more than 7 days, below M2.5) is said — `unavailable('window-beyond-feed')` —
 *      not silently cut to what the feed has; a shorter window is cut by the clock
 *    ③ «nothing near» and «the source did not answer» are two different states, for both readers
 *    ④ the news window is read page by page for the watched places too (they used to read ONE page and stop)
 *    ⑤ a position from the device sends no exact coordinate anywhere and reads no layer tile; a point picked on the
 *      map is sent as picked (the place profile's rule)
 *    ⑥ research.placeProfile and research.hereNow hand Atlas the SAME record (the same sections, the same values)
 *    ⑦ the long-press menu has ONE entry for the card, and the five copies of the great-circle distance are one
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.window = globalThis;
globalThis.document = globalThis.document || { getElementById: () => null, body: { contains: () => false }, baseURI: 'https://example.test/IntMap/', readyState: 'complete',
  createElement: () => ({ set textContent(_) {}, set id(_) {} }), head: { appendChild() {} } };
const EN = await import('../js/events-near.js');
const PC = await import('../js/place-dossier.js');
const PW = await import('../js/place-watch.js');
const { default: caps } = await import('../js/atlas-cap-research.js');
const { worldObjects } = await import('../js/atlas-world-objects.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');
NominatimGate.configure({ gapMs: 0, reset: true });
const entry = (id) => caps.find((e) => e.row[0] === id);

const NOW = Date.parse('2026-10-04T00:00:00Z');
const quake = (id, lng, lat, mag, hoursAgo) => ({ id, type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat, 10] }, properties: { mag, place: 'near ' + id, time: NOW - hoursAgo * 3600e3, url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id } });
const FEED = { type: 'FeatureCollection', features: [quake('tokyo', 139.9, 35.5, 4.6, 2), quake('old', 139.8, 35.6, 3.1, 100), quake('cal', -120, 36, 5.2, 1)] };
function counted(feed) { const urls = []; return { urls, json: async (u) => { urls.push(u); await new Promise((r) => setTimeout(r, 5)); if (feed instanceof Error) throw feed; return feed; } }; }

/* ══ ① ══ */
test('① one read of the USGS feed answers the card, the watched places and research.related', async () => {
  const net = counted(FEED);
  EN.EventsNear.configure({ json: net.json, now: () => NOW });
  const [a, b] = await Promise.all([EN.readQuakes({ area: { point: { lng: 139.7, lat: 35.7 }, radiusKm: 300 } }), EN.readQuakes({})]);
  assert.equal(net.urls.length, 1, 'two callers that arrive together share one request');
  assert.deepEqual(a.items.map((x) => x.id), ['tokyo', 'old'], 'the area is applied here, newest first');
  assert.equal(b.items.length, 3, 'no area → the whole feed');
  /* the watched places' reader (the app's shared instance) and Atlas's research.related */
  const pw = await PW.makeReaders({ window: {} }).quake();
  assert.equal(pw.state, 'ok'); assert.equal(pw.data.features.length, 3, 'the watched places get the feed as USGS published it');
  worldObjects.clear();
  const subj = worldObjects.register(worldObjects.fromPlace({ lng: 139.7, lat: 35.7, name: 'Tokyo' }))[0];
  const K = { R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), warn: (x) => x, L: (en) => en, esc: (x) => String(x), HOST: { globalData: [] } };
  const rel = await entry('research.related').run({ ref: subj.ref }, {}, K);
  assert.equal(rel.ok, true); assert.ok(rel.exec.worldObjects.related.some((x) => x.type === 'earthquake'), 'the quake near Tokyo is related');
  assert.equal(net.urls.length, 1, 'still ONE request: the card, the watched places and Atlas read one copy');
  assert.equal(EN.EventsNear.fetchCount(), 1);
  /* past the freshness window it is read again — the window is USGS's own regeneration minute */
  let t = NOW;
  const net2 = counted(FEED);
  EN.EventsNear.configure({ json: net2.json, now: () => t });
  await EN.readQuakes({}); t += EN.QUAKE_FEED_TTL_MS - 1; await EN.readQuakes({});
  assert.equal(net2.urls.length, 1);
  t += 2; await EN.readQuakes({});
  assert.equal(net2.urls.length, 2, 'a read older than the feed\'s minute is not reused');
  assert.equal(EN.QUAKE_FEED_TTL_MS, 60000);
});

/* ══ ② ══ */
test('② a window the feed does not hold is said, not cut; a shorter window is cut by the clock', async () => {
  const net = counted(FEED);
  EN.EventsNear.configure({ json: net.json, now: () => NOW });
  for (const o of [{ days: 30 }, { minMag: 1 }, { days: 8, minMag: 4 }]) {
    const r = await EN.readQuakes(o);
    assert.deepEqual([r.state, r.reason], ['unavailable', 'window-beyond-feed'], JSON.stringify(o));
    assert.deepEqual(r.items, []);
  }
  assert.equal(net.urls.length, 0, 'a question the feed cannot answer is not sent');
  const day = await EN.readQuakes({ days: 1 });
  assert.deepEqual(day.items.map((x) => x.id).sort(), ['cal', 'tokyo'], 'the 100-hour-old quake is outside one day');
  const strong = await EN.readQuakes({ minMag: 5 });
  assert.deepEqual(strong.items.map((x) => x.id), ['cal']);
});

/* ══ ③ ══ */
test('③ «nothing near» and «did not answer» are two states, for the feed and for the news', async () => {
  EN.EventsNear.configure({ json: counted(FEED).json, now: () => NOW });
  const sea = await EN.readQuakes({ area: { point: { lng: 0, lat: -60 }, radiusKm: 300 } });
  assert.deepEqual([sea.state, sea.reason, sea.scanned], ['none', 'none-within-reach', 3]);
  EN.EventsNear.configure({ json: counted(Object.assign(new Error('down'), { reason: 'timeout' })).json });
  const down = await EN.readQuakes({ area: { point: { lng: 0, lat: -60 }, radiusKm: 300 } });
  assert.deepEqual([down.state, down.reason], ['unavailable', 'timeout']);
  EN.EventsNear.configure({ json: counted({ nope: 1 }).json });
  assert.deepEqual([(await EN.readQuakes({})).state, (await EN.readQuakes({})).reason], ['unavailable', 'parse'], 'a body that is not a feed is not «no quakes»');
  const noDb = await EN.readNewsEvents({ db: null });
  assert.deepEqual([noDb.state, noDb.reason], ['unavailable', 'no-database-client']);
  const refused = await EN.readNewsEvents({ db: db([], { error: { message: 'x', code: '42501' } }) });
  assert.deepEqual([refused.state, refused.reason, refused.code], ['unavailable', 'http', '42501']);
  const empty = await EN.readNewsEvents({ db: db([[]]), area: { point: { lng: 0, lat: 0 }, radiusKm: 10 } });
  assert.deepEqual([empty.state, empty.reason], ['none', 'none-within-reach']);
  /* the vocabulary is one object */
  assert.deepEqual(Object.values(EN.STATE), ['ok', 'none', 'unavailable']);
});

/* a stand-in news_events table: `pages` are returned one per request; every filter is recorded */
function db(pages, opt) {
  const calls = []; let n = 0;
  return { calls, from(t) {
    const q = { t, f: [] };
    for (const m of ['select', 'eq', 'is', 'not', 'gte', 'order']) q[m] = (...a) => { q.f.push([m, ...a]); return q; };
    q.range = (a, b) => { q.r = [a, b]; return q; };
    q.then = (res, rej) => { calls.push(q); if (opt && opt.error) return Promise.resolve({ data: null, error: opt.error }).then(res, rej); return Promise.resolve({ data: pages[n++] || [], error: null }).then(res, rej); };
    return q;
  } };
}
const rows = (k, lng, lat, n) => Array.from({ length: n }, (_, i) => ({ public_id: k + i, representative_title: 't' + i, rep_lng: lng, rep_lat: lat, independent_source_count: 3, status: 'active', last_article_at: new Date(NOW).toISOString() }));

/* ══ ④ ══ */
test('④ the watched places read the whole news window page by page — not the first 1,000 rows', async () => {
  EN.EventsNear.configure({ json: counted(FEED).json, now: () => NOW });
  /* 1,000 far away, then 3 near Tokyo on the second page: the first page alone would have missed them */
  const D = db([rows('far', 2.35, 48.85, 1000), rows('near', 139.7, 35.7, 3)]);
  const nw = await PW.makeReaders({ window: {} }).news(D, 2);
  assert.equal(nw.state, 'ok'); assert.equal(nw.rows.length, 1003); assert.equal(nw.truncated, false);
  assert.deepEqual(D.calls.map((c) => c.r), [[0, 999], [1000, 1999]]);
  assert.ok(D.calls[0].f.some((f) => f[0] === 'gte' && f[1] === 'independent_source_count' && f[2] === 2), 'the outlet threshold is still asked of the database');
  assert.ok(!D.calls[0].f.some((f) => /rep_l(at|ng)/.test(String(f[1])) && f[0] !== 'not' && f[0] !== 'select'), 'nothing about a position is sent');
  const { newsItems } = await import('../supabase/functions/_shared/place-watch.js');
  assert.equal(newsItems(nw.rows, { lng: 139.75, lat: 35.68 }, { news_min_sources: 2 }).length, 3, 'the rule (unchanged) finds the events past the first page');
  /* the fence is said */
  const big = db(Array.from({ length: EN.NEWS_PAGES + 1 }, (_, i) => rows('p' + i, 0, 0, EN.NEWS_PAGE)));
  const cut = await EN.readNewsEvents({ db: big });
  assert.deepEqual([cut.truncated, big.calls.length, cut.scanned], [true, EN.NEWS_PAGES, EN.NEWS_PAGES * EN.NEWS_PAGE]);
});

/* ══ ⑤ ══ */
function world(over) {
  const sent = [], wx = [], sampled = [];
  globalThis.fetch = async (url) => { sent.push(String(url)); return { ok: true, status: 200, type: 'basic', body: null, text: async () => JSON.stringify({ name: 'Minato', licence: 'ODbL', address: { suburb: 'Shiba', city: 'Tokyo', postcode: '105-0011', country: 'Japan', country_code: 'jp' } }) }; };
  window.IntMapWx = { point: async (lat, lng) => { wx.push([lat, lng]); return { current: { temperature_2m: 20, weather_code: 1 }, daily: {}, timezone: 'Asia/Tokyo', utc_offset_seconds: 32400, _src: 'Open-Meteo' }; },
    sunTimes: () => ({ sunrise: new Date('2026-10-03T20:40:00Z'), sunset: new Date('2026-10-04T08:20:00Z'), daylightSec: 42000 }) };
  window.IntMapHistCities = { near: () => [], ensure: async () => {}, ready: () => true, rights: () => [] };
  window.IntMapLayers = { sampleAt: async (x, y) => { sampled.push([x, y]); return [{ id: 'elevation', value: '20 m', number: 20, unit: 'm' }]; }, state: () => ({}), active: () => [], list: () => ['elevation'] };
  const HOST = Object.assign({ lang: 'en', fmtLL: (x, y) => y.toFixed(5) + ', ' + x.toFixed(5), demElevAt: () => 20, DB: db([[]]) }, over || {});
  EN.EventsNear.configure({ json: async () => FEED, now: () => NOW });
  return { sent, wx, sampled, HOST };
}
test('⑤ a position from the device sends no exact coordinate and reads no layer tile; a picked point is sent as picked', async () => {
  const exact = { lng: 139.745433, lat: 35.658585 };
  for (const from of ['device', 'shared']) {
    const w = world();
    const rec = await PC.placeProfile(Object.assign({ from }, exact), w.HOST);
    for (const u of w.sent) assert.ok(u.indexOf('35.658') < 0 && u.indexOf('139.745') < 0, from + ': the exact position is in no request: ' + u);
    assert.deepEqual(w.wx, [[35.7, 139.7]], from + ': the weather is asked for the rounded point');
    assert.match(w.sent.find((u) => /nominatim/.test(u)), /zoom=10&/);
    assert.deepEqual(w.sampled, [], from + ': no layer tile is asked for the spot');
    assert.deepEqual([rec.layers.reason, rec.elevation.status, rec.focus, rec.sent.point.gridDeg], ['position-kept-on-device', 'unavailable', 'now', 0.1]);
    assert.deepEqual(rec.quakes.items.map((x) => x.id), ['tokyo', 'old'], from + ': the quakes are still found — filtered here');
    assert.match(PC.profileHtml(rec, w.HOST), /rounded to 0\.1°/, from + ': the card says what left the device');
  }
  const w = world();
  const rec = await PC.placeProfile(Object.assign({}, exact), w.HOST);
  assert.equal(rec.at.from, 'point'); assert.equal(rec.focus, 'place');
  assert.match(w.sent.find((u) => /nominatim/.test(u)), /zoom=14&.*lat=35\.658585&lon=139\.745433/, 'a picked point: the profile\'s rule');
  assert.deepEqual(w.wx, [[35.658585, 139.745433]]);
  assert.equal(w.sampled.length, 1); assert.equal(rec.elevation.value, 20); assert.equal(rec.place.postcode, '105-0011');
  assert.ok(!/rounded to 0\.1°/.test(PC.profileHtml(rec, w.HOST)), 'no privacy sentence about a rounding that did not happen');
  /* one request to the weather source answers the time zone AND the weather (they used to be two) */
  assert.equal(w.wx.length, 1); assert.equal(rec.time.timeZone, 'Asia/Tokyo'); assert.equal(rec.weather.tempC, 20);
});

/* ══ ⑥ ══ */
test('⑥ research.placeProfile and research.hereNow hand Atlas the same record', async () => {
  const K = (HOST) => ({ R: (ok, html, extra) => Object.assign({ ok: !!ok, html: html || '' }, extra || null), warn: (x) => x, L: (en) => en, esc: (x) => String(x), HOST,
    geocode: async () => null, ensureData: async () => {}, METRICS: {}, XMET: {}, lx: (l) => l[0], fmtVal: (k, v) => String(v) });
  const w1 = world(); const a = await entry('research.placeProfile').run({ lng: 139.7, lat: 35.7 }, {}, K(w1.HOST));
  const w2 = world(); const b = await entry('research.hereNow').run({ lng: 139.7, lat: 35.7 }, {}, K(w2.HOST));
  assert.equal(a.ok, true); assert.equal(b.ok, true);
  const strip = (r) => { const o = JSON.parse(JSON.stringify(r)); delete o.asOf; delete o.focus; return o; };
  assert.deepEqual(strip(b.exec.hereNow), strip(a.exec.placeProfile), 'one gatherer, one record — only the order of the card differs');
  assert.deepEqual([a.exec.placeProfile.focus, b.exec.hereNow.focus], ['place', 'now']);
  for (const k of ['place', 'country', 'elevation', 'layers', 'time', 'weather', 'quakes', 'news', 'past']) assert.ok(a.exec.placeProfile[k] && a.exec.placeProfile[k].status, 'section ' + k + ' is in the record with a status');
  /* both bubbles draw the card's sections, and neither draws a control nothing listens to */
  for (const r of [a, b]) { assert.match(r.html, /Earthquakes nearby/); assert.match(r.html, /Layers on the map/); assert.ok(!/<button/.test(r.html)); }
  /* the two capabilities stay two (no reachable capability is removed) and hereNow still never reads the sensor unasked */
  const reg = read('js/atlas-capabilities.js');
  assert.match(reg, /\["research\.placeProfile","placeProfile",/);
  assert.match(reg, /\["research\.hereNow","hereNow",[^\]]*"explicit","place\?","","external"\]/);
});

/* ══ ⑦ ══ */
test('⑦ one menu entry for the card; one great-circle distance', () => {
  const s = read('js/tool-panel.js');
  const menu = s.slice(s.indexOf('function showContextMenu'), s.indexOf('function place('));
  assert.equal((menu.match(/import\('\.\/place-dossier\.js'\)/g) || []).length, 1, 'one entry opens the card');
  assert.ok(!/here-now|'Right now'|'いまの様子'|'Place profile'/.test(menu), 'the second entry for the same point is gone');
  assert.match(menu, /L\('About the place','地点について'\)/);
  /* the five copies */
  for (const f of ['js/volcano-intel.js', 'js/atlas-world-objects.js', 'js/atlas-cap-research.js', 'js/events-near.js', 'supabase/functions/_shared/place-watch.js']) {
    const src = read(f);
    assert.match(src, /import \{ haversineKm \} from '(\.\.\/supabase\/functions\/_shared|\.)\/great-circle\.js'/, f + ' imports the one distance');
    assert.ok(!/\b(6371|12742)\b(?!\.)/.test(codeOnly(src)), f + ' writes no Earth radius of its own');
  }
  assert.throws(() => read('js/here-now.js'), 'the second card module is gone — its names live in js/place-dossier.js');
});
