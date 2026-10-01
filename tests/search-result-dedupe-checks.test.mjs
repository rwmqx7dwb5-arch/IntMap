// search-result-dedupe — ONE PLACE IS ONE ROW IN THE SEARCH CARD
//
// Reported on production: typing 「Kyoto」 into the map's place search listed
// 「Kyoto, Kyoto Prefecture, Japan」 three times. Picking any of them flew to Kyoto, so the search
// worked; the card did not.
//
// MEASURED (the three geocoders' live answers for `Kyoto`, captured 2026-09-27 and inlined below,
// trimmed to the fields js/search-geocode.js reads): the three identical labels were NOT the three
// geocoders repeating one city. They were
//   · the city — Nominatim relation 357794, and Photon's copy of the SAME relation, which the old
//     key did fold (identical label, identical point);
//   · Kyoto Station, twice — Photon answers three railway nodes named 「Kyoto」 within 90 m of each
//     other, labels them identically, and the old key `label|lng.toFixed(2)|lat.toFixed(2)` put
//     34.9846 and 34.9853 into DIFFERENT 0.01° cells. A grid key splits any two points that straddle
//     a cell edge however close they are, and merges nothing whose label differs by one word —
//     which is also why Open-Meteo's 「Kyoto, Kyoto, Japan」 (the same city, GeoNames PPLA, 1.6 km
//     from OSM's point) stood beside the Nominatim row.
//
// So this file evaluates the SHIPPED doGeocode against those captured answers — real DOM calls on a
// minimal fake, real place-framing, the real name rules — clicks every row, and asks where each one
// goes. It asks about FEATURES (which OSM object / which point a row flies to), not about label
// counts: two different things with the same name (the city and its station) must stay two rows.

import test from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importModule, swappable, langRegistry } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
langRegistry();   /* (module-graph) js/search-geocode.js imports the REAL language registry; declare its languages */
globalThis.IntMapSafe = globalThis.IntMapSafe || { html: (s) => String(s) };

await import(pathToFileURL(join(ROOT, 'js/place-framing.js')).href);
await import(pathToFileURL(join(ROOT, 'js/atlas-geo-resolve.js')).href);
/* (module-graph) js/search-geocode.js imports IntMapGeoEngine and exports its factory: each search's
   fake engine is handed at that import edge through one swappable binding */
const engine = swappable();
const { searchGeocode } = await importModule('js/search-geocode.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engine.value } } });
/* js/nominatim-gate.js's one-a-second floor is not what is measured here, and it would put Nominatim
   last in every run — the arrival orders below are the variable under test. */
window.IntMapNominatimGate = { nominatimSlot: () => Promise.resolve(true) };

/* ── the captured answers (live, 2026-09-27, q=Kyoto, en) ─────────────────────────────────────── */
const OPEN_METEO = {"results":[{"name":"Kyoto","latitude":35.02107,"longitude":135.75385,"feature_code":"PPLA","country":"Japan","admin1":"Kyoto","population":1463723},{"name":"Kyoto","latitude":-2.05,"longitude":31.68333,"feature_code":"PPL","country":"Tanzania","admin1":"Kagera"},{"name":"Kyojomanyi","latitude":0.43333,"longitude":31.68333,"feature_code":"PPL","country":"Uganda","admin1":"Central Region"},{"name":"Kyoto Heliport","latitude":34.92141,"longitude":135.74231,"feature_code":"AIRH","country":"Japan","admin1":"Kyoto"},{"name":"Kyoto Imperial Palace","latitude":35.02328,"longitude":135.76329,"feature_code":"PRK","country":"Japan","admin1":"Kyoto"}]};
const NOMINATIM = [{"osm_type":"relation","osm_id":357794,"lat":"35.0115754","lon":"135.7681441","category":"boundary","type":"administrative","addresstype":"city","name":"Kyoto","display_name":"Kyoto, Kyoto Prefecture, Japan","importance":0.70860091756966,"boundingbox":["34.8749160","35.3212207","135.5590060","135.8784420"]}];
const PHOTON = {"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7584303,34.9846076]},"properties":{"osm_type":"N","osm_id":3628707764,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7681441,35.0115754]},"properties":{"osm_type":"R","osm_id":357794,"osm_key":"place","osm_value":"city","type":"city","name":"Kyoto","state":"Kyoto Prefecture","country":"Japan","extent":[135.559006,35.3212207,135.878442,34.874916]}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.758766,34.9853497]},"properties":{"osm_type":"N","osm_id":267316272,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7576627,34.9847375]},"properties":{"osm_type":"N","osm_id":3340028686,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyoto","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.454601,35.242552]},"properties":{"osm_type":"R","osm_id":2137477,"osm_key":"place","osm_value":"province","type":"state","name":"Kyoto Prefecture","country":"Japan","extent":[134.8513426,36.1500281,136.055476,34.705754]}},{"type":"Feature","geometry":{"type":"Point","coordinates":[135.7600629,34.9861909]},"properties":{"osm_type":"N","osm_id":7780637510,"osm_key":"railway","osm_value":"station","type":"house","name":"Kyōto","city":"Kyoto","state":"Kyoto Prefecture","country":"Japan"}}]};

/* the facts the assertions are about, read off the capture rather than retyped */
const CITY_POINTS = [[+NOMINATIM[0].lon, +NOMINATIM[0].lat], [OPEN_METEO.results[0].longitude, OPEN_METEO.results[0].latitude]];
const CITY_BOX = NOMINATIM[0].boundingbox.map(Number);   /* [S, N, W, E] */
const STATION_POINTS = PHOTON.features.filter((f) => f.properties.osm_key === 'railway' && f.properties.name === 'Kyoto').map((f) => f.geometry.coordinates);
const PREFECTURE_POINT = PHOTON.features.find((f) => f.properties.osm_value === 'province').geometry.coordinates;
const TANZANIA_POINT = [OPEN_METEO.results[1].longitude, OPEN_METEO.results[1].latitude];
const at = (p, list) => list.some((q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9);

/* ── a DOM just large enough for doGeocode and gotoPlace ─────────────────────────────────────── */
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.textContent = ''; this.style = {}; this.onclick = null; this.parent = null; this._html = ''; this._stubs = new Map(); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  setAttribute(k, v) { (this._attrs = this._attrs || {})[k] = String(v); }   /* (a11y-shared-dialog) a row is role=option */
  getAttribute(k) { return (this._attrs && k in this._attrs) ? this._attrs[k] : null; }
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  set innerHTML(h) {
    this.children.forEach((c) => { c.parent = null; }); this.children = []; this._html = String(h || ''); this._stubs.clear();
    const m = /^<div class="([^"]+)"/.exec(this._html); if (m) { const c = new El('div'); c.className = m[1]; this.appendChild(c); }
  }
  get innerHTML() { return this._html; }
  querySelector(sel) {
    const cls = sel.startsWith('.') ? sel.slice(1) : null;
    const hit = cls && this.children.find((c) => c.className.split(/\s+/).includes(cls));
    if (hit) return hit;
    /* a card built from a template string: hand back a stand-in for anything the template names */
    const token = cls ? `class="${cls}"` : `id="${sel.slice(1)}"`;
    if (this._html.includes(token)) { if (!this._stubs.has(sel)) this._stubs.set(sel, new El('div')); return this._stubs.get(sel); }
    return null;
  }
}

function fakeWorld() {
  const byId = { 'ms-input': Object.assign(new El('input'), { value: 'Kyoto' }), 'ms-results': new El('div'), 'map-container': new El('div') };
  globalThis.document = { getElementById: (id) => byId[id] || null, createElement: (t) => new El(t) };
  const flights = [];
  let last = null;
  engine.set({
    camera: {
      forBounds: (b) => { last.bounds = b; return { center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: 10 }; },
      flyTo: () => {}, fitBounds: (b) => { last.bounds = b; },
    },
    ui: { marker: () => ({ setLngLat(p) { last.point = p; return this; }, remove() {} }), attach: (m) => m },
    events: { on: () => {}, off: () => {} },
    coords: { project: () => ({ x: 0, y: 0 }) },
  });
  const click = (row) => { last = { label: row.textContent, bounds: null, point: null }; row.onclick(); flights.push(last); return last; };
  return { res: byId['ms-results'], input: byId['ms-input'], click, flights };
}

/* the three providers answer in the order given — the card must not depend on who is fastest */
function network(order) {
  const delay = Object.fromEntries(order.map((h, i) => [h, i * 15]));
  globalThis.fetch = async (url) => {
    const host = new URL(String(url)).hostname;
    const body = host.startsWith('geocoding-api.open-meteo') ? OPEN_METEO : host.startsWith('nominatim') ? NOMINATIM : host.startsWith('photon') ? PHOTON : null;
    await new Promise((r) => setTimeout(r, delay[host.split('.')[0]] || 0));
    return new Response(JSON.stringify(body || []), { headers: { 'content-type': 'application/json' } });
  };
}

async function searchKyoto(order) {
  network(order);
  const W = fakeWorld();
  const HOST = { lang: 'en', countryStats: {}, BUILTIN_GAZETTEER: null, t: (k) => k, fmtLL: () => '', fmtElevVal: () => '' };
  const S = searchGeocode(HOST);
  await S.doGeocode();
  const rows = W.res.children.filter((c) => c.className === 'ms-item');
  const labels = rows.map((r) => r.textContent);
  const went = rows.map((r) => W.click(r));
  await new Promise((r) => setTimeout(r, 0));   /* let each gotoPlace's elevation fetch settle */
  return { labels, went };
}

const ORDERS = [
  ['geocoding-api', 'nominatim', 'photon'],   /* Open-Meteo first: the POINT-only city row arrives before the one with a boundary */
  ['photon', 'nominatim', 'geocoding-api'],
  ['nominatim', 'photon', 'geocoding-api'],
];

for (const order of ORDERS) {
  test(`search-result-dedupe ① the city of Kyoto is ONE row, framed by its real boundary (arrival: ${order.join(' → ')})`, async () => {
    const { labels, went } = await searchKyoto(order);
    const city = went.filter((w) => at(w.point, CITY_POINTS));
    assert.equal(city.length, 1, `one city, three geocoders — got ${city.length}: ${JSON.stringify(labels)}`);
    /* whichever answered first, the row that stays is the one that carries the boundary */
    assert.ok(city[0].bounds, 'the kept city row frames by an extent, not by a class guess');
    const [[w, s], [e, n]] = city[0].bounds;
    assert.deepEqual([s, n, w, e].map((v) => +v.toFixed(5)), CITY_BOX.map((v) => +v.toFixed(5)), 'and that extent is the relation\'s own');
    assert.match(city[0].label, /Kyoto Prefecture/, 'the row shows the label of the row it now is');
  });

  test(`search-result-dedupe ② three railway nodes named Kyoto at one station are ONE row (arrival: ${order.join(' → ')})`, async () => {
    const { labels, went } = await searchKyoto(order);
    const station = went.filter((w) => at(w.point, STATION_POINTS));
    assert.equal(station.length, 1, `Kyoto Station once — got ${station.length}: ${JSON.stringify(labels)}`);
  });

  test(`search-result-dedupe ③ different things with the same name stay apart (arrival: ${order.join(' → ')})`, async () => {
    const { went } = await searchKyoto(order);
    assert.ok(went.some((w) => at(w.point, CITY_POINTS)), 'the city is listed');
    assert.ok(went.some((w) => at(w.point, STATION_POINTS)), 'the station is listed — a station is not the city it stands in');
    assert.ok(went.some((w) => at(w.point, [PREFECTURE_POINT])), 'the prefecture is listed');
    assert.ok(went.some((w) => at(w.point, [TANZANIA_POINT])), 'Kyoto in Tanzania is listed — a namesake 10,000 km away is another place');
  });
}
