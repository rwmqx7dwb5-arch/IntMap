/* ============================================================================
 *  IntMap · space weather widgets + satellite passes over a point
 * ----------------------------------------------------------------------------
 *  Two things, both RUN rather than read:
 *
 *  1. js/widget-defs-space.js (and space.kp in js/widget-defs-data.js) — the parsers behind space.solarwind /
 *     space.xray / space.scales / space.alerts / space.kp / space.neo are pure functions (`IntMapWidgetDefsData.space`,
 *     `.kpData`) and are fed
 *     the SHAPES the upstreams really send (NOAA SWPC real-time JSON and JPL cad.api, fetched
 *     2026-11-17: null holes in the primary spacecraft's rows, three spacecraft interleaved, every
 *     cad.api value a string). The loaders are then run against a stubbed `fetch` / relay and every
 *     renderer at every size is run on what they returned.
 *  2. js/satellites-live.js passesOver — the pruned search is compared with an EXHAUSTIVE one (no
 *     pruning, a 5 s grid) on the bundled catalogue, because the pruning is a theorem about angular
 *     rates and a theorem is only as good as the numbers put into it.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule, langRegistry } from './helpers/import-module.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

/* ── 1. the widgets ─────────────────────────────────────────────────────────────────────────── */
async function loadDefs(relay) {
  const defs = [];
  const rec = (k) => (...a) => ({ k, a });
  const R = new Proxy({}, { get: (_, k) => rec(String(k)) });
  const WC = {
    el: (tag, attrs, kids) => ({ tag, attrs, kids }), L: (...a) => a[0], define: (d) => { defs.push(d); },
    num: (v) => (v == null ? null : String(v)), date: () => 'D', ago: () => 'A', flyTo() {}, icon: () => ({}),
  };
  const win = { IntMapWidgetCore: WC, IntMapWidgetRender: R };
  win.window = win;
  langRegistry();
  await importModule('js/widget-defs-data.js', { globals: { window: win } });
  await importModule('js/widget-defs-space.js', { globals: { window: win }, mocks: { 'js/proxy-fetch.js': { fetchViaProxy: relay || (async () => null) } } });
  return { defs, D: win.IntMapWidgetDefsData, def: (id) => defs.find((d) => d.id === id) };
}

test('X-ray class from flux: the class boundaries are the NOAA ones and never round up into the next class', async () => {
  const { D } = await loadDefs();
  const c = D.space.xrayClass;
  assert.equal(c(1e-5).text, 'M1.0', '1e-5 W/m² is M1.0');
  assert.equal(c(9.99e-6).text, 'C9.9', 'just under M1 stays C (truncated, not 10.0)');
  assert.equal(c(1e-4).text, 'X1.0');
  assert.equal(c(2.83e-3).text, 'X28.3', 'X has no upper bound');
  assert.equal(c(1e-6).text, 'C1.0');
  assert.equal(c(1e-7).text, 'B1.0');
  assert.equal(c(1e-8).text, 'A1.0');
  assert.equal(c(5e-9).text, 'A0.5', 'below A1 the letter stays A');
  assert.equal(c(2.3e-6).text, 'C2.3');
  assert.equal(c(0), null);
  assert.equal(c(-1), null);
  assert.deepEqual([c(1e-7).level, c(2e-6).level, c(1e-5).level, c(5e-5).level, c(1e-4).level, c(1e-3).level], [0, 1, 2, 3, 3, 4],
    'tone: quiet 0, C 1, M1-M4 2, M5+ and X1-X9 3, X10+ 4 (the R scale the class implies)');
});

const wind = [
  { time_tag: '2026-11-17T11:06:00', active: true, source: 'SOLAR1', proton_speed: null, proton_temperature: null, proton_density: null },
  { time_tag: '2026-11-17T11:06:00', active: false, source: 'ACE', proton_speed: 330.33, proton_temperature: 41809, proton_density: 1.69 },
  { time_tag: '2026-11-17T11:04:00', active: true, source: 'SOLAR1', proton_speed: 302.7, proton_temperature: 38000, proton_density: 1.5 },
  { time_tag: '2026-11-17T08:00:00', active: true, source: 'SOLAR1', proton_speed: 290, proton_temperature: 30000, proton_density: 2.5 },
  { time_tag: '2026-11-17T03:00:00', active: true, source: 'SOLAR1', proton_speed: 400, proton_temperature: 30000, proton_density: 2.5 },
];
const mag = [
  { time_tag: '2026-11-17T11:07:00', active: true, source: 'SOLAR1', bt: 7.21, bz_gsm: -4.62 },
  { time_tag: '2026-11-17T11:06:03', active: false, source: 'IMAP', bt: 7.28, bz_gsm: -4.18 },
  { time_tag: '2026-11-17T09:00:00', active: true, source: 'SOLAR1', bt: 5, bz_gsm: 2 },
];

test('space.solarwind: the primary spacecraft only, nulls skipped not carried, a 6-hour series', async () => {
  const { D } = await loadDefs();
  const d = D.space.solarWind(wind, mag);
  assert.equal(d.speed, 302.7, 'the newest MEASURED active minute (11:06 is null for SOLAR1; ACE is not primary)');
  assert.equal(d.density, 1.5);
  assert.equal(d.bz, -4.62);
  assert.equal(d.bt, 7.21);
  assert.equal(d.windSource, 'SOLAR1');
  assert.deepEqual(d.speedSeries.map((x) => x.v), [290, 302.7], 'the 03:00 reading is older than 6 h before the newest and is out; ascending in time');
  assert.equal(d.at, Date.parse('2026-11-17T11:07:00Z'), 'times are UTC although the upstream omits the zone');
  assert.equal(D.space.solarWind([], []), null, 'no primary reading is empty, not zeros');
});

const xr = [];
for (let i = 0; i < 12; i++) {
  const t = '2026-11-17T10:' + String(i * 5).padStart(2, '0') + ':00Z';
  xr.push({ time_tag: t, satellite: 18, flux: 1e-6 * (i === 7 ? 25 : 1.5), energy: '0.1-0.8nm' });
  xr.push({ time_tag: t, satellite: 18, flux: 9e-9, energy: '0.05-0.4nm' });
}
const prob = [
  { date: '2026-11-15T00:00:00', c_class_1_day: 10, c_class_2_day: 10, c_class_3_day: 10, m_class_1_day: 1, m_class_2_day: 1, m_class_3_day: 1, x_class_1_day: 1, x_class_2_day: 1, x_class_3_day: 1 },
  { date: '2026-11-16T00:00:00', c_class_1_day: 80, c_class_2_day: 70, c_class_3_day: 60, m_class_1_day: 15, m_class_2_day: 14, m_class_3_day: 13, x_class_1_day: 5, x_class_2_day: 4, x_class_3_day: 3 },
];

test('space.xray: the 0.1-0.8 nm channel, current class, 24 h maximum, 5-minute maxima on a log axis, the newest forecast', async () => {
  const { D } = await loadDefs();
  const d = D.space.xray(xr, prob);
  assert.equal(d.now.text, 'C1.5');
  assert.equal(d.max.text, 'M2.5', 'the flare at i=7 is the day maximum');
  assert.equal(d.series.length, 3, '12 one-minute-style rows → ceil(12/5) buckets');
  assert.ok(d.series.every((p) => p.v >= D.space.XRAY_LOG_MIN && p.v <= D.space.XRAY_LOG_MAX));
  assert.equal(Math.max(...d.series.map((p) => p.v)), Math.log10(2.5e-5), 'a flare is kept as the bucket maximum, never averaged away');
  assert.deepEqual(d.prob.m, [15, 14, 13], 'the newest forecast row, days 1-3');
  assert.deepEqual(d.prob.x, [5, 4, 3]);
  assert.equal(D.space.xray(xr, null).prob, null, 'a forecast that did not arrive is absent, not zero');
  assert.equal(D.space.xray([{ time_tag: 'x', flux: 1e-9, energy: '0.05-0.4nm' }], prob), null);
});

const scalesJ = { 0: { DateStamp: '2026-11-17', TimeStamp: '11:08:00', R: { Scale: '0', Text: 'none', MinorProb: null, MajorProb: null }, S: { Scale: '0', Text: 'none', Prob: null }, G: { Scale: '2', Text: 'moderate' } },
  1: { DateStamp: '2026-11-17', TimeStamp: '11:08:00', R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '5' }, G: { Scale: '1', Text: 'minor' } },
  2: { DateStamp: '2026-11-18', TimeStamp: '00:00:00', R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '5' }, G: { Scale: '1', Text: 'minor' } },
  3: { DateStamp: '2026-11-19', TimeStamp: '00:00:00', R: { Scale: null, Text: null, MinorProb: '15', MajorProb: '5' }, S: { Scale: null, Text: null, Prob: '1' }, G: { Scale: '0', Text: 'none' } },
  '-1': { DateStamp: '2026-11-16', TimeStamp: '11:08:00', R: { Scale: '3', Text: 'strong' }, S: { Scale: '0' }, G: { Scale: '0' } } };

test('space.scales: current R/S/G from key 0, three forecast days, yesterday ignored', async () => {
  const { D } = await loadDefs();
  const d = D.space.scales(scalesJ);
  assert.deepEqual([d.now.R.scale, d.now.S.scale, d.now.G.scale], [0, 0, 2]);
  assert.equal(d.worst, 2);
  assert.equal(d.days.length, 3);
  assert.deepEqual([d.days[0].R.minor, d.days[0].R.major, d.days[0].S.prob, d.days[0].G.scale], [15, 5, 5, 1]);
  assert.equal(d.days[1].at, Date.parse('2026-11-18T00:00:00Z'));
  assert.equal(d.at, Date.parse('2026-11-17T11:08:00Z'));
  assert.equal(D.space.scales({}), null);
});

const alertRows = [
  { product_id: 'A20F', issue_datetime: '2026-11-15 13:34:32.160', message: 'Space Weather Message Code: WATA20\r\nSerial Number: 1138\r\nIssue Time: 2026 Nov 15 1334 UTC\r\n\r\nWATCH: Geomagnetic Storm Category G1 Predicted \r\nHighest Storm Level Predicted by Day:\r\nNov 16:  None (Below G1)\r\n' },
  { product_id: 'EF3A', issue_datetime: '2026-11-17 08:48:14.700', message: 'Space Weather Message Code: ALTEF3\r\nSerial Number: 3778\r\nIssue Time: 2026 Nov 17 0848 UTC\r\n\r\nCONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu\nContinuation of Serial Number: 3777\nBegin Time: 2026 Nov 08 2245 UTC\n' },
  { product_id: 'BHIS', issue_datetime: '2026-10-19 09:09:00.000', message: 'Space Weather Message Code: SUM10R\r\nSerial Number: 930\r\nIssue Time: 2026 Oct 19 0909 UTC\r\n\r\nSUMMARY: 10cm Radio Burst \r\nBegin Time: 2026 Oct 19 0858 UTC' },
];

test('space.alerts: headline after the header, newest first, kind → severity, body kept for expansion', async () => {
  const { D } = await loadDefs();
  const a = D.space.alerts(alertRows);
  assert.deepEqual(a.map((x) => x.code), ['ALTEF3', 'WATA20', 'SUM10R']);
  assert.equal(a[0].title, 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu');
  assert.equal(a[0].at, Date.parse('2026-11-17T08:48:14.700Z'));
  assert.deepEqual(a.map((x) => x.level), [3, 2, 1], 'ALERT/WARNING 3, WATCH 2, SUMMARY 1');
  assert.match(a[0].body, /^Continuation of Serial Number: 3777\nBegin Time/);
  assert.ok(!/Serial Number: 3778/.test(a[0].body), 'the header is not repeated in the body');
  assert.deepEqual(D.space.alerts(null), []);
});

const kpObs = [['time_tag', 'Kp', 'a_running', 'station_count']].concat(
  Array.from({ length: 30 }, (_, i) => ['2026-11-1' + Math.floor(i / 8) + ' ' + String((i % 8) * 3).padStart(2, '0') + ':00:00.000', String(2 + (i % 3)), '10', '8']));
const kpFc = [
  { time_tag: '2026-11-17T00:00:00', kp: 3, observed: 'observed', noaa_scale: null },
  { time_tag: '2026-11-17T09:00:00', kp: 3.33, observed: 'estimated', noaa_scale: null },
  { time_tag: '2026-11-18T09:00:00', kp: 5.33, observed: 'predicted', noaa_scale: 'G1' },
  { time_tag: '2026-11-18T12:00:00', kp: 4.33, observed: 'predicted', noaa_scale: null },
  { time_tag: '2026-11-19T00:00:00', kp: 3, observed: 'predicted', noaa_scale: null },
];

test('space.kp: observed readings stay as they were; the forecast is added and kept distinguishable', async () => {
  const { D } = await loadDefs();
  const d = D.kpData(kpObs, kpFc);
  assert.equal(d.obs.length, 24, 'the last 24 observed readings, as before');
  assert.ok(d.fc.length >= 1 && d.fc.every((x) => x.kind !== 'observed' && x.at > d.obs[d.obs.length - 1].at), 'forecast = estimated + predicted, after the last observation');
  assert.deepEqual(d.fc.map((x) => x.kind).slice(-3), ['predicted', 'predicted', 'predicted']);
  const days = D.kpDays(d.fc.filter((x) => x.at >= Date.parse('2026-11-18T00:00:00Z')));
  assert.deepEqual(days.map((x) => [x.kp, x.scale]), [[5.33, 'G1'], [3, null]], 'the day maximum and its G level');
  assert.deepEqual(D.kpData(kpObs, null).fc, [], 'a forecast that failed leaves the observed card intact');
  assert.throws(() => D.kpData([], null), /no data/);
  assert.equal(D.utcMs('2026-11-17 08:48:14.700'), Date.parse('2026-11-17T08:48:14.700Z'), 'a zoneless SWPC time is UTC');
  assert.equal(D.utcMs('2026-11-17T11:06:00+09:00'), Date.parse('2026-11-17T02:06:00Z'), 'a time that names its offset keeps it');
  assert.equal(D.utcMs('2026-11-17T11:06:00Z'), Date.parse('2026-11-17T11:06:00Z'));
});

const cad = { signature: { version: '1.5' }, count: 3, fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'v_inf', 't_sigma_f', 'h', 'diameter', 'diameter_sigma', 'fullname'],
  data: [
    ['2019 XF2', '3', '2461378.524423954', '2026-Dec-04 00:35', '0.00795386356544704', '0', '0', '10.2034308257869', '10.17', '2_19:21', '27.1', null, null, '       (2019 XF2)'],
    ['2026 WA', '1', '2461361.832909882', '2026-Nov-17 07:59', '0.000844938687608272', '0', '0', '6.70807169244967', '6.22', '00:02', '29.151', null, null, '       (2026 WA)'],
    ['433', '9', '2461400.5', '2026-Dec-26 00:00', '0.0400', '0', '0', '5.5', '5.5', '< 00:01', '10.4', '16.84', '0.06', '    433 Eros (A898 PA)'],
  ] };

test('space.neo: strings parsed, past approaches dropped, LD/km, a measured diameter or an H-derived RANGE', async () => {
  const { D } = await loadDefs();
  const now = Date.parse('2026-11-17T11:10:00Z');
  const d = D.space.neo(cad, now);
  assert.deepEqual(d.map((x) => x.name), ['2019 XF2', '433 Eros (A898 PA)'], '2026 WA passed 07:59 UTC today and is gone; closest first');
  assert.ok(Math.abs(d[0].at - Date.parse('2026-12-04T00:35:00Z')) < 60000, 'jd 2461378.5244 is 2026-12-04 00:35 UTC (cd is minute-resolution)');
  assert.ok(Math.abs(d[0].distKm - 0.00795386356544704 * 149597870.7) < 1);
  assert.ok(Math.abs(d[0].ld - 3.1) < 0.05, '0.00795 au is about 3.1 lunar distances');
  assert.equal(d[1].dMeasuredKm, 16.84, 'a diameter JPL has is used as is');
  const [lo, hi] = [d[0].dMinKm * 1000, d[0].dMaxKm * 1000];
  assert.ok(Math.abs(lo - 10.1) < 0.2 && Math.abs(hi / lo - Math.sqrt(0.25 / 0.05)) < 1e-9, 'H 27.1 is about 10-23 m: 1329/sqrt(p)*10^(-H/5) km, the ratio of the ends is sqrt(0.25/0.05); got ' + lo + '-' + hi);
  assert.throws(() => D.space.neo({ fields: ['des'], data: [] }, now), /lacks/);
});

test('loaders: every widget loads from the upstream shapes, and every renderer at every size runs on the result', async () => {
  const urls = [];
  const body = {
    'rtsw_wind_1m.json': wind, 'rtsw_mag_1m.json': mag, 'xrays-1-day.json': xr, 'solar_probabilities.json': prob,
    'noaa-scales.json': scalesJ, 'alerts.json': alertRows, 'noaa-planetary-k-index.json': kpObs, 'noaa-planetary-k-index-forecast.json': kpFc,
  };
  globalThis.fetch = async (u) => {
    urls.push(String(u));
    const k = Object.keys(body).find((x) => String(u).endsWith(x));
    return k ? { ok: true, status: 200, headers: { get: () => null }, json: async () => body[k] } : { ok: false, status: 404, headers: { get: () => null } };
  };
  const relayed = [];
  const future = JSON.parse(JSON.stringify(cad));
  future.data[1][2] = String(2440587.5 + (Date.now() + 5 * 86400000) / 86400000);
  const { defs, def } = await loadDefs(async (u, o) => { relayed.push([u, o]); return JSON.stringify(future); });
  const ids = ['space.solarwind', 'space.xray', 'space.scales', 'space.alerts', 'space.kp', 'space.neo'];
  for (const id of ids) {
    const d = def(id);
    assert.ok(d, id + ' is registered');
    assert.equal(d.family, 'space'); assert.equal(d.category, 'space');
    assert.deepEqual(d.supportedSizes, ['s', 'm', 'l']);
    assert.ok(d.refreshPolicy.minIntervalMs >= 60000, id + ' asks no faster than the 1-minute upstreams can answer');
    const r = await d.loader({}, {}, undefined);
    assert.ok(r && r.data && r.source, id + ' returned data and a source');
    const st = { data: r.data, source: r.source, lastSuccessfulAt: Date.now(), local: null };
    for (const size of d.supportedSizes) {
      assert.doesNotThrow(() => d.renderers[size]({}, {}, st, { needsLocation() {} }), id + ' renders at ' + size);
      assert.ok(d.renderers[size]({}, {}, st, {}), id + ' draws something at ' + size);
    }
    if (d.tone) assert.doesNotThrow(() => d.tone(st));
  }
  assert.ok(urls.every((u) => u.startsWith('https://services.swpc.noaa.gov/')), 'every direct request is to SWPC (CORS *)');
  assert.equal(relayed.length, 1);
  assert.match(relayed[0][0], /^https:\/\/ssd-api\.jpl\.nasa\.gov\/cad\.api\?/, 'the JPL API goes through the relay ladder, never fetch()');
  assert.ok(!urls.some((u) => new URL(u).hostname === 'ssd-api.jpl.nasa.gov'), 'no direct fetch() to the JPL host');
  assert.ok(def('space.kp').legacyIds.includes('kp') && def('space.iss') && def('space.launch'), 'the existing space cards are untouched');
  /* a card cached by the version that stored the observed readings as a bare array still draws */
  const old = defs.find((d) => d.id === 'space.kp');
  assert.doesNotThrow(() => old.renderers.m({}, {}, { data: [{ at: 1, kp: 3 }, { at: 2, kp: 4 }], source: 'x' }));
  /* a refused relay is a failure, 'no-data' is empty */
  const bad = await loadDefs(async (u, o) => { o.note.reason = 'refused'; return null; });
  await assert.rejects(() => bad.def('space.neo').loader({}, {}, undefined), /relay refused/);
  const nd = await loadDefs(async (u, o) => { o.note.reason = 'no-data'; return null; });
  assert.deepEqual(await nd.def('space.neo').loader({}, {}, undefined), { empty: true });
});

/* ── 2. passesOver ──────────────────────────────────────────────────────────────────────────── */
async function satellites(clockMs) {
  const file = (p) => readFileSync(new URL(p, root));
  const win = {};
  win.window = win;
  win.IntMapFetchWithin = { readWithin: async (url) => {
    if (String(url) === 'data/tle/catalogue.tle') return { ok: true, text: file('data/tle/catalogue.tle').toString('utf8') };
    throw Object.assign(new Error('offline'), { reason: 'network' });
  } };
  globalThis.fetch = async (u) => {
    const s = String(u);
    if (s.startsWith('data/tle/')) { const t = file(s).toString('utf8'); return { ok: true, json: async () => JSON.parse(t), text: async () => t }; }
    return { ok: false, status: 503 };
  };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  await importModule('js/ephemeris.js', { globals: { window: win } });
  const M = await importModule('js/satellites-live.js', {
    globals: { window: win },
    mocks: { 'js/chronos.js': { IntMapTime: { when: () => new Date(clockMs.v) } }, 'js/geo-engine.js': { IntMapGeoEngine: {} }, 'js/icons.js': { icon: () => '' } },
  });
  const API = M.satellitesLive({ lang: 'en', fetchViaProxy: async () => null });
  return API;
}

/* the bundled ISS elements' own epoch — the instant their span is centred on, so the test is not a function of today's date */
const issEpoch = (() => {
  const t = read('data/tle/catalogue.tle').split('\n');
  const i = t.findIndex((l) => l.startsWith('1 25544U'));
  const e = parseFloat(t[i].slice(18, 32));
  return Date.UTC(2000 + Math.floor(e / 1000), 0, 1) + (e % 1000 - 1) * 86400000;
})();

test('passesOver: ISS crosses the sky several times in 24 h, in time order, with a coherent pass each time', async () => {
  const clock = { v: issEpoch };
  const API = await satellites(clock);
  API.setGroup('stations');
  const tokyo = { lng: 139.69, lat: 35.68 };
  const out = await API.passesOver(tokyo, { hours: 24, minElevDeg: 10, limit: 1000 });
  const iss = out.filter((p) => p.id === 25544);
  assert.ok(iss.length >= 3 && iss.length <= 8, 'a 51.6° orbit passes a 35.7°N site several times a day; got ' + iss.length);
  for (const p of iss) {
    assert.ok(p.max.elevDeg >= 10 && p.max.elevDeg <= 90);
    if (p.rise.ms != null && p.set.ms != null) {
      assert.ok(p.rise.ms < p.max.ms && p.max.ms < p.set.ms, 'rise < max < set');
      assert.ok((p.set.ms - p.rise.ms) / 60000 > 1 && (p.set.ms - p.rise.ms) / 60000 < 16, 'a LEO pass lasts minutes, not hours');
    }
    for (const k of ['rise', 'max', 'set']) if (p[k].azDeg != null) assert.ok(p[k].azDeg >= 0 && p[k].azDeg < 360);
    assert.equal(typeof p.sunlit, 'boolean'); assert.equal(typeof p.observerDark, 'boolean');
    assert.equal(p.visible, p.sunlit && p.observerDark && p.max.elevDeg >= 10, 'visible is exactly lit ∧ dark ∧ high enough');
    assert.equal(p.magnitude, null, 'no sourced standard-magnitude table ships, so none is invented');
  }
  const t = out.map((p) => (p.rise.ms == null ? p.max.ms : p.rise.ms));
  assert.deepEqual(t, [...t].sort((a, b) => a - b), 'time order');
  assert.ok(out.every((p) => p.max.ms >= clock.v - 3600000 && p.max.ms <= clock.v + 25 * 3600000), 'inside the asked window (a pass already in progress may begin earlier)');
  const vis = await API.passesOver(tokyo, { hours: 24, minElevDeg: 10, visibleOnly: true, limit: 1000 });
  assert.ok(vis.every((p) => p.visible) && vis.length <= out.length);
  const few = await API.passesOver(tokyo, { hours: 24, limit: 2 });
  assert.equal(few.length, 2);
  await assert.rejects(() => API.passesOver(null), /point/);
  await assert.rejects(() => API.passesOver(tokyo, { group: 'starlink' }), /not the loaded one/);
});

/* LEO (visual: bright objects) at mid, high and equatorial sites; MEO (gps-ops: 12-hour orbits whose passes last hours and whose peak is flat) at a mid and a polar site —
   the MEO case is the one where the first version of the pruning lost a pass that rose in the last seconds of the window */
for (const [group, sites] of [['visual', [{ lng: 139.69, lat: 35.68 }, { lng: 25, lat: 68 }, { lng: -60, lat: -2 }]], ['gps-ops', [{ lng: 139.69, lat: 35.68 }, { lng: 10, lat: -80 }]]]) test('passesOver: the pruned search finds exactly what an exhaustive 5 s walk finds — ' + group, async () => {
  const clock = { v: issEpoch };
  const API = await satellites(clock);
  API.setGroup(group);
  for (const at of sites) {
    const fast = await API.passesOver(at, { hours: 24, minElevDeg: 10, limit: 100000 });
    const slow = await API.passesOver(at, { hours: 24, minElevDeg: 10, limit: 100000, exhaustive: true });
    assert.ok(slow.length > 0, 'the reference found passes at ' + JSON.stringify(at));
    const key = (p) => p.id + '@' + Math.round(p.max.ms / 60000);
    /* the same pass = the same object over the same stretch of sky (a MEO pass has a flat top, so its peak TIME is not a key) */
    const same = (a, b) => a.id === b.id && (a.rise.ms ?? -Infinity) <= (b.set.ms ?? Infinity) && (b.rise.ms ?? -Infinity) <= (a.set.ms ?? Infinity);
    /* a pass whose peak sits within half a degree of the cut-off may fall either side of it on a 30 s vs 5 s grid; anything clearly above must be in both */
    const clear = (l) => l.filter((p) => p.max.elevDeg >= 10.5);
    const fk = new Set(fast.map((p) => p.id + '|' + p.max.ms)), sk = slow.map((p) => ({ id: p.id, ms: p.max.ms }));
    for (const p of clear(slow)) {
      assert.ok(fast.some((q) => same(q, p)), 'the pruned search missed ' + key(p) + ' at ' + JSON.stringify(at));
    }
    for (const p of clear(fast)) {
      assert.ok(slow.some((q) => same(q, p)), 'the pruned search invented ' + key(p));
      const q = slow.find((x) => same(x, p));
      assert.ok(Math.abs(q.max.elevDeg - p.max.elevDeg) < 0.5, 'peak elevation agrees');
      if (p.rise.ms != null && q.rise.ms != null) assert.ok(Math.abs(p.rise.ms - q.rise.ms) < 2000, 'rise agrees to 2 s');
      if (p.set.ms != null && q.set.ms != null) assert.ok(Math.abs(p.set.ms - q.set.ms) < 2000, 'set agrees to 2 s');
    }
    assert.ok(fk.size > 0 && sk.length > 0);
  }
});

test('passesOver: outside what the element sets speak for, nothing is computed', async () => {
  const clock = { v: issEpoch + 400 * 86400000 };
  const API = await satellites(clock);
  API.setGroup('stations');
  const out = await API.passesOver({ lng: 139.69, lat: 35.68 }, { hours: 24, limit: 1000 });
  assert.equal(out.length, 0, 'a year after the epoch every set is out of span (_elementSpan), so there is no pass to report');
});
