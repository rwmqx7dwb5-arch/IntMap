/* ============================================================================
 *  IntMap · place-dossier — everything the map knows about one point, and every hole said out loud
 * ----------------------------------------------------------------------------
 *  js/place-dossier.js gathers, for one point, what IntMap already computes (name and administrative chain,
 *  country, elevation, the value of every data layer that is on, local time and the sun) into ONE record that
 *  the card draws and Atlas's `research.placeProfile` hands the model as `exec`. What this file RUNS (the
 *  gatherer is evaluated against a stub host, a stub layer register and a stubbed network — nothing below
 *  reads the source to guess what it does):
 *    ① every row the reading register answers is a row of the record, with its number and unit kept apart
 *      from the display text; the elevation row heads the record instead of being one of the layers
 *    ② a layer that is on and has no value here, failed, holds features, or declares no point reader at all
 *      is a row WITH A REASON — never a missing row (a missing row reads as 「そこには何も無かった」)
 *    ③ the panel rows with no reader are discovered from the layer declarations, not listed
 *    ④ the country is hit-tested with the app's point-in-polygon; open sea is `none`, not `unavailable`
 *    ⑤ Nominatim: the chain comes from the address object in its own order, identifiers are fields not links;
 *      «no named area» is `none` and «could not reach» is `unavailable` with the deadline's reason
 *    ⑥ a weather source that states no time zone is said by name; the sun is IntMap's own computation
 *    ⑦ country statistics come from the CALLER's metric set and formatter (Atlas's), and the record is JSON-safe
 *    ⑧ profileHtml draws one row per layer row, and a hole as its reason
 *    ⑨ the three doors reach it: the context menu, the search card and the Atlas capability
 * ==========================================================================*/
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

globalThis.window = globalThis;
const checked = new Map();
globalThis.document = { getElementById: (id) => checked.get(id) || null, body: { contains: () => false } };
const { placeProfile, profileHtml } = await import('../js/place-dossier.js');
const { NominatimGate } = await import('../js/nominatim-gate.js');
const { dataLayers } = await import('../js/layer-manifest.js');
NominatimGate.configure({ gapMs: 0, reset: true });

/* a square around (10,10) is «Testland»; everything else is sea */
const SQUARE = { type: 'Polygon', coordinates: [[[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]] };
function pip(x, y, g) { const r = g.coordinates[0]; let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; }
window._imPipGeo = pip;   /* the app publishes its one point-in-polygon on window (js/map-ui.js) */
function host(over) {
  return Object.assign({
    lang: 'en', fmtLL: (lng, lat) => lat.toFixed(3) + ', ' + lng.toFixed(3), fmtElevVal: (m) => Math.round(m) + ' m',
    demElevAt: (x, y, cb) => { if (cb) setTimeout(cb, 0); return null; },
    countryGeo: { features: [{ id: 'TST', geometry: SQUARE }] },
    countryStats: { TST: { code: 'TST', nameEn: 'Testland', capital: 'Testville', region: 'Nowhere', pop: 1234567, gdp: 42.5, sov: true } },
    cName: (s) => s.nameEn, loadCountryData: () => Promise.resolve(),
  }, over || {});
}
/* the register below holds these ids; one undeclared panel row and one row the `dl-` convention bridges are
   found from the declarations rather than named here */
const HELD = ['temp', 'climate', 'snow', 'no2', 'elevation', 'earthquakes'];
const UNREAD = dataLayers().find((d) => !d.registry && d.id && HELD.indexOf(d.id) < 0 && HELD.indexOf(String(d.id).replace(/^dl-/, '')) < 0);
const BRIDGED = dataLayers().find((d) => !d.registry && /^dl-/.test(d.id) && HELD.indexOf(d.id.slice(3)) >= 0);
function register(rows, active, list) {
  window.IntMapLayers = {
    sampleAt: async () => rows,
    state: (id) => ({ label: 'L:' + id, source: 'S:' + id, time: id === 'temp' ? '2026-10-03T00:00Z' : null }),
    active: () => active, list: () => list,
  };
}
function weather(j) { window.IntMapWx = { sunTimes: () => ({ sunrise: new Date('2026-10-03T21:00:00Z'), sunset: new Date('2026-10-04T08:40:00Z'), transit: new Date('2026-10-04T02:50:00Z'), daylightSec: 42000 }), point: async () => j }; }
function net(fn) { globalThis.fetch = async (url, init) => fn(String(url), init); }
const ok = (obj) => ({ ok: true, status: 200, type: 'basic', text: async () => JSON.stringify(obj), body: null });

test('①②③ the register\'s rows, the holes with their reasons, and the panel rows nobody reads', async () => {
  register([
    { id: 'temp', label: 'Air temperature', asked: true, value: '12.3°C', number: 12.34, unit: '°C' },
    { id: 'climate', label: 'Köppen', asked: true, value: 'Cfa · humid', code: 'Cfa' },
    { id: 'snow', label: 'Snow', asked: true },
    { id: 'no2', label: 'NO2', asked: true, failed: true },
    { id: 'elevation', label: 'Elevation', asked: true, value: '1240 m', number: 1240.4, unit: 'm' },
  ], HELD, HELD);
  assert.ok(UNREAD, 'some panel row declares no reading — the population this check needs');
  assert.ok(BRIDGED, 'some dl- row is read by the registration of its own name — the population this check needs');
  checked.clear();
  checked.set(UNREAD.id, { checked: true, closest: () => null });
  checked.set(BRIDGED.id, { checked: true, closest: () => null });
  weather({ timezone: 'Asia/Tokyo', utc_offset_seconds: 32400, _src: 'Open-Meteo' });
  net(() => ok({ name: 'Shibuya', licence: 'Data © OpenStreetMap contributors, ODbL 1.0.', address: { suburb: 'Shibuya', city: 'Tokyo', 'ISO3166-2-lvl4': 'JP-13', postcode: '150-0002', country: 'Japan', country_code: 'jp' } }));
  const p = await placeProfile({ lng: 10, lat: 10 }, host());
  const by = Object.fromEntries(p.layers.rows.map((r) => [r.id, r]));
  assert.equal(by.temp.status, 'ok'); assert.equal(by.temp.value, 12.34); assert.equal(by.temp.unit, '°C'); assert.equal(by.temp.text, '12.3°C');
  assert.equal(by.temp.source, 'S:temp'); assert.equal(by.temp.time, '2026-10-03T00:00Z');
  assert.equal(by.climate.code, 'Cfa'); assert.equal(by.climate.value, undefined, 'a class is not a quantity');
  assert.deepEqual([by.snow.status, by.snow.reason], ['none', 'no-value-here']);
  assert.deepEqual([by.no2.status, by.no2.reason], ['unavailable', 'sampler-failed']);
  assert.deepEqual([by.earthquakes.status, by.earthquakes.reason], ['unreadable', 'features-not-a-value']);
  assert.deepEqual([by[UNREAD.id].status, by[UNREAD.id].reason], ['unreadable', 'no-point-reader-declared']);
  assert.equal(by[BRIDGED.id], undefined, BRIDGED.id + ' is read by the registration ' + BRIDGED.id.slice(3) + ' (js/map-ui.js isOn: dl-+id)');
  assert.equal(by.elevation, undefined, 'the elevation heads the record, not the layer list');
  assert.equal(p.elevation.value, 1240.4); assert.equal(p.elevation.unit, 'm');
  /* ⑤ the chain in the address object's own order; identifiers are fields */
  assert.deepEqual(p.place.chain.map((c) => c.name), ['Shibuya', 'Tokyo', 'Japan']);
  assert.equal(p.place.ids['ISO3166-2-lvl4'], 'JP-13'); assert.equal(p.place.countryCode, 'JP'); assert.equal(p.place.postcode, '150-0002');
  assert.match(p.place.source.licence, /ODbL/);
  /* ④ */ assert.equal(p.country.status, 'ok'); assert.equal(p.country.code, 'TST'); assert.equal(p.country.stats, null, 'no metric set given → no statistics invented');
  /* ⑥ */ assert.equal(p.time.timeZone, 'Asia/Tokyo'); assert.equal(p.time.sun.daylightSeconds, 42000);
  /* ⑦ JSON-safe — what Atlas receives is the same record */
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p);
  /* ⑧ one drawn row per layer row, each hole drawn as its reason */
  const html = profileHtml(p, host());
  const layerPart = html.slice(html.indexOf('Layers on the map'));
  assert.equal((layerPart.match(/class="acp-row"/g) || []).length, p.layers.rows.length);
  assert.equal((layerPart.match(/class="pd-why"/g) || []).length, p.layers.rows.filter((r) => r.status !== 'ok').length);
  checked.clear();
});

test('④⑤⑥ open sea, an unreachable geocoder and a zone nobody stated are three different answers', async () => {
  checked.clear();
  register([], [], []);
  weather({ current: {}, _src: 'MET Norway' });
  net(() => { const e = new Error('down'); throw e; });
  const p = await placeProfile({ lng: 150, lat: -40 }, host());
  assert.deepEqual([p.country.status, p.country.reason], ['none', 'outside-every-country']);
  assert.equal(p.place.status, 'unavailable'); assert.ok(p.place.reason, 'the deadline layer states why nothing arrived');
  assert.equal(p.time.timeZone, null); assert.equal(p.time.zoneWhy, 'zone-not-stated-by:MET Norway');
  assert.ok(p.time.sun, 'the sun is computed, not fetched');
  assert.deepEqual(p.layers.rows, []);
  assert.equal(p.elevation.status, 'unavailable');
  assert.match(profileHtml(p, host()), /MET Norway/);
  net(() => ok({ error: 'Unable to geocode' }));
  const q = await placeProfile({ lng: 150, lat: -40 }, host());
  assert.deepEqual([q.place.status, q.place.reason], ['none', 'no-named-area']);
});

test('⑦ statistics are read from the caller\'s metric set with the caller\'s formatter', async () => {
  register([], [], []);
  weather(null);
  net(() => ok({ error: 'Unable to geocode' }));
  const metrics = { pop: { label: ['Population', '人口'], get: (s) => s.pop }, gdp: { label: ['GDP', 'GDP'], get: (s) => s.gdp }, hdi: { label: ['HDI', 'HDI'], get: (s) => s.hdi } };
  const p = await placeProfile({ lng: 5, lat: 5 }, host(), { metrics, label: (l) => l[0], format: (k, v) => k === 'gdp' ? '$' + v + 'B' : String(v) });
  assert.deepEqual(p.country.stats, [{ key: 'pop', label: 'Population', value: 1234567, text: '1234567' }, { key: 'gdp', label: 'GDP', value: 42.5, text: '$42.5B' }],
    'a metric the country does not have is left out of the statistics, not printed as 0');
  assert.equal(p.time.zoneWhy, 'weather-source-unreachable');
});

test('⑨ the three doors: context menu, search card, Atlas', () => {
  const tp = read('js/tool-panel.js'), sg = read('js/search-geocode.js'), ac = read('js/atlas-cap-research.js'), reg = read('js/atlas-capabilities.js');
  assert.match(tp, /import\('\.\/place-dossier\.js'\)\.then\(m=>m\.openPlaceDossier\(HOST,\{lng:lngLat\.lng,lat:lngLat\.lat\}\)\)/);
  assert.match(sg, /#src-profile'\)\.onclick=\(\)=>\{ import\('\.\/place-dossier\.js'\)\.then\(m=>m\.openPlaceDossier\(HOST,\{lng,lat,name:primary\}\)\)/);
  assert.match(ac, /exec: \{ placeProfile: prof \}/, 'Atlas is handed the record itself');
  assert.match(reg, /\["research\.placeProfile","placeProfile","placeDossier,pointProfile,whatIsHere","research","none","","explanation","read","none","point",""\]/);
});
