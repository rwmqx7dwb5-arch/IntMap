/* ============================================================================
 *  IntMap · mobile-next — «Here, now», «Share ▸ IntMap» and the photo's place, RUN (not read)
 * ----------------------------------------------------------------------------
 *    ① a shared link or text names its point the way each map service writes it (Google place before camera,
 *      OSM marker before view, geo: URI, bare coordinates); a short link is SAID to be unexpandable; an IntMap
 *      link opens as itself; plain text is a search
 *    ② the camera's record is read from a JPEG, from the same block inside a HEIC/AVIF container and from a WebP
 *      EXIF chunk — position AND the shutter time with the offset the file states (none invented)
 *    ③ the worker takes the share sheet's POST: the parts go to a page-owned cache and the window is sent to
 *      `?share=<id>`; an oversized second photo is dropped and counted; any other POST is not answered;
 *      activate keeps the inbox; the manifest's share_target names what the worker reads
 *    ④ «Here, now» sends only the rounded point, and only to the two sources that need one: the earthquake feed
 *      and the news are read without a position and filtered here; the elevation and the layer tiles are not read for
 *      it; every section is ok / none / unavailable (place-card-unify: the record is the ONE place card's)
 *    ⑤ the renamed-city record answers «what was this place called» by its own guard (Tokyo → Edo)
 *    ⑥ the doors reach it: the empty search field, the context menu, the shortcut, the share query, Atlas
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.window = globalThis;
globalThis.document = globalThis.document || { getElementById: () => null, body: { contains: () => false }, baseURI: 'https://example.test/IntMap/', readyState: 'complete' };
const SI = await import('../js/share-inbox.js');
/* (place-card-unify) «Here, now» is the one place card with its «now» sections first — js/place-dossier.js */
const HN = await import('../js/place-dossier.js');
const { EventsNear } = await import('../js/events-near.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');
NominatimGate.configure({ gapMs: 0, reset: true });

/* ══ ① ══ */
test('mobile-next ① a shared link or text names its point the way each service writes it', () => {
  const R = (t, o) => SI.readLocationText(t, Object.assign({ base: 'https://example.test/IntMap/' }, o || {}));
  let r = R('https://www.google.com/maps/place/Tokyo+Tower/@35.6585805,139.7454329,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d35.6585849!4d139.7454329');
  assert.equal(r.kind, 'point'); assert.equal(r.via, 'google-place'); assert.equal(r.lat, 35.6585849);
  r = R('Look https://www.google.com/maps/@48.8583701,2.2944813,15z');
  assert.deepEqual([r.kind, r.lat, r.lng, r.zoom], ['point', 48.8583701, 2.2944813, 15]);
  r = R('https://www.openstreetmap.org/?mlat=51.5007&mlon=-0.1246#map=17/51.5/-0.12');
  assert.deepEqual([r.kind, r.lat, r.lng, r.via], ['point', 51.5007, -0.1246, 'osm-marker']);
  r = R('https://www.openstreetmap.org/#map=12/40.7128/-74.0060');
  assert.deepEqual([r.lat, r.lng, r.zoom], [40.7128, -74.006, 12]);
  r = R('https://maps.apple.com/?ll=37.3349,-122.0090&q=Apple%20Park');
  assert.deepEqual([r.kind, r.lat, r.lng, r.via], ['point', 37.3349, -122.009, 'param:ll']);
  r = R('geo:34.6937,135.5023?z=12'); assert.deepEqual([r.kind, r.lat, r.lng], ['point', 34.6937, 135.5023]);
  r = R('geo:0,0?q=34.98,135.75(Kyoto)'); assert.deepEqual([r.kind, r.lat, r.label], ['point', 34.98, 'Kyoto']);
  r = R('geo:0,0?q=Shibuya+Crossing'); assert.deepEqual([r.kind, r.query], ['query', 'Shibuya Crossing']);
  r = R('Meet at 35.6812, 139.7671 tomorrow'); assert.deepEqual([r.kind, r.lat, r.lng], ['point', 35.6812, 139.7671]);
  r = R('https://maps.app.goo.gl/AbCdEf123', { title: 'Kinkaku-ji' });
  assert.equal(r.kind, 'unexpandable', 'a short link is said to be one — its target cannot be read by a page'); assert.equal(r.query, 'Kinkaku-ji');
  r = R('https://www.google.com/maps/search/?api=1&query=Louvre+Museum'); assert.deepEqual([r.kind, r.query], ['query', 'Louvre Museum']);
  r = R('https://example.test/IntMap/?v=1#v=1&c=1,2,3'); assert.equal(r.kind, 'intmap');
  r = R('https://example.test/IntMap/privacy.html'); assert.notEqual(r.kind, 'intmap', 'only the app document is «an IntMap link»');
  r = R('Kyoto Station'); assert.deepEqual([r.kind, r.query], ['query', 'Kyoto Station']);
  r = R('geo:0,0'); assert.notEqual(r.kind, 'point', '0,0 is not a place anyone shares');
  assert.equal(R('').kind, 'none');
});

/* ══ ② ══ — a TIFF block with GPS (35°39'30.9"N 139°44'43.6"E) and DateTimeOriginal + OffsetTimeOriginal */
function tiff() {
  const ents = [], data = [];
  /* little-endian TIFF built by hand: IFD0 → ExifIFD (0x8769) + GPS IFD (0x8825) */
  const b = []; const u16 = (v) => b.push(v & 255, v >> 8 & 255), u32 = (v) => b.push(v & 255, v >> 8 & 255, v >> 16 & 255, v >>> 24 & 255);
  const at = () => b.length;
  b.push(0x49, 0x49); u16(42); u32(8);
  /* IFD0: 2 entries */
  const ifd0 = at(); u16(2);
  const e0 = at(); u16(0x8769); u16(4); u32(1); u32(0);
  const e1 = at(); u16(0x8825); u16(4); u32(1); u32(0);
  u32(0);
  /* Exif IFD: 2 entries (DateTimeOriginal ASCII 20, OffsetTimeOriginal ASCII 7) */
  const exif = at(); u16(2);
  const d0 = at(); u16(0x9003); u16(2); u32(20); u32(0);
  const d1 = at(); u16(0x9011); u16(2); u32(7); u32(0);
  u32(0);
  /* GPS IFD: 4 entries */
  const gps = at(); u16(4);
  const g = []; for (const [tag, type, count] of [[1, 2, 2], [2, 5, 3], [3, 2, 2], [4, 5, 3]]) { g.push(at()); u16(tag); u16(type); u32(count); u32(0); }
  u32(0);
  const put32 = (pos, v) => { b[pos] = v & 255; b[pos + 1] = v >> 8 & 255; b[pos + 2] = v >> 16 & 255; b[pos + 3] = v >>> 24 & 255; };
  put32(e0 + 8, exif); put32(e1 + 8, gps);
  const str = (s) => { const p = at(); for (const c of s) b.push(c.charCodeAt(0)); b.push(0); return p; };
  put32(d0 + 8, str('2019:04:01 14:22:05'));
  put32(d1 + 8, str('+09:00'));
  /* N / E refs fit in the entry (count 2 ≤ 4 bytes) */
  b[g[0] + 8] = 78; b[g[2] + 8] = 69;
  const rat = (vals) => { const p = at(); for (const [n, d] of vals) { u32(n); u32(d); } return p; };
  put32(g[1] + 8, rat([[35, 1], [39, 1], [309, 10]]));
  put32(g[3] + 8, rat([[139, 1], [44, 1], [436, 10]]));
  void ents; void data;
  return Uint8Array.from(b);
}
const LAT = 35 + 39 / 60 + 30.9 / 3600, LNG = 139 + 44 / 60 + 43.6 / 3600;
function jpeg(t) { const len = t.length + 8; return Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...t, 0xFF, 0xD9]); }
const blob = (u8, type) => ({ type, name: 'p', size: u8.length, arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });

test('mobile-next ② the camera\'s record from a JPEG, a HEIC-style container and a WebP — position and shutter time', async () => {
  const t = tiff();
  for (const [what, u8] of [
    ['jpeg', jpeg(t)],
    /* ISO-BMFF: an ftyp box, filler, then the Exif item payload (4-byte offset + "Exif\0\0" + TIFF) */
    ['heic', Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, ...new Array(300).fill(7), 0, 0, 0, 6, 0x45, 0x78, 0x69, 0x66, 0, 0, ...t])],
    /* RIFF/WEBP with an EXIF chunk whose payload is the TIFF itself */
    ['webp', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, ...new Array(10).fill(0), 0x45, 0x58, 0x49, 0x46, t.length & 255, t.length >> 8, 0, 0, ...t])],
  ]) {
    const r = await SI.readPhoto(blob(u8, 'image/' + what));
    assert.equal(r.ok, true, what + ': position read');
    assert.ok(Math.abs(r.lat - LAT) < 1e-6 && Math.abs(r.lng - LNG) < 1e-6, what + ': the DMS rationals become degrees');
    assert.deepEqual(r.takenAt, { local: '2019-04-01T14:22:05', offset: '+09:00' }, what + ': the shutter time as written, with the stated offset');
  }
  const noGps = await SI.readPhoto(blob(Uint8Array.from([0xFF, 0xD8, 0xFF, 0xD9]), 'image/jpeg'));
  assert.deepEqual([noGps.ok, noGps.why], [false, 'no-exif']);
  const at = SI.takenInstant({ local: '2019-04-01T14:22:05', offset: '+09:00' });
  assert.equal(at.date.toISOString(), '2019-04-01T05:22:05.000Z'); assert.equal(at.exact, true);
  const day = SI.takenInstant({ local: '2019-04-01T14:22:05', offset: null });
  assert.deepEqual([day.date.toISOString(), day.exact], ['2019-04-01T12:00:00.000Z', false], 'no offset stated → the day, not an invented moment');
});

/* ══ ③ ══ the worker (the harness tests/installable-app-checks.test.mjs uses) */
const ORIGIN = 'https://example.test', SCOPE = ORIGIN + '/IntMap/';
function worker() {
  const handlers = {}, stores = new Map();
  const keyOf = (r) => (typeof r === 'string' ? r : r.url);
  const cacheOf = (name) => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name);
    return { match: async (r) => m.get(keyOf(r)), put: async (r, res) => { m.set(keyOf(r), res); }, keys: async () => [...m.keys()].map((url) => ({ url })), delete: async (r) => m.delete(keyOf(r)) }; };
  const caches = { open: async (n) => cacheOf(n), keys: async () => [...stores.keys()], delete: async (n) => stores.delete(n), match: async () => undefined };
  const self = { addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, skipWaiting() {}, clients: { claim: async () => {} },
    registration: { scope: SCOPE }, location: { origin: ORIGIN }, navigator: { onLine: true, storage: { estimate: async () => ({ usage: 0, quota: 1e12 }) } } };
  new Function('self', 'caches', 'fetch', read('sw.js'))(self, caches, async () => new Response('net'));
  const dispatch = async (type, extra) => { const waits = []; let responded = null;
    for (const h of handlers[type] || []) h(Object.assign({ waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } }, extra));
    const res = responded ? await responded : undefined; await Promise.all(waits); return { responded: !!responded, res }; };
  return { stores, dispatch, cacheOf };
}
test('mobile-next ③ the share sheet\'s POST: parts to a page cache, the window to ?share=<id>', async () => {
  const man = JSON.parse(read('manifest.webmanifest'));
  assert.equal(man.share_target.method, 'POST'); assert.equal(man.share_target.enctype, 'multipart/form-data');
  const action = new URL(man.share_target.action, SCOPE).href, field = man.share_target.params.files[0].name;
  assert.ok(man.shortcuts.some((s) => /[?&]here=1/.test(s.url)), 'the long-press shortcut opens «Here, now»');
  const W = worker();
  const fd = new FormData();
  fd.set(man.share_target.params.title, 'Tokyo Tower'); fd.set(man.share_target.params.text, 'look'); fd.set(man.share_target.params.url, 'https://www.google.com/maps/@35.65,139.74,15z');
  fd.append(field, new File([jpeg(tiff())], 'IMG_1.jpg', { type: 'image/jpeg' }));
  fd.append(field, new File(['x'], 'IMG_2.jpg', { type: 'image/jpeg' }));
  const r = await W.dispatch('fetch', { request: new Request(action, { method: 'POST', body: fd }) });
  assert.ok(r.responded, 'the worker answers the POST the static host cannot');
  assert.equal(r.res.status, 303);
  const loc = r.res.headers.get('location'); const id = new URL(loc).searchParams.get('share');
  assert.ok(id && loc.indexOf(SCOPE + '?share=') === 0, 'the window is sent to the app with the inbox id');
  const inbox = W.stores.get('intmap-page-share-inbox');
  assert.ok(inbox, 'a page-owned cache name (PAGE_CACHE_PREFIX) — js/share-inbox.js reads the same name');
  assert.match(read('js/share-inbox.js'), /'intmap-page-share-inbox'/);
  const meta = await inbox.get(SCOPE + '__share/' + id + '/meta').json();
  assert.deepEqual([meta.title, meta.url, meta.files.length, meta.dropped], ['Tokyo Tower', 'https://www.google.com/maps/@35.65,139.74,15z', 1, 1], 'one photo kept, the second counted as dropped');
  assert.ok(inbox.has(meta.files[0].key));
  /* any other POST is the network's, as before */
  const other = await W.dispatch('fetch', { request: new Request(SCOPE + 'other', { method: 'POST', body: 'x' }) });
  assert.equal(other.responded, false);
  /* activate keeps the inbox */
  await W.dispatch('activate', {});
  assert.ok(W.stores.has('intmap-page-share-inbox'), 'activate does not drop a share that has not been opened yet');
});

/* ══ ④ ══ */
test('mobile-next ④ «Here, now» sends only the rounded point, and only where a point is needed', async () => {
  const sentUrls = [], wxArgs = [], dbCalls = [];
  globalThis.fetch = async (url) => {
    const u = String(url); sentUrls.push(u);
    if (/nominatim/.test(u)) return { ok: true, status: 200, type: 'basic', text: async () => JSON.stringify({ name: 'Minato', address: { city_district: 'Minato', city: 'Tokyo', country: 'Japan', country_code: 'jp' } }), body: null };
    if (/usgs/.test(u)) return { ok: true, status: 200, type: 'basic', text: async () => JSON.stringify({ features: [
      { id: 'near', geometry: { coordinates: [139.9, 35.5, 40] }, properties: { mag: 4.1, place: 'near Tokyo', time: Date.now() - 3600e3 } },
      { id: 'far', geometry: { coordinates: [-120, 36, 5] }, properties: { mag: 5, place: 'California', time: Date.now() } }] }), body: null };
    return { ok: false, status: 404, type: 'basic', text: async () => '', body: null };
  };
  window.IntMapWx = { point: async (lat, lng) => { wxArgs.push([lat, lng]); return { current: { temperature_2m: 18.2, weather_code: 1, wind_speed_10m: 9 }, daily: {}, timezone: 'Asia/Tokyo', utc_offset_seconds: 32400, _src: 'Open-Meteo' }; },
    sunTimes: () => ({ sunrise: new Date('2026-10-03T20:40:00Z'), sunset: new Date('2026-10-04T08:20:00Z'), daylightSec: 42000 }) };
  const chain = (rows) => { const q = { calls: [] }; ['select', 'eq', 'is', 'not', 'gte', 'order', 'limit', 'range'].forEach((m) => { q[m] = (...a) => { dbCalls.push([m, ...a]); return q; }; }); q.then = (res) => res({ data: rows, error: null }); return q; };
  const HOST = { lang: 'en', fmtLL: (x, y) => y.toFixed(5) + ', ' + x.toFixed(5), DB: { from: (t) => { dbCalls.push(['from', t]); return chain([
    { public_id: 'e1', representative_title: 'Near event', rep_lng: 139.7, rep_lat: 35.7, last_article_at: new Date().toISOString(), independent_source_count: 3 },
    { public_id: 'e2', representative_title: 'Far event', rep_lng: 2.35, rep_lat: 48.85, last_article_at: new Date().toISOString() }]); } } };
  window.IntMapHistCities = { near: () => [{ id: 'tokyo', today: 'Tokyo', metres: 2500, guard: 20000, spans: [{ name: 'Edo', f: 14570101, t: 18671231, p: 'yy', src: 'h' }] }], ensure: async () => {}, ready: () => true, rights: () => [] };
  const exact = { lng: 139.745433, lat: 35.658585, from: 'device', accuracyM: 12 };
  EventsNear.configure({});   /* a fresh session: the feed is read by this record, not reused from another test */
  const rec = await HN.hereNow(exact, HOST);
  /* what left the device */
  const sent = HN.sentPoint(exact);
  assert.deepEqual([sent.lat, sent.lng], [35.7, 139.7]);
  assert.deepEqual(wxArgs, [[35.7, 139.7]], 'the weather is asked for the rounded point only');
  const nomi = sentUrls.find((u) => /nominatim/.test(u));
  assert.match(nomi, /lat=35\.7000&lon=139\.7000/); assert.match(nomi, /zoom=10/);
  for (const u of sentUrls) assert.ok(u.indexOf('35.658') < 0 && u.indexOf('139.745') < 0, 'the exact fix is in no request: ' + u);
  assert.ok(!sentUrls.some((u) => /usgs/.test(u) && /lat|lon/.test(u)), 'the earthquake feed is read whole — no position in its URL');
  assert.deepEqual([rec.layers.status, rec.layers.reason, rec.elevation.status], ['unavailable', 'position-kept-on-device', 'unavailable'], 'the layer and elevation tiles would name the spot — they are not read, and the card says why');
  assert.equal(rec.focus, 'now'); assert.equal(rec.place.postcode, null, 'a kept position is not given a postcode finer than what was sent');
  assert.ok(!dbCalls.some((c) => /rep_l(at|ng)/.test(String(c[1])) && c[0] !== 'not' && c[0] !== 'select'), 'the news query filters by nothing about the position');
  /* what was found, filtered here */
  assert.equal(rec.quakes.status, 'ok'); assert.deepEqual(rec.quakes.items.map((x) => x.id), ['near']);
  assert.equal(rec.news.status, 'ok'); assert.deepEqual(rec.news.items.map((x) => x.publicId), ['e1']);
  assert.equal(rec.weather.tempC, 18.2); assert.equal(rec.weather.timeZone, 'Asia/Tokyo');
  assert.equal(rec.place.name, 'Minato'); assert.equal(rec.past.spans[0].name, 'Edo');
  assert.equal(rec.reachKm, 300); assert.equal(rec.at.from, 'device');
  assert.deepEqual(JSON.parse(JSON.stringify(rec)).quakes.items[0].id, 'near', 'the record is JSON — the same object Atlas is handed');
  /* the card's text: every section drawn, holes said */
  const html = HN.profileHtml(rec, HOST);
  for (const w of ['Weather now', 'Earthquakes nearby', 'News nearby', 'This place in the past', 'Edo', 'Near event', 'stays on this device']) assert.ok(html.includes(w), 'drawn: ' + w);
  assert.ok(!/<button[^>]*data-hn/.test(HN.profileHtml(rec, HOST, { inert: true })), 'Atlas\'s bubble draws no button nothing listens to');
  /* a source that does not answer is a reason, not a blank */
  window.IntMapWx = { point: async () => null, sunTimes: () => null };
  HOST.DB = null;
  globalThis.fetch = async () => { throw Object.assign(new Error('x'), { reason: 'network' }); };
  window.IntMapHistCities = { near: () => [], ensure: async () => {}, ready: () => true, rights: () => [] };
  EventsNear.configure({});   /* the good feed above is not reused: this is the session where USGS is unreachable */
  const bad = await HN.hereNow({ lng: 10, lat: 10, from: 'device' }, HOST);
  assert.deepEqual([bad.weather.status, bad.quakes.status, bad.news.status, bad.past.status, bad.time.status], ['unavailable', 'unavailable', 'unavailable', 'none', 'unavailable']);
  assert.equal(bad.time.sunWhy, 'sun-model-not-loaded');
  assert.equal(bad.news.reason, 'no-database-client'); assert.equal(bad.past.reason, 'no-recorded-renaming-here');
});

/* ══ ⑤ ══ the record itself, through the module that owns it */
test('mobile-next ⑤ the renamed-city record answers by its own guard — Tokyo was Edo', async () => {
  const data = read('data/hist-cities.json');
  delete window.IntMapHistCities;
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(data) });
  await import('../js/hist-cities.js?' + Date.now());
  const HC = window.IntMapHistCities;
  await HC.ensure();
  const hit = HC.near(139.75, 35.68, 'jp');
  assert.ok(hit.length && hit[0].id === 'tokyo', 'a point in central Tokyo is the record\'s Tokyo');
  assert.ok(hit[0].spans.some((s) => s.name === '江戸'), 'its former name, in the reader\'s language where a source wrote it');
  assert.deepEqual(HC.near(0, -60, 'en'), [], 'the Southern Ocean was never renamed');
  assert.ok(HC.rights().some((r) => /Pleiades/.test(r.publisher)), 'the record states its sources, for the credit');
  globalThis.fetch = prevFetch;
  /* the year a span puts the map in, and its text: open ends are not given a date */
  assert.equal(HN.spanYear({ f: 14570101, t: 18671231, p: 'yy' }), 1867);
  assert.equal(HN.spanYear({ f: 0, t: 18681231, p: '-y' }), 1868);
  assert.equal(HN.spanYear({ f: 0, t: 0, p: '--' }), null);
  assert.equal(HN.spanYear({ f: -3300101, t: 0, p: 'y-' }), -330, 'a BC start, astronomical');
});

/* ══ ⑥ ══ */
test('mobile-next ⑥ the doors: the empty field, the context menu, the shortcut, the share query, Atlas', () => {
  assert.match(read('js/search-geocode.js'), /import\('\.\/here-entry\.js'\)/, 'the empty search field shows the two rows');
  assert.match(read('js/here-entry.js'), /data-hn-entry="here"[\s\S]*data-hn-entry="photo"/);
  /* (place-card-unify) the context menu opens THE place card for the pressed point (its «now» sections included); the device
     doors open the same card with «now» first */
  const tp = read('js/tool-panel.js');
  assert.match(tp, /import\('\.\/place-dossier\.js'\)\.then\(m=>m\.openPlaceDossier\(HOST,\{lng:lngLat\.lng,lat:lngLat\.lat\}\)\)/, 'the context menu opens it for the pressed point');
  assert.ok(!/here-now/.test(tp), 'and no second card for the same point');
  assert.match(read('js/here-entry.js'), /import\('\.\/place-dossier\.js'\)\.then\(\(m\) => m\.openHereNow\(HOST\)\)/);
  assert.match(read('js/share-inbox.js'), /import \{ whenMapReady, openHereNow \} from '\.\/place-dossier\.js'/);
  const main = read('src/main.js');
  assert.match(main, /\[\?&\]share=/); assert.match(main, /\[\?&\]here=1/);
  assert.ok(main.includes("import('../js/place-dossier.js').then((m) => m.bootFromUrl())"), 'the shortcut opens the one place card');
  const caps = read('js/atlas-capabilities.js');
  assert.match(caps, /\["research\.hereNow","hereNow",[^\]]*"explicit","place\?","","external"\]/, 'Atlas: the device position is never read unasked');
  assert.match(caps, /\["view\.openShared","openShared",/);
  /* the host door is set where the host is made */
  assert.match(read('js/app-body.js'), /setHost\(IM_HOST\);/);
});

/* ══ ④b ══ the window is read page by page (PostgREST answers at most 1000 rows), and a cut is said */
test('mobile-next ④b the news window is read page by page until a short page; past the fence it says it was cut', async () => {
  window.IntMapWx = { point: async () => null, sunTimes: () => null };
  globalThis.fetch = async () => { throw Object.assign(new Error('x'), { reason: 'network' }); };
  window.IntMapHistCities = { near: () => [], ensure: async () => {}, ready: () => true, rights: () => [] };
  EventsNear.configure({});
  const run = async (sizes) => {
    const ranges = []; let call = 0;
    const DB = { from: () => { const q = {}; ['select', 'eq', 'is', 'not', 'gte', 'order'].forEach((m) => { q[m] = () => q; });
      q.range = (a, b) => { ranges.push([a, b]); return q; };
      q.then = (res) => { const n = sizes[call++] ?? 0; res({ data: Array.from({ length: n }, (_, i) => ({ public_id: 'p' + call + '-' + i, representative_title: 't', rep_lng: 139.7, rep_lat: 35.7, last_article_at: new Date().toISOString() })), error: null }); };
      return q; } };
    const rec = await HN.hereNow({ lng: 139.7, lat: 35.7 }, { lang: 'en', fmtLL: () => '', DB });
    return { rec, ranges };
  };
  const a = await run([1000, 1000, 7]);
  assert.deepEqual(a.ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.deepEqual([a.rec.news.scanned, a.rec.news.truncated, a.rec.news.count], [2007, false, 2007]);
  const b = await run([1000, 1000, 1000, 1000, 1000, 1000]);
  assert.deepEqual([b.ranges.length, b.rec.news.truncated], [5, true], 'the fence stops the read and the record says so');
  assert.ok(HN.profileHtml(b.rec, { lang: 'en', fmtLL: () => '' }).includes('Only the newest 5000 events were read.'));
});
