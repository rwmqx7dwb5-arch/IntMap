// IntMap · search-identity — the halves of tests/search-identity.spec.js that need no browser.
//
// Observed on production (2026-10-03, b797887): 「Tokyo」 offered 「Japan · Tokyo」, which flew to Japan's label
// point (36.143°N 138.442°E, a mountainside in Nagano) and wrote 「Japan」 into the field; it also offered Togo,
// Takeo, Mokpo and Soyo; and Enter moved nothing. These run the SHIPPED matcher (js/search-geocode.js
// `localFuzzyPlaces`) over the SHIPPED world gazetteer and the rules js/atlas-geo-resolve.js states, and the
// shipped `doGeocode` against a DOM just large enough for it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { importModule, swappable, langRegistry } from './helpers/import-module.mjs';
import { readLF } from '../scripts/eol.mjs';
import { codeOnly } from '../scripts/code-only.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
langRegistry();
globalThis.IntMapSafe = globalThis.IntMapSafe || { html: (s) => String(s) };
await import(pathToFileURL(join(ROOT, 'js/place-framing.js')).href);
const { makeAtlasGeoResolve } = await import(pathToFileURL(join(ROOT, 'js/atlas-geo-resolve.js')).href);
await import(pathToFileURL(join(ROOT, 'js/data-door.js')).href);
await import(pathToFileURL(join(ROOT, 'js/gazetteer.js')).href);
const engine = swappable();
const { searchGeocode } = await importModule('js/search-geocode.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: engine.value } } });
window.IntMapNominatimGate = { nominatimSlot: () => Promise.resolve(true) };

/* the world gazetteer, read from the file this repository ships */
const WORLD = fs.readFileSync(join(ROOT, 'data/gazetteer-world.json.gz'));
let netCalls = 0, remote = {};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.endsWith('/gazetteer-world.json.gz') || u.endsWith('gazetteer-world.json.gz')) return new Response(WORLD);
  netCalls++;
  const host = new URL(u).hostname;
  const body = host.startsWith('geocoding-api.open-meteo') ? (remote.om || { results: [] }) : host.startsWith('nominatim') ? (remote.nom || []) : host.startsWith('photon') ? (remote.ph || { features: [] }) : [];
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
};
await window.IntMapGazetteer.warm();
assert.ok((window.IntMapGazetteer.world() || []).length > 1000, 'the world gazetteer loaded');

/* the country table's rows as js/countries-ui.js builds them — the label point is the one production flew to */
const COUNTRIES = {
  JPN: { nameEn: 'Japan', nameJp: '日本', capital: 'Tokyo', a2: 'JP', latlng: [36.143, 138.442], bbox: [129.4, 31.0, 145.8, 45.6], pop: 124e6 },
  TGO: { nameEn: 'Togo', nameJp: 'トーゴ', capital: 'Lomé', a2: 'TG', latlng: [8.6, 1.0], bbox: [-0.15, 6.1, 1.8, 11.1], pop: 9e6 },
  LVA: { nameEn: 'Latvia', nameJp: 'ラトビア', capital: 'Riga', a2: 'LV', latlng: [56.9, 24.9], bbox: [20.9, 55.6, 28.3, 58.1], pop: 1.9e6 },
};
const HOST = { lang: 'en', countryStats: COUNTRIES, get BUILTIN_GAZETTEER() { return window.IntMapGazetteer.index(); }, t: (k) => k, fmtLL: () => '', fmtElevVal: () => '', isMobile: () => false };
const S = searchGeocode(HOST);
const km = (a, b) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const TOKYO = { lat: 35.6895, lng: 139.6917 };
const STRANGERS = /^(Togo|Takeo|Mokpo|Soyo)$/;

test('search-identity ① a capital row is the record OF the capital — its own name over its own point', () => {
  const rows = S.localFuzzyPlaces('Tokyo');
  assert.ok(rows.length >= 1, 'Tokyo is offered');
  assert.equal(rows[0].name, 'Tokyo', 'the first row is Tokyo — got ' + rows.map((r) => r.name).join(', '));
  assert.ok(km(rows[0], TOKYO) < 5, `the row named Tokyo stands in Tokyo — got ${rows[0].lat}, ${rows[0].lng}`);
  assert.equal(rows[0].kind, 'capital', 'and says what the country table knows about it');
  assert.equal(rows[0].exact, true);
  for (const r of rows) {
    assert.ok((r.names || []).includes(r.name), `「${r.name}」 is named by its own record, not composed from two (${JSON.stringify(r.names)})`);
    assert.doesNotMatch(r.name, /·/, 'no row joins a country to a capital');
  }
  assert.equal(rows.filter((r) => r.name === 'Tokyo').length, 1, 'the capital and the gazetteer row are one row');
  /* #R93d's own case: the capital of Latvia, not Latvia's centroid 83 km away */
  const riga = S.localFuzzyPlaces('Riga').find((r) => r.kind === 'capital');
  assert.ok(riga && km(riga, { lat: 56.946, lng: 24.1059 }) < 5, 'Riga is Riga — got ' + JSON.stringify(riga));
});

test('search-identity ① a capital the device holds no record of yields NO row — never the country\'s point', () => {
  const G = window.IntMapGazetteer, world = G.world;
  G.world = () => null;   /* a phone before the world list lands: only the curated table */
  try {
    const t = S.localFuzzyPlaces('Tokyo');
    assert.ok(t[0] && t[0].name === 'Tokyo' && km(t[0], TOKYO) < 5, 'the curated Tokyo, found inside Japan\'s own extent');
    const lome = S.localFuzzyPlaces('Lomé');
    assert.ok(!lome.some((r) => km(r, { lat: COUNTRIES.TGO.latlng[0], lng: COUNTRIES.TGO.latlng[1] }) < 1 && r.kind !== 'country'),
      'no row stands on Togo\'s label point under another name — got ' + JSON.stringify(lome));
  } finally { G.world = world; }
});

test('search-identity ② a resemblance is the rules\' agreement — Togo, Takeo, Mokpo and Soyo are not Tokyo; osakaa and Tokio still find theirs', () => {
  const names = S.localFuzzyPlaces('Tokyo').map((r) => r.name);
  assert.deepEqual(names.filter((n) => STRANGERS.test(n)), [], 'strangers offered: ' + names.join(', '));
  /* a query a name already carries is not a typo — no resemblance is offered beside it (Kyoto agrees 0.75 with Tokyo) */
  assert.ok(!names.includes('Kyoto'), 'no typo-guess beside an exact match: ' + names.join(', '));
  assert.equal(S.localFuzzyPlaces('東京')[0].kind, 'capital', '「東京」 finds the same capital row through its Japanese name');
  assert.ok(S.localFuzzyPlaces('osakaa').some((r) => r.name === 'Osaka'), '「osakaa」 still finds Osaka (#R19)');
  assert.ok(S.localFuzzyPlaces('Tokio').some((r) => r.name === 'Tokyo'), '「Tokio」 still finds Tokyo');
  /* without the rules (a synchronous caller before the module loads) there is no resemblance at all, not another measure */
  const R = window.IntMapPlaceRules; delete window.IntMapPlaceRules;
  try {
    const bare = S.localFuzzyPlaces('Tokyo').map((r) => r.name);
    assert.deepEqual(bare.filter((n) => STRANGERS.test(n)), [], 'strangers without the rules: ' + bare.join(', '));
    assert.equal(S.localFuzzyPlaces('Tokyo')[0].name, 'Tokyo');
  } finally { window.IntMapPlaceRules = R; }
});

test('search-identity ③ order: the whole name, then the kind\'s scale, then population', () => {
  const rows = S.localFuzzyPlaces('Tokyo');
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i];
    const ok = a.level > b.level || (a.level === b.level && (a.scale < b.scale || (a.scale === b.scale && a.pop >= b.pop)));
    assert.ok(ok, `「${a.name}」 (${a.level}/${a.scale}/${a.pop}) before 「${b.name}」 (${b.level}/${b.scale}/${b.pop})`);
  }
  const g = S.localFuzzyPlaces('Japan');
  assert.equal(g[0].name, 'Japan', 'a country asked for by its whole name is first');
  assert.equal(g[0].kind, 'country');
});

test('search-identity ④ Atlas\'s confirming door and the search box give one answer for a capital', async () => {
  const G = makeAtlasGeoResolve(HOST, { L: (e) => e, _setLast: (x) => x, localFuzzyPlaces: S.localFuzzyPlaces, lastPlace: () => null,
    GE: () => ({ camera: { getCenter: () => ({ lng: 0, lat: 0 }) } }) });
  netCalls = 0;
  const t = await G.geocode('Tokyo');
  const box = S.localFuzzyPlaces('Tokyo')[0];
  assert.ok(t && t.lng === box.lng && t.lat === box.lat, `same point — Atlas ${JSON.stringify(t)} / box ${JSON.stringify(box)}`);
  assert.equal(netCalls, 0, 'an exact local capital confirms locally, like any exact city row');
});

/* ── doGeocode against a DOM just large enough for it ─────────────────────────────────────────── */
class El {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.textContent = ''; this.style = {}; this.onclick = null; this.parent = null; this._html = ''; this.value = ''; }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  insertBefore(c, ref) { const i = this.children.indexOf(ref); if (i < 0) return this.appendChild(c); c.parent = this; this.children.splice(i, 0, c); return c; }
  setAttribute(k, v) { (this._attrs = this._attrs || {})[k] = String(v); }
  getAttribute(k) { return (this._attrs && k in this._attrs) ? this._attrs[k] : null; }
  addEventListener() {}
  blur() {}
  remove() { if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); this.parent = null; } }
  click() { if (this.onclick) this.onclick(); }
  set innerHTML(h) { this.children.forEach((c) => { c.parent = null; }); this.children = []; this._html = String(h || ''); const m = /^<div class="([^"]+)"/.exec(this._html); if (m) { const c = new El('div'); c.className = m[1]; this.appendChild(c); } }
  get innerHTML() { return this._html; }
  querySelector(sel) { const cls = sel.startsWith('.') ? sel.slice(1) : null; const hit = cls && this.children.find((c) => c.className.split(/\s+/).includes(cls)); if (hit) return hit; return this._html.includes(cls ? `class="${cls}"` : `id="${sel.slice(1)}"`) ? new El('div') : null; }
}
function page(q) {
  const byId = { 'ms-input': Object.assign(new El('input'), { value: q }), 'ms-results': new El('div'), 'map-container': new El('div') };
  globalThis.document = { getElementById: (id) => byId[id] || null, createElement: (t) => new El(t) };
  const flights = [];
  engine.set({
    camera: { forBounds: (b) => ({ center: [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2], zoom: 10 }), flyTo: (o) => flights.push(o.center), fitBounds: (b) => flights.push(b) },
    ui: { marker: () => ({ setLngLat() { return this; }, remove() {} }), attach: (m) => m },
    events: { on: () => {}, off: () => {} },
    coords: { project: () => ({ x: 0, y: 0 }) },
  });
  window.IntMapWx = { guardedJSON: async () => null };
  HOST.fetchBathymetry = async () => null;
  return { input: byId['ms-input'], res: byId['ms-results'], flights };
}

test('search-identity ⑤ Enter goes: an exact row on the device is taken at once, without the network', async () => {
  const P = page('Tokyo'); netCalls = 0;
  await S.doGeocode({ go: true });
  assert.equal(P.flights.length, 1, 'one flight');
  const [lng, lat] = P.flights[0];
  assert.ok(km({ lng, lat }, TOKYO) < 5, `flew to Tokyo — got ${lat}, ${lng}`);
  assert.equal(P.input.value, 'Tokyo', 'the field holds the name of where it went');
  assert.equal(netCalls, 0, 'no geocoder was asked for an answer already in hand');
});

test('search-identity ⑤ Enter with no exact row on the device waits for the geocoders, then takes the first-ranked row', async () => {
  remote = { om: { results: [{ name: 'Shimokitazawa', latitude: 35.6616, longitude: 139.6683, feature_code: 'PPLX', country: 'Japan', admin1: 'Tokyo' }] } };
  try {
    const P = page('Shimokitazawa');
    await S.doGeocode({ go: true });
    assert.equal(P.flights.length, 1, 'it went, once');
    assert.equal(P.input.value, 'Shimokitazawa');
  } finally { remote = {}; }
  const N = page('Qqqzzxx');
  await S.doGeocode({ go: true });
  assert.equal(N.flights.length, 0, 'nothing to go to, nothing moves');
});

test('search-identity ⑤ Enter that confirms an IME conversion is not a search', () => {
  const src = codeOnly(readLF(join(ROOT, 'js/app-body.js')));
  const line = src.split('\n').find((l) => /ms-input|addEventListener\('keydown'/.test(l) && /doGeocode\(\{go:true\}\)/.test(l));
  assert.ok(line, 'Enter on the search field asks doGeocode to go');
  assert.match(line, /!e\.isComposing/, 'and drops a keydown the IME is still composing');
});
