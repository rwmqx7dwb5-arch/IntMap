/* ============================================================================
 *  IntMap · #R291 — the routing subsystem, verified without a browser
 * ----------------------------------------------------------------------------
 *  「経路計算、UI表示、Atlas表示で異なる結果や状態を持たせない。」
 *  「新規テストは、外部サービスへ依存しない決定的なテストを中心にしてください。」
 *
 *  The four pure modules this round adds — the store, the provider capability table, the shared
 *  render layer and the export — touch no DOM, no renderer and no network, which is the property
 *  that lets §24.1's whole list be answered here instead of through a browser boot. What is left
 *  for tests/smoke.spec.js is only what genuinely needs a page: the entry in Layers → Tools, the
 *  combobox keyboard, the bottom sheet and the map's own layers.
 *
 *  ⚠ SOURCES ARE READ THROUGH scripts/eol.mjs (#R283) — line endings belong to the checkout.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readLF } from '../scripts/eol.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (p) => readLF(resolve(ROOT, p));
/* ⚠ AN «X IS GONE» CHECK MUST READ THE CODE, NOT THE NOTE THAT SAYS X IS GONE.
   Every such assertion in this project has, at some point, been satisfied or defeated by its own
   explanatory comment ([[intmap-recurring-lessons]] records the shape fourteen times, and three of
   the checks below hit it on their first run: `<style>` matched 「this file adds no <style>」,
   `max="2025"` matched 「max="2025"の固定値を廃止し」, `.rp-close').onclick` matched the sentence
   describing the handler that was deleted). So the negative checks read a comment-free copy. */
const bare = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:'"\\`])\/\/.*$/, '$1')).join('\n');

/* ── the browser shim these four modules need, and nothing more ─────────────────────────────────
   `pick` / `t` reproduce js/lang-registry.js's positional rule for the five languages the call
   sites carry; a language past them falls to English, exactly as the registry does when its inline
   table has no row. Nothing under test depends on WHICH language it gets — only that it gets one. */
const IDX = { en: 0, jp: 1, de: 2, ru: 3, es: 4 };
function makeWindow() {
  const w = {};
  w.IntMapLang = {
    pick(get) {
      const f = function () {
        const i = IDX[(() => { try { return get(); } catch { return 'en'; } })()];
        const v = (i != null && i > 0) ? arguments[i] : null;
        return (v != null && v !== '') ? v : arguments[0];
      };
      f.arr = (a) => (Array.isArray(a) ? f.apply(null, a) : String(a == null ? '' : a));
      return f;
    },
    t(lang, ...a) { const i = IDX[lang]; return (i != null && a[i] != null && a[i] !== '') ? a[i] : a[0]; },
    pickArgs() { return function () { return Array.prototype.slice.call(arguments); }; },
    locale(l, d) { return ({ en: 'en-GB', jp: 'ja-JP', de: 'de-DE', ru: 'ru-RU', es: 'es-ES' })[l] || d || 'en'; },
  };
  return w;
}
function load(w, ...files) {
  for (const f of files) {
    const src = readFileSync(resolve(ROOT, f), 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'Intl', 'Date', 'Math', 'console', src)(w, Intl, Date, Math, console);
  }
  return w;
}
function fresh() {
  return load(makeWindow(), 'js/routing-store.js', 'js/routing-providers.js', 'js/routing-cards.js', 'js/routing-export.js');
}
const PLACE = (lng, lat, name) => ({ lng, lat, name, kind: 'place' });

/* ══ ① THE STORE IS THE ONE PLACE THE JOURNEY LIVES ═══════════════════════════════════════════ */
test('R291 ① the store holds a journey, and only a resolved place counts as a point', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  assert.equal(S._pure.ready(S.get()), false, 'an empty store is not routable');
  S.setText('from', 'Tok');
  assert.equal(S._pure.ready(S.get()), false, 'half-typed text is not a place');
  S.setPlace('from', PLACE(139.7671, 35.6812, 'Tokyo'));
  S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
  assert.equal(S._pure.ready(S.get()), true);
  const pts = S._pure.points(S.get());
  assert.equal(pts.length, 2);
  /* an UNRESOLVED stop is skipped rather than sent as a coordinate */
  S.addVia(null);
  assert.equal(S._pure.points(S.get()).length, 2, 'an empty stop must not become a waypoint');
  S.setPlace(0, PLACE(139.7, 35.55, 'Kawasaki'));
  assert.equal(S._pure.points(S.get()).length, 3);
});

/* ⚠ ② THE DEFECT §4.4 NAMES: a confirmed coordinate behind an edited label ───────────────────── */
test('R291 ② editing the text invalidates the coordinate that was confirmed for it', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
  assert.ok(S.get().to.place, 'the place is confirmed');
  S.setText('to', 'Yokoham');                       /* one character deleted */
  assert.equal(S.get().to.place, null, 'the old coordinate must not survive an edit');
  assert.equal(S._pure.ready(S.get()), false);
  /* …and setting the SAME text a place already carries must not clear it (a re-render writes it back) */
  S.setPlace('to', PLACE(139.638, 35.4658, 'Yokohama'));
  S.setText('to', 'Yokohama');
  assert.ok(S.get().to.place, 'writing the identical label back is not an edit');
});

/* ⚠ ③ SWAP REVERSES THE ITINERARY (§5.3) — the old panel exchanged only A and B ──────────────── */
test('R291 ③ A → 1 → 2 → B swapped is B → 2 → 1 → A, not B → 1 → 2 → A', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('from', PLACE(0, 0, 'A'));
  S.setPlace('to', PLACE(3, 3, 'B'));
  S.addVia(PLACE(1, 1, '1')); S.addVia(PLACE(2, 2, '2'));
  S.swap();
  const names = S._pure.points(S.get()).map((p) => p.name);
  assert.deepEqual(names, ['B', '2', '1', 'A']);
  S.swap();
  assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', 'B'], 'and back again');
});

test('R291 ④ a stop moves within the list, and the ends never move', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(9, 9, 'B'));
  ['1', '2', '3'].forEach((n, i) => S.addVia(PLACE(i + 1, i + 1, n)));
  S.moveVia(2, 0);
  assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '3', '1', '2', 'B']);
  S.moveVia(0, 99);                                  /* clamped, not thrown */
  assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', '3', 'B']);
  S.moveVia(-1, 0);                                  /* ignored */
  assert.deepEqual(S._pure.points(S.get()).map((p) => p.name), ['A', '1', '2', '3', 'B']);
});

/* ⚠ ⑤ A STALE ANSWER MUST NOT BECOME THE STATE (§8.3/§23) ────────────────────────────────────── */
test('R291 ⑤ a result from a superseded request is refused by the store', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(1, 1, 'B'));
  const first = S.begin('a');
  const second = S.begin('b');                        /* the reader changed something */
  assert.equal(S.settle(first, { ok: true, routeSetId: 'rs1', duration: 10 }), false,
    'the OLD request must not be able to write the state');
  assert.equal(S.get().result, null);
  assert.equal(S.settle(second, { ok: true, routeSetId: 'rs2', duration: 20 }), true);
  assert.equal(S.get().routeSetId, 'rs2');
  assert.equal(S.hasRoute(), true);
  /* …and clearing is the only thing that throws it away */
  S.clearRoute();
  assert.equal(S.hasRoute(), false);
  assert.equal(S.get().from.place.name, 'A', 'clearing the ROUTE does not clear the journey');
});

/* ⚠ ⑥ THE REQUEST IS DERIVED, SO ATLAS AND THE PANEL CANNOT BUILD DIFFERENT ONES (§17) ───────── */
test('R291 ⑥ the request options come out of the state, once', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('from', PLACE(11, 51, 'A')); S.setPlace('to', PLACE(12, 52, 'B'));
  S.addVia(PLACE(11.5, 51.5, '1'));
  S.setMode('driving'); S.setAvoid('toll', true);
  let r = S.requestOptions();
  assert.deepEqual(r.opts.avoid, ['toll']);
  assert.equal(r.opts.via.length, 1);
  assert.equal(r.opts.time, undefined, 'no time was chosen, so none is sent');
  /* transit-only options are not sent on a road request, and vice versa */
  S.setTransitModes(['RAIL']); S.setMaxWalk(800);
  r = S.requestOptions();
  assert.equal(r.opts.transitModes, undefined);
  assert.equal(r.opts.maxWalkM, undefined);
  S.setMode('transit');
  r = S.requestOptions();
  assert.deepEqual(r.opts.transitModes, ['RAIL']);
  assert.equal(r.opts.maxWalkM, 800);
  assert.equal(r.opts.avoid, undefined, 'the avoid chips are a road capability');
});

/* ⚠ ⑦ THE TIME THE READER TYPED IS IN THE APP'S ZONE, NOT THE DEVICE'S (§7.1) ────────────────── */
test('R291 ⑦ a departure time is written in the clock timezone the app is set to', () => {
  const w = fresh(); const S = w.IntMapRouteStore;
  S.setPlace('from', PLACE(0, 0, 'A')); S.setPlace('to', PLACE(1, 1, 'B'));
  S.setWhen('depart', '2026-08-21T14:30');
  const tokyo = S._pure.whenISO(S.get(), 'Asia/Tokyo');
  assert.equal(new Date(tokyo).toISOString(), '2026-08-21T05:30:00.000Z',
    '14:30 in Asia/Tokyo is 05:30Z whatever the machine running this is set to');
  const utc = S._pure.whenISO(S.get(), 'UTC');
  assert.equal(new Date(utc).toISOString(), '2026-08-21T14:30:00.000Z');
  /* ⚠ AND A DST BOUNDARY IS NOT A FIXED OFFSET: the same wall clock in New York is −4 in August
     and −5 in January, and the conversion has to read the offset AT THAT INSTANT. */
  S.setWhen('depart', '2026-08-21T12:00');
  assert.equal(new Date(S._pure.whenISO(S.get(), 'America/New_York')).toISOString(), '2026-08-21T16:00:00.000Z');
  S.setWhen('depart', '2026-01-21T12:00');
  assert.equal(new Date(S._pure.whenISO(S.get(), 'America/New_York')).toISOString(), '2026-01-21T17:00:00.000Z');
  S.setWhen('now', '');
  assert.equal(S._pure.whenISO(S.get(), 'UTC'), null, '“leave now” sends no time at all');
});

/* ══ ⑧ WHAT EACH PROVIDER CAN DO IS DATA, AND THE UI READS IT (§8.1/§14.1) ════════════════════ */
test('R291 ⑧ provider capabilities decide what may be offered, and none of them has traffic', () => {
  const w = fresh(); const P = w.IntMapRouteProviders;
  assert.equal(P.supports('driving', 'liveTraffic'), false);
  assert.equal(P.supports('transit', 'liveTraffic'), false);
  assert.ok(P.list().every((p) => p.liveTraffic === false),
    'a provider that claims live traffic must actually have it — none of these does');
  assert.equal(P.supports('driving', 'avoid'), true);
  assert.equal(P.supports('walking', 'avoid'), false, 'the toll/highway/ferry chips are driving-only');
  assert.equal(P.supports('walking', 'avoidAreas'), true, 'a drawn keep-out area works on foot too');
  assert.equal(P.supports('transit', 'arriveBy'), true);
  assert.equal(P.supports('driving', 'arriveBy'), false, 'no road provider takes an arrival time');
  assert.equal(P.supports('transit', 'realtimeTransit'), true);
  assert.ok(P.maxVia('driving') > 0 && P.maxVia('driving') < 100,
    'the stop limit is derived from a provider, not a made-up constant');
});

test('R291 ⑨ choosing a provider by capability says what choosing it costs', () => {
  const w = fresh(); const P = w.IntMapRouteProviders;
  const plain = P.forRequest({ mode: 'driving' });
  assert.equal(plain.provider.id, 'osrm');
  assert.deepEqual(plain.lost, [], 'a plain A→B keeps its alternatives');
  const withVia = P.forRequest({ mode: 'driving', via: [{}] });
  assert.deepEqual(withVia.lost, ['alternatives'], 'stops cost the alternatives on this provider (§9.2)');
  const avoiding = P.forRequest({ mode: 'driving', avoid: ['toll'] });
  assert.equal(avoiding.provider.id, 'valhalla', 'only Valhalla honours an avoid list');
  assert.deepEqual(avoiding.lost, ['alternatives']);
  assert.equal(avoiding.fallback.id, 'osrm');
  const area = P.forRequest({ mode: 'walking', avoidAreas: [[]] });
  assert.equal(area.provider.id, 'valhalla', 'a keep-out area is a capability, on foot as well');
  const transit = P.forRequest({ mode: 'transit' });
  assert.equal(transit.provider.id, 'motis');
  assert.equal(transit.fallback.id, 'jr-bridge');
});

/* ══ ⑩ THE SHARED RENDER LAYER (§17) ═════════════════════════════════════════════════════════ */
test('R291 ⑩ distances follow the measurement-units setting, in one place', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  assert.equal(C.distance(31_000, { lang: 'en', units: 'metric' }), '31 km');
  /* the two systems round the same way — one decimal under ten, whole numbers above */
  assert.equal(C.distance(31_000, { lang: 'en', units: 'imperial' }), '19 mi');
  assert.equal(C.distance(9_000, { lang: 'en', units: 'imperial' }), '5.6 mi');
  assert.equal(C.distance(31_000, { lang: 'en', units: 'both' }), '31 km (19 mi)');
  assert.equal(C.distance(420, { lang: 'en', units: 'metric' }), '420 m', 'metric flips to metres under 1 km');
  assert.equal(C.distance(120, { lang: 'en', units: 'imperial' }), '394 ft', 'imperial flips to feet');
  assert.equal(C.duration(90 * 60, { lang: 'en' }), '1 h 30 min');
  assert.equal(C.duration(45, { lang: 'en' }), '1 min');
  assert.match(C.duration(90 * 60, { lang: 'jp' }), /時間/, 'and it is translated');
});

test('R291 ⑪ an arrival time is a clock time in the app’s zone, and says so when it lands tomorrow', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  const start = Date.UTC(2026, 7, 21, 22, 0, 0);
  assert.equal(C.clock(start, { lang: 'en', tz: 'UTC' }), '22:00');
  assert.equal(C.clock(start, { lang: 'en', tz: 'Asia/Tokyo' }), '07:00', 'the same instant, the app’s zone');
  const eta = C.eta(start, 4 * 3600, { lang: 'en', tz: 'UTC' });
  assert.match(eta, /^02:00/);
  assert.match(eta, /next day/i, 'a journey that crosses midnight must say so');
  assert.equal(/next day/i.test(C.eta(start, 3600, { lang: 'en', tz: 'UTC' })), false);
});

/* ⚠ ⑫ «LIVE» IS EARNED, NEVER ASSUMED (§13.1) ────────────────────────────────────────────────── */
test('R291 ⑫ real-time, partly real-time and timetable are three different answers', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  const walk = { walk: 1, mode: 'WALK', duration: 300 };
  const live = (delay) => ({ walk: 0, mode: 'RAIL', duration: 900, rt: true, delay });
  const sched = { walk: 0, mode: 'BUS', duration: 900, rt: false, delay: 0 };
  assert.equal(C.realtimeOf([walk, sched]).kind, 'timetable');
  assert.equal(C.realtimeOf([walk, live(0)]).kind, 'live');
  assert.equal(C.realtimeOf([walk, live(3), sched]).kind, 'partial',
    'one live leg out of two does not make the itinerary live');
  assert.equal(C.realtimeOf([walk, live(3), live(7)]).delay, 7, 'the worst delay is the one to report');
  assert.equal(C.realtimeOf([walk]).kind, 'timetable', 'an all-walk plan rides nothing');
  /* a delay of zero is «on time», not «+0 min» (§13.1) */
  assert.match(C.delayText(0, { lang: 'en' }), /on time/);
  assert.match(C.delayText(4, { lang: 'en' }), /\+4/);
  assert.match(C.delayText(-2, { lang: 'en' }), /early/);
  /* only a genuinely real-time leg is badged */
  assert.equal(C.legBadge(sched, { lang: 'en' }), '');
  assert.equal(C.legBadge(walk, { lang: 'en' }), '');
  assert.match(C.legBadge(live(5), { lang: 'en' }), /rt-badge/);
});

test('R291 ⑬ an alternative card is selectable, labelled and not distinguished by colour alone', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  const alts = [{ duration: 2160, distance: 31000, label: 'Fastest', color: '#1a73e8', roads: ['A1'] },
                { duration: 2460, distance: 39000, label: '+5 min', color: '#e8710a', roads: ['E83'] }];
  const html = C.altCards(alts, { lang: 'en', units: 'metric', sel: 1, setId: 'rs7', startMs: Date.UTC(2026, 0, 1, 9, 0) });
  assert.match(html, /data-rset="rs7"/);
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) || []).length, 2);
  assert.equal((html.match(/aria-checked="true"/g) || []).length, 1, 'exactly one is selected');
  assert.match(html, /aria-checked="true" data-ai="1"/, 'and it is the one the caller named');
  assert.match(html, /aria-label="[^"]*Fastest/, 'the label is in the accessible name, not only in colour');
  assert.match(html, /rt-alt-key[^>]*>1</, 'each card carries its own number, matching the map');
  assert.match(html, /A1/, 'the road that makes this route different is named (§9.1)');
  assert.match(html, /arrive/, 'and the arrival time');
});

test('R291 ⑭ a turn is a button with an icon, a sentence and a spoken lane description', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  const mv = () => ({ icon: '→', text: 'Turn right onto A1', lane: '▯▮▮', key: 'right' });
  const html = C.stepRows([{ distance: 1200 }], { lang: 'en', units: 'metric', maneuver: mv, step: 0 });
  assert.match(html, /<button type="button" class="rt-step on"/, 'a step is a button, not a div with a click');
  assert.match(html, /aria-current="step"/);
  assert.match(html, /1\.2 km/);
  assert.match(html, /Lanes: use 2, 3 of 3/, 'the lane bars are described, not only drawn (§12/§19)');
  assert.equal(C.laneText('▯▯', { lang: 'en' }), '', 'no valid lane means nothing to say');
  assert.match(C.stepRows([{ distance: 5 }], { lang: 'en', units: 'metric', maneuver: mv }), /aria-current="false"/);
});

test('R291 ⑮ the honest notes exist for every shortfall, and none of them claims traffic', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  for (const k of ['roadTypical', 'altsViaOsrm', 'altsAvoid', 'avoidDropped', 'areaDropped',
    'motorwayPref', 'shapeGap', 'jrEstimate', 'transitTimetable', 'transitLive']) {
    assert.match(C.note(k, { lang: 'en', mode: 'driving' }), /rt-note/, k + ' must have a sentence');
    assert.match(C.note(k, { lang: 'jp', mode: 'driving' }), /rt-note/, k + ' must have a Japanese one');
  }
  assert.match(C.note('roadTypical', { lang: 'en', mode: 'driving' }), /live traffic is not included/i);
  assert.equal(C.note('nothing-like-this', { lang: 'en' }), '', 'an unknown note prints nothing rather than a stub');
  assert.match(C.providerLine('osrm', { lang: 'en' }), /OSRM/);
  assert.equal(C.providerLine('a-provider-that-does-not-exist', { lang: 'en' }), '');
});

/* ══ ⑯ EXPORT AND SHARE (§16) ════════════════════════════════════════════════════════════════ */
test('R291 ⑯ GPX and GeoJSON keep the shapes older files had, and gain the metadata', () => {
  const w = fresh(); const X = w.IntMapRouteExport;
  const payload = {
    coords: [[139.7, 35.6], [139.6, 35.5]], distance: 31000, duration: 2160,
    mode: 'driving', provider: 'osrm', avoid: ['toll'], avoidAreas: 1, liveTraffic: false,
    generatedISO: '2026-08-21T00:00:00.000Z',
    waypoints: [{ lng: 139.7, lat: 35.6, name: 'Tokyo', role: 'start' }, { lng: 139.6, lat: 35.5, name: 'Yokohama', role: 'destination' }],
  };
  const gpx = X.gpx(payload);
  assert.match(gpx, /<trk><name>IntMap route<\/name><trkseg>/, 'the shape an existing reader parses');
  assert.match(gpx, /<trkpt lat="35\.600000" lon="139\.700000"\/>/);
  assert.match(gpx, /<metadata>/);
  assert.match(gpx, /<wpt [^>]*><name>Tokyo<\/name><type>start<\/type><\/wpt>/);
  assert.match(gpx, /live_traffic=no/, 'the file says what it does NOT contain');
  const gj = JSON.parse(X.geojson(payload));
  assert.equal(gj.features[0].geometry.type, 'LineString');
  assert.equal(gj.features[0].properties.source, 'IntMap');
  assert.equal(gj.features[0].properties.distance_m, 31000);
  assert.equal(gj.features[0].properties.live_traffic, false);
  assert.equal(gj.features.filter((f) => f.geometry.type === 'Point').length, 2);
  assert.equal(X.gpx({ coords: [] }), null, 'no route is not an empty file');
});

test('R291 ⑰ a shared route carries the places and NOT the geometry, and survives a round trip', () => {
  const w = fresh(); const S = w.IntMapRouteStore; const X = w.IntMapRouteExport;
  S.setPlace('from', PLACE(139.76712345, 35.68123456, 'Tokyo Station'));
  S.setPlace('to', PLACE(135.5, 34.7335, 'Shin-Osaka'));
  S.addVia(PLACE(136.8816, 35.1706, 'Nagoya'));
  S.setMode('transit'); S.setWhen('arrive', '2026-08-21T09:00'); S.setSel(2);
  const packed = X.encodeShare(S.get());
  const wire = JSON.stringify(packed);
  assert.ok(wire.length < 400, 'a share payload must fit an address bar — it was ' + wire.length + ' bytes');
  assert.equal(/coordinates|LineString|geometry/.test(wire), false, 'no geometry travels (§16.2)');
  const back = X.decodeShare(packed);
  assert.equal(back.from.name, 'Tokyo Station');
  assert.equal(back.via.length, 1);
  assert.equal(back.via[0].name, 'Nagoya');
  assert.equal(back.mode, 'transit');
  assert.equal(back.when.kind, 'arrive');
  assert.equal(back.sel, 2);
  assert.equal(Math.abs(back.from.lng - 139.76712345) < 1e-4, true, 'about a metre of precision is kept');
  /* a hostile or truncated payload yields null rather than a half-applied journey */
  assert.equal(X.decodeShare(null), null);
  assert.equal(X.decodeShare({ f: ['x', 'y'], t: [1, 2] }), null);
  assert.equal(X.decodeShare({ f: [1, 2], t: [3, 4], m: 'teleport' }).mode, 'driving', 'an unknown mode falls back');
  assert.deepEqual(X.decodeShare({ f: [1, 2], t: [3, 4], a: ['toll', 'rockets'] }).avoid, ['toll']);
  /* what the reader is told they are sending */
  const d = X.describe(S.get());
  assert.equal(d.from, 'Tokyo Station'); assert.equal(d.stops, 1); assert.equal(d.timed, true);
});

/* ══ ⑱ THE ENTRY — §2, and the defect that made it the first thing this round did ═════════════ */
test('R291 ⑱ the official door is Layers → Tools → Directions, and nothing else was added', () => {
  const ui = read('js/map-ui.js');
  assert.match(ui, /id:'tool\.directions'/, 'the Tools list must carry the routing row');
  assert.match(ui, /run:_lazy\('routeUi'/, 'and it opens the panel through the lazy module');
  assert.match(ui, /mod:'IntMapRouteUI'/, 'so the row can read whether the panel is open');
  /* the row's own text, in the three places §2.2 names */
  assert.match(ui, /T\('Directions','経路'/);
  assert.match(ui, /Plan routes by car, transit, walking or cycling/);
  assert.match(ui, /keys:'route directions/, 'and it is findable by search (§2.2)');
  /* ⚠ NO NEW PERSISTENT FLOATING BUTTON (§0/§2.1). The routing UI's only ids are the panel and its
     candidate popup; nothing in this round creates a map-anchored button. */
  const uiSrc = read('js/routing-ui.js');
  assert.equal(/m-fab|map-fab|floating-btn|position:fixed;\s*right/.test(uiSrc), false,
    'the panel must not grow a floating map button');
  const ids = [...uiSrc.matchAll(/\.id\s*=\s*'([^']+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids, ['route-panel', 'rtp-suggest']);
});

/* ⚠ ⑲ CLOSING IS NOT CLEARING (§2.2) ─────────────────────────────────────────────────────────── */
test('R291 ⑲ only an explicit clear throws the route away', () => {
  const src = read('js/routing-ui.js');
  const close = /function close\(\)\s*\{([\s\S]*?)\n    \}/.exec(src);
  assert.ok(close, 'close() must be findable');
  assert.equal(/\bclear\(\)|clearRoute\(\)|RT\(\)\.clear\b/.test(close[1]), false,
    'closing the panel must not clear the route — that is the defect §2.2 names');
  assert.match(src, /\.rtp-clear'\)\.addEventListener\('click', clearRoute\)/,
    'and the explicit button must be the thing that does');
  /* the old panel's × called clear() — the shape must be gone from js/routing.js too */
  const r = bare('js/routing.js');
  assert.equal(/rp-close/.test(r), false, 'the old close-and-clear handler is gone from the code');
  /* the Tools row closes the PANEL, never the route */
  const ui = read('js/map-ui.js');
  assert.match(ui, /const _toolOff=\(t\)=>\{ const m=_tmod\(t\); if\(!m\|\|typeof m\.close!=='function'\) return false;/);
});

/* ⚠ ⑳ THE PANEL DOES NOT LIVE IN js/app-body.js, AND ITS STYLE IS IN THE STYLESHEET (§0/§18) ─── */
test('R291 ⑳ no new code in the app shell, and no new inline-style panel', () => {
  const body = read('js/app-body.js');
  assert.equal(/routeUi|IntMapRouteUI|routing-ui/.test(body), false,
    '「js/app-body.js へ新機能を追加しない」 — the panel is mounted by js/lazy-modules.js');
  assert.ok(body.split('\n').length <= 4400, 'the app shell’s line ceiling only ever comes down');
  const ui = bare('js/routing-ui.js');
  assert.equal(/<style|createElement\('style'\)/.test(ui), false, 'the CSS is in css/intmap.css');
  /* the panel it replaces was ~9 kB of `style="…"`; what is left is per-instance geometry only */
  const inline = [...ui.matchAll(/style="[^"]*"/g)].map((m) => m[0]);
  assert.ok(inline.length <= 6, 'inline style strings in the panel: ' + inline.length + ' — ' + inline.join(' | '));
  const css = read('css/intmap.css');
  for (const cls of ['.rtp{', '.rtp-suggest{', '.rt-alt{', '.rt-step{', '.rt-leg{', '.rtp-grip{']) {
    assert.ok(css.includes(cls), 'css/intmap.css is missing ' + cls);
  }
  assert.match(css, /@media \(max-width:767px\)\{[\s\S]*?\.rtp\{/, 'the phone layout must exist');
  assert.match(css, /env\(safe-area-inset-bottom/, 'and be safe-area aware');
  assert.match(css, /--rtp-kb/, 'and lift for the on-screen keyboard (§3.2)');
});

/* ⚠ ㉑ ONE RENDER LAYER — Atlas and the panel draw the same card (§17) ────────────────────────── */
test('R291 ㉑ Atlas and the panel call the same renderer, and neither keeps a private copy', () => {
  const atlas = read('js/atlas-console.js');
  assert.match(atlas, /window\.IntMapRouteCards\.altCards\(/, 'Atlas builds its cards from the shared layer');
  assert.match(atlas, /window\.IntMapRouteCards\.legRows\(/);
  assert.match(atlas, /window\.IntMapRouteCards\.stepRows\(/);
  const panel = read('js/routing-ui.js');
  assert.match(panel, /CD\(\)\.altCards\(/); assert.match(panel, /CD\(\)\.legRows\(/); assert.match(panel, /CD\(\)\.stepRows\(/);
  /* ⚠ AND THE ROUTER NO LONGER RENDERS. `stepRows` / `legRows` were declared in js/routing.js and
     were a second implementation of exactly these — that is the duplicate §17 forbids. */
  const r = read('js/routing.js');
  assert.equal(/function stepRows\(|function legRows\(/.test(r), false,
    'js/routing.js must not carry its own step/leg renderer any more');
  /* both surfaces share the SELECTION too, which is what lets a tap on the map drive a card */
  assert.match(r, /ST\.setSel\(i\)/, 'selectAlt writes the store');
  assert.match(r, /onLayer\('click','imroute-hit'/, 'and the map line is clickable');
});

/* ⚠ ㉒ THE MAP DRAWS WHAT THE PANEL SAYS (§5.1/§11) ──────────────────────────────────────────── */
test('R291 ㉒ every waypoint is lettered, the camera knows where the panel is, and the ends are not colour alone', () => {
  const r = read('js/routing.js');
  assert.match(r, /function _wpLabel\(i,n\)\{ return i===0\?'A':\(i===n-1\?'B':String\(i\)\); \}/,
    'A / 1 / 2 / B is one rule, shared by the marker and the field');
  assert.match(r, /id:'imroute-wp',type:'symbol'/, 'the letters are drawn on the map, not implied');
  assert.match(r, /id:'imroute-hit'/, 'and there is a touch target wider than the line');
  assert.match(r, /function setInsets/, 'the camera can be told where the panel is (§11.3)');
  assert.equal(/fitBounds\(bb,\{padding:70/.test(r), false, 'the fixed padding:70 is gone');
  assert.match(r, /fitBounds\(bb,\{padding:_pad\(/, 'and replaced by the measured one');
  /* the unselected alternatives stay visible enough to be picked */
  assert.match(r, /op:on\?1:0\.55/, 'an alternative you cannot see is not an alternative you can pick');
  const ui = read('js/routing-ui.js');
  assert.match(ui, /function applyInsets\(\)/);
  assert.match(ui, /RT\(\)\.setInsets\(\{ bottom:/, 'the phone sheet reserves the bottom');
  assert.match(ui, /RT\(\)\.setInsets\(\{ left:/, 'the desktop panel reserves the left');
});

/* ⚠ ㉓ NOTHING IS FABRICATED, AND NOTHING SILENTLY IGNORED (§0/§8.4) ─────────────────────────── */
test('R291 ㉓ an option that could not be applied is reported, not swallowed', () => {
  const r = read('js/routing.js');
  assert.match(r, /opts\._avoidDropped=true; opts\._areaDropped=true;/,
    'a keep-out area that could not be applied is distinguishable from an avoid option that could not');
  assert.match(r, /altsSuppressed:\(via\.length&&alts\.length<2\)\?'via':''/,
    'and «only one route, because you added a stop» is stated rather than left to be noticed');
  assert.match(r, /function _notesFor\(res\)/, 'the notes are computed from the RESULT');
  /* the fabrications the standing rules forbid, still forbidden */
  assert.match(r, /a broken\/absent TRANSIT leg shape is NEVER replaced by a station-to-\n[\s\S]{0,120}station straight line/,
    'the #R126 rule against a fake ride geometry must still be in force');
  const cards = read('js/routing-cards.js');
  assert.equal(/渋滞|traffic-aware|with live traffic/.test(cards.replace(/live traffic is not included[^']*/g, '')), false,
    'nothing may claim traffic awareness while no provider has traffic');
});

/* ⚠ ㉔ THE HISTORICAL YEAR CEILING IS DERIVED, NOT TYPED (§15.6) ─────────────────────────────── */
test('R291 ㉔ the historical-network year cannot be set into the future', () => {
  const ui = bare('js/routing-ui.js');
  assert.equal(/max="\d{4}"/.test(ui), false, 'no literal year may be the ceiling');
  assert.match(ui, /const nowY = new Date\(\)\.getUTCFullYear\(\);/);
  assert.match(ui, /max="' \+ nowY \+ '"/, 'the input’s ceiling is this year');
  assert.match(ui, /y = Math\.max\(1800, Math\.min\(nowY, y\)\);/, 'and a typed year is clamped as well');
});

/* ⚠ ㉕ ACCESSIBILITY IS IN THE MARKUP, NOT IN A PROMISE (§19) ────────────────────────────────── */
test('R291 ㉕ the panel is operable and describable without sight or a mouse', () => {
  const ui = read('js/routing-ui.js');
  assert.match(ui, /role', 'dialog'/);
  assert.match(ui, /aria-labelledby', 'rtp-title'/);
  assert.match(ui, /role="combobox"/); assert.match(ui, /aria-autocomplete="list"/);
  assert.match(ui, /role', 'listbox'/); assert.match(ui, /role="option"/);
  assert.match(ui, /aria-activedescendant/);
  assert.match(ui, /aria-pressed/); assert.match(ui, /role="tablist"/); assert.match(ui, /role="tabpanel"/);
  assert.match(ui, /aria-live="polite"/); assert.match(ui, /role="alert"/);
  /* every icon-only control names itself */
  const iconBtns = [...ui.matchAll(/class="rtp-btn-ico[^"]*"([\s\S]{0,220}?)>/g)].map((m) => m[1]);
  assert.ok(iconBtns.length >= 5, 'expected the icon buttons to be found: ' + iconBtns.length);
  iconBtns.forEach((b, i) => assert.match(b, /aria-label=/, 'icon button ' + i + ' has no accessible name'));
  /* Escape is a ladder, and the close returns focus where it came from */
  assert.match(ui, /candidates → map picking → area drawing → the panel/);
  assert.match(ui, /focusReturn && focusReturn\.isConnected\) focusReturn\.focus\(\)/);
  /* the keyboard can reorder a stop as well as a drag can */
  assert.match(ui, /rtp-up/); assert.match(ui, /rtp-down/);
  const css = read('css/intmap.css');
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{[\s\S]{0,200}\.rtp/, 'reduced motion is honoured');
  assert.match(css, /\.rtp-btn-ico\{ width:44px; height:44px/, 'the phone targets are 44 px');
});

/* ⚠ ㉖ THE PANEL ASKS FOR NOTHING UNTIL IT IS ASKED (§4.3/§23) ───────────────────────────────── */
test('R291 ㉖ opening the panel requests no location and computes no route', () => {
  const ui = read('js/routing-ui.js');
  const openFn = /function open\(o\) \{([\s\S]*?)\n    \}/.exec(ui);
  assert.ok(openFn, 'open() must be findable');
  assert.equal(/geolocation/.test(openFn[1]), false, 'opening must not ask for a location (§4.3)');
  assert.match(ui, /function useHere\(which\)/, 'the permission prompt belongs to a press');
  assert.match(ui, /navigator\.geolocation\.getCurrentPosition/);
  /* the search debounces and cancels; the route is never computed from a keystroke */
  assert.match(ui, /sugTimer = setTimeout\(async \(\) => \{/);
  assert.match(ui, /}, 240\);/, 'the candidate search debounces (§4.1: 200–300 ms)');
  assert.match(ui, /sugAC\.abort\(\)/, 'and cancels the previous one');
  const onInput = /function onInput\(e\) \{([\s\S]*?)\n    \}/.exec(ui);
  assert.ok(onInput);
  assert.equal(/schedule\(|recompute\(/.test(onInput[1]), false, 'typing must never start a route request (§23)');
  assert.match(ui, /if \(key === lastKey && Date\.now\(\) - lastAt < 1500/, 'and an identical request is not re-sent');
});

/* ⚠ ㉗ THE GEOCODER OFFERS CANDIDATES; IT DOES NOT CHOOSE (§4.1) ─────────────────────────────── */
test('R291 ㉗ the place search ranks a list instead of confirming one hit', () => {
  const w = makeWindow();
  const g = load(w, 'js/routing-geocode.js').IntMapRouteGeocode;
  /* a coordinate is a place, and it never leaves the browser */
  const ll = g.parseLatLng('35.6812, 139.7671');
  assert.equal(ll.lat, 35.6812); assert.equal(ll.lng, 139.7671); assert.equal(ll.kind, 'coord');
  assert.equal(g.parseLatLng('99, 200'), null, 'a coordinate off the planet is not a coordinate');
  assert.equal(g.parseLatLng('Potsdam'), null);
  /* the SAME-NAME case #R126 measured, now answered with a list */
  const cands = [
    { lng: -73.94, lat: 44.66, name: 'Potsdam', admin: 'New York, United States', pop: 15000 },
    { lng: 13.06, lat: 52.4, name: 'Potsdam', admin: 'Brandenburg, Germany', pop: 180000 },
  ];
  const nearBerlin = g.rank(cands.slice(), [13.4, 52.5]);
  assert.equal(nearBerlin[0].admin, 'Brandenburg, Germany', 'the near one leads from a German view');
  assert.equal(nearBerlin.length, 2, '…and the other is still offered, which is the whole point');
  assert.ok(nearBerlin[0].distKm < 60 && nearBerlin[1].distKm > 5000, 'each row carries its distance');
  const far = g.rank(cands.slice(), [140, 36]);
  assert.equal(far[0].admin, 'Brandenburg, Germany', 'with no near candidate, population decides');
  /* an exact registry hit outranks everything */
  const withExact = g.rank(cands.concat([{ lng: 13.06, lat: 52.39, name: 'Potsdam Hbf', exact: true }]), [140, 36]);
  assert.equal(withExact[0].exact, true);
  /* two rows for the same place collapse; two different places with one name do not */
  assert.equal(g.dedupe([{ lng: 13.06, lat: 52.4, name: 'Potsdam' }, { lng: 13.0601, lat: 52.4001, name: 'potsdam' }]).length, 1);
  assert.equal(g.dedupe(cands.slice()).length, 2);
  /* the kind is read off the source's own vocabulary, never guessed from the name */
  assert.equal(g.kindOf('railway', 'station'), 'station');
  assert.equal(g.kindOf('aeroway', 'aerodrome'), 'airport');
  assert.equal(g.kindOf('place', 'city'), 'city');
  assert.equal(g.kindOf('building', 'house'), 'address');
  assert.equal(g.kindOf('', '', 'PPLC'), 'city');
});

/* ⚠ THE STRIPPER ITSELF IS CHECKED. Three assertions above are «X does not appear»; if `bare()`
   returned an empty string they would all pass and measure nothing (#R274's rule: prove the green
   is not blindness). */
test('R291 ㉗b the comment-free reader keeps the code and drops the prose', () => {
  const ui = bare('js/routing-ui.js');
  assert.ok(ui.length > 20000, 'the stripper must not be eating the file: ' + ui.length);
  assert.match(ui, /function open\(o\) \{/, 'code survives');
  assert.match(ui, /rtp-suggest/, 'and so do string literals');
  assert.equal(/幅約346px/.test(ui), false, 'the header prose is gone');
  assert.equal(/openPanel` has been exported/.test(bare('js/routing.js')), false);
  /* a URL inside a string is not a comment */
  assert.match(bare('js/routing-geocode.js'), /https:\/\/nominatim\.openstreetmap\.org\/search/);
});

/* ⚠⚠ ㉗c (追記) THE CARD FOLLOWS A LANGUAGE SWITCH ────────────────────────────────────────────
   Found by PRODUCTION VERIFICATION: compute a route, switch the app to Japanese, and the card still
   read 「Fastest」. Every other string on it is produced at render time; this one was a STRING baked
   when the route was computed, which is the «translation held as data» shape one level up. */
test('R291 ㉗c an alternative’s differentiator is a descriptor, so it re-renders in the new language', () => {
  const w = fresh(); const C = w.IntMapRouteCards;
  const fastest = { duration: 2160, distance: 31000, labelKey: { k: 'fastest', avoid: null }, label: 'Fastest' };
  const delta = { duration: 2460, distance: 39000, labelKey: { k: 'delta', min: 5, avoid: ['toll'] }, label: '+5 min · avoids tolls' };
  assert.equal(C.altLabel(fastest, { lang: 'en' }), 'Fastest');
  assert.equal(C.altLabel(fastest, { lang: 'jp' }), '最速', 'the SAME object must answer in Japanese');
  assert.equal(C.altLabel(delta, { lang: 'en' }), '+5 min · avoids tolls');
  assert.equal(C.altLabel(delta, { lang: 'jp' }), '+5 分 · 回避: 有料');
  assert.equal(C.altLabel({ labelKey: { k: 'shortest' } }, { lang: 'de' }), 'Kürzeste');
  assert.equal(C.altLabel({ labelKey: { k: 'route' } }, { lang: 'es' }), 'Ruta');
  /* an alternative from BEFORE this change still has only the sentence — it is printed, not lost */
  assert.equal(C.altLabel({ label: 'Fastest' }, { lang: 'jp' }), 'Fastest');
  assert.equal(C.altLabel({}, { lang: 'en' }), '');
  /* and the card really uses it: the same alternatives, two languages, two different card texts */
  const en = C.altCards([fastest, delta], { lang: 'en', units: 'metric', sel: 0, setId: 'rs1' });
  const jp = C.altCards([fastest, delta], { lang: 'jp', units: 'metric', sel: 0, setId: 'rs1' });
  assert.match(en, /Fastest/); assert.equal(/Fastest/.test(jp), false, 'the Japanese card must not carry the English word');
  assert.match(jp, /最速/);
  /* ⚠ AND THE ROUTER STILL WRITES BOTH — an Atlas message already in the transcript prints `label` */
  const src = read('js/routing.js');
  assert.match(src, /a\.labelKey=\{k:'fastest'/);
  assert.match(src, /a\.label=LL\('Fastest'/, 'the sentence is still produced for older callers');
  assert.match(src, /label:a\.label,labelKey:a\.labelKey/, 'and both travel in the result');
  /* the panel rebuilds its ANSWERS on a language switch, not only its chrome */
  const ui = read('js/routing-ui.js');
  assert.match(ui, /addEventListener\('intmap-lang', \(\) => \{ if \(!el\) return; el\.innerHTML = shell\(\); wire\(\); render\(\); \}\)/);
});

/* ⚠ ㉘ THE DATELINE (§14.2/§11.3) ────────────────────────────────────────────────────────────── */
test('R291 ㉘ a keep-out box drawn across the antimeridian is the strip, not its complement', () => {
  const r = read('js/routing.js');
  assert.match(r, /if\(Math\.abs\(x2-x1\)>180\)\{ if\(x2<x1\) x2\+=360; else x1\+=360; \}/,
    'the ring is built on an unwrapped axis');
  /* the same arithmetic, run here: two clicks either side of 180° must give a NARROW box */
  const mk = (a, b) => { let x1 = a, x2 = b; if (Math.abs(x2 - x1) > 180) { if (x2 < x1) x2 += 360; else x1 += 360; } return Math.abs(x2 - x1); };
  assert.equal(mk(179, -179), 2, 'two degrees apart across the line');
  assert.equal(mk(-179, 179), 2);
  assert.equal(mk(10, 40), 30, 'and an ordinary box is unaffected');
  /* the route's own bounds were already dateline-safe (#R126 §3.19) — that must not have been lost */
  assert.match(r, /dateline-safe: unwrap longitudes onto a continuous axis before min\/max/);
});
