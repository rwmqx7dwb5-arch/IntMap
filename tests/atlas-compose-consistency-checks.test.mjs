/* ============================================================================
 *  atlas-compose-consistency — a map Atlas builds, and the comparison between two of them, stay the same map
 * ----------------------------------------------------------------------------
 *  ① shadeAreas joins a row to the unit of ITS OWN country, independent of row order (the audit's Aomori・USA / Aomori・Japan)
 *  ② one category = one colour, one shade = one value, across the maps of one comparison (js/map-ui.js classify)
 *  ③ a dated map asks the dated records first, and says what is today's coordinate / outline (js/atlas-map-compose.js)
 *  ④ a tab is selected only after the map changed; a half-failed switch is rolled back or says it is unknown (js/atlas-switch.js)
 *  Everything drives the SHIPPED module; only the seams (boundary index, renderer, DOM) are faked.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule, langRegistry } from './helpers/import-module.mjs';
import * as overlayPlacement from '../js/popup-placement.js';

const geo = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };

/* ── ① ─────────────────────────────────────────────────────────────────────────────────────── */
const UNITS = [
  { name: 'Aomori', stableId: 'JP-02', iso3: 'JPN', countryCode: 'JP' },
  { name: 'Aomori', stableId: 'XX-01', iso3: 'XXX', countryCode: 'XX' },
  { name: 'Akita', stableId: 'JP-05', iso3: 'JPN', countryCode: 'JP' },
];
const added = [];
globalThis.window = Object.assign(globalThis.window || {}, {
  IntMapAtlasAdmin1: {
    /* honest to the real index: a country hint NARROWS the search, and a hint with no match is a miss — it does not widen */
    resolveMany: async (names) => {
      const hits = [], misses = [];
      names.forEach((n) => {
        const pool = UNITS.filter((u) => u.name === n.name && (!n.iso3 || u.iso3 === n.iso3));
        if (!pool.length) { misses.push({ name: n.name }); return; }
        const u = pool[0];
        hits.push(Object.assign({ asked: n.name, geo, aliases: [], ambiguousCountries: Array.from(new Set(pool.map((p) => p.iso3))) }, u, { canonicalName: u.name }));
      });
      return { hits, misses, requests: 0 };
    },
  },
  GeoJSONUpload: { add: (fc) => { added.push(fc); return { n: added.length }; }, style: async () => ({ ok: true }) },
});
const caps = (await import('../js/atlas-cap-geo.js')).default;
const shade = caps.find((c) => c.row[0] === 'geo.shadeAreas');
const K = { R: (ok, html, extra) => ({ ok, html, ...(extra || {}) }), warn: (h) => h, esc: (s) => String(s), L: (en) => en, ensureData: async () => {},
  resolveCountry: async (c) => ({ code: ({ Japan: 'JPN', USA: 'USA' })[c] || '' }) };
const featuresOf = () => added.at(-1).features.map((f) => [f.properties.code, f.properties.value]);

test('① a row whose country does not hold the unit is unplaced, in either row order, and is never moved onto another country’s unit', async () => {
  const usa = { area: 'Aomori', country: 'USA', value: 999 }, jp = { area: 'Aomori', country: 'Japan', value: 10 };
  for (const rows of [[usa, jp], [jp, usa]]) {
    const r = await shade.run({ source: 's', rows }, {}, K);
    assert.equal(r.ok, true);
    assert.deepEqual(featuresOf(), [['JP-02', 10]], 'Japan keeps ITS value whatever the order');
    assert.equal(r.meta.shadeAreas.unplaced, 1, 'the USA row comes back as unplaced');
    assert.match(r.meta.shadeAreas.unplacedNames.join(), /Aomori/);
  }
});

test('① two rows for one unit with different values are a conflict, not "the first wins"', async () => {
  for (const rows of [[{ area: 'Aomori', value: 5 }, { area: 'Akita', value: 1 }, { area: 'Akita', value: 2 }], [{ area: 'Aomori', value: 5 }, { area: 'Akita', value: 2 }, { area: 'Akita', value: 1 }], [{ area: 'Aomori', value: 5 }, { area: 'Akita', value: 1 }, { area: 'Akita', value: 2 }]]) {
    const r = await shade.run({ source: 's', country: 'Japan', rows }, {}, K);
    assert.ok(!featuresOf().some(([c]) => c === 'JP-05'), 'a conflicted unit is not painted');
    assert.equal(r.meta.shadeAreas.conflicting, 1);
  }
  const same = await shade.run({ source: 's', country: 'Japan', rows: [{ area: 'Akita', value: 3 }, { area: 'Akita', value: 3 }] }, {}, K);
  assert.equal(same.ok, true);
  assert.deepEqual(featuresOf(), [['JP-05', 3]], 'the same fact twice is one fact');
});

/* ── ② ─────────────────────────────────────────────────────────────────────────────────────── */
test('② a category keeps its colour across maps; numeric maps of one comparison share class boundaries', async () => {
  langRegistry();
  const w = globalThis.window;
  w.IntMapGeoEngine = { hasRenderer: () => true, camera: { fitBounds() {} }, events: { on() {}, once() {} }, ready: () => true,
    layers: { addSource() {}, hasSource: () => false, removeSource() {}, has: () => false, add() {}, remove() {}, setPaint() {} } };
  const stubEl = () => ({ style: {}, addEventListener() {}, appendChild() {}, querySelector: () => null, querySelectorAll: () => [] });
  globalThis.document = { createElement: stubEl, body: { appendChild() {} }, getElementById: () => null, addEventListener() {} };
  await import('../js/safe-html.js'); w.IntMapSafe = globalThis.IntMapSafe;
  const rules = (await import('../js/gis-datasets.js')).makeGisDatasets();
  const { geojsonUpload } = await importModule('js/map-ui.js', { mocks: { 'js/geo-engine.js': { ...overlayPlacement, IntMapGeoEngine: w.IntMapGeoEngine } } });
  geojsonUpload({ lang: 'en', imToast() {} });
  const UP = w.GeoJSONUpload;
  const colourOf = (lg, k) => lg.classes.find((c) => c.keys[0] === k).color;
  const a = UP.classify(['A', 'A', 'B'], { field: 'g', mode: 'categorical', compare: 'lang' }, rules).legend;
  const b = UP.classify(['B', 'B', 'A', 'C'], { field: 'g', mode: 'categorical', compare: 'lang' }, rules).legend;
  assert.equal(colourOf(a, 'A'), colourOf(b, 'A'), 'A is the same colour when it is no longer the most frequent');
  assert.equal(colourOf(a, 'B'), colourOf(b, 'B'));
  assert.notEqual(colourOf(b, 'C'), colourOf(b, 'A'));
  /* differential: without a scale the frequency order reverses the colours — the defect this closes */
  const u1 = UP.classify(['A', 'A', 'B'], { field: 'g', mode: 'categorical' }, rules).legend;
  const u2 = UP.classify(['B', 'B', 'A'], { field: 'g', mode: 'categorical' }, rules).legend;
  assert.notEqual(colourOf(u1, 'A'), colourOf(u2, 'A'));
  const n1 = UP.classify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { field: 'v', mode: 'graduated', classes: 3, compare: 'gdp', color: '#0a84ff' }, rules).legend;
  const n2 = UP.classify([20, 30, 40, 50, 60, 70], { field: 'v', mode: 'graduated', classes: 3, compare: 'gdp', color: '#34c759' }, rules).legend;
  assert.deepEqual(n2.cuts, n1.cuts, 'the second map reads the first map’s boundaries');
  assert.equal(n2.classes[0].color, n1.classes[0].color, 'and its base colour');
  const given = UP.classify([5, 15], { field: 'v', mode: 'graduated', cuts: [10], color: '#0a84ff' }, rules).legend;
  assert.deepEqual(given.cuts, [10]);
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────── */
test('③ with an era the dated records answer before today’s ledger; today’s coordinates and outlines are labelled as references', async () => {
  const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
  const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
  const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const layers = new Set(); let data = null;
  const g = { layers: { hasSource: () => true, addSource() {}, setSourceData: (id, d) => { data = d; }, has: (id) => layers.has(id), add: (d) => layers.add(d.id), setVisible() {}, getLayout: () => 'visible', setFilter() {} },
    camera: { flyTo() {}, fitBounds() {}, getZoom: () => 3 }, events: { onLayer() {}, on() {} }, render: { canvas: () => ({ style: {} }) } };
  const modern = { lng: 10, lat: 50, name: 'Oldtown' };
  const mk = () => makeAtlasMapCompose({ GE: () => g, geocode: async () => modern, ledger, geoObject: GEOBJ.geoObject,
    histResolve: async (n) => (n === 'Oldtown' ? { ok: true, lng: 1, lat: 2, name: 'Oldtown', source: 'histCities' } : { ok: false, reason: 'not_in_records' }),
    resolveShape: async () => ({ ok: true, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, basis: 'real', method: 'osm_polygon', source: 'OpenStreetMap' }),
    verifyPlaces: async () => new Map(), dispatch: async () => ({ ok: true }) });
  /* today's coordinate for the same name is already in the ledger (a map of today shown first) */
  await mk().run({ items: [{ name: 'Oldtown', country: 'X' }] }, { turnId: 'now' });
  const r = await mk().run({ era: '1914', items: [{ name: 'Oldtown', country: 'X', shape: 'area' }, { name: 'Elsewhere', country: 'X' }] }, { turnId: 'then' });
  const [old, other] = r.exec.placed;
  assert.equal(old.provenance, 'historical_record', 'the past-name lookup ran although today’s ledger knew the name');
  assert.equal(old.validity, 'dated_record');
  assert.equal(old.asOf, '1914');
  assert.equal(other.validity, 'modern_reference', 'a place only today’s gazetteer knows is flagged');
  assert.equal(r.meta.compose.shapes[0].validity, 'modern_reference', 'the outline is today’s, not “real” for 1914');
  assert.match(r.html, /not the 1914 boundary/);
  assert.match(r.exec.validityNote, /modern_reference/);
  const f = data.features.find((x) => x.properties.t === 'shape');
  assert.equal(f.properties.ref, 1, 'drawn dashed with the other approximations');
  const now = await mk().run({ items: [{ name: 'Elsewhere', country: 'X', shape: 'area' }] }, { turnId: 'later' });
  assert.equal(now.meta.compose.shapes[0].validity, 'current', 'an undated map is unchanged');
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────── */
function fakeRow(n, selected) {
  const attrs = {};
  const tabs = Array.from({ length: n }, (_, i) => {
    const cl = new Set(i === selected ? ['on'] : []);
    return { classList: { add: (c) => cl.add(c), remove: (c) => cl.delete(c), contains: (c) => cl.has(c), toggle: (c, on) => (on ? cl.add(c) : cl.delete(c)) },
      getAttribute: (k) => (k === 'data-i' ? String(i) : k === 'data-calls' ? encodeURIComponent(JSON.stringify([{ type: 'time', i }, { type: 'layer', i }])) : null),
      setAttribute() {}, closest: () => root };
  });
  const isOn = (t) => t.classList.contains('on');
  const root = { getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = v; },
    querySelectorAll: (q) => (q === '.atl-ctl-tab' ? tabs : []),
    querySelector: (q) => { if (q === '.atl-ctl-tab.on') return tabs.find(isOn) || null; const m = /data-i="(\d+)"/.exec(q); return m ? tabs[+m[1]] : null; },
    appendChild() {} };
  return { tabs, root, isOn };
}
test('④ the tab moves only when the map did: a failed second step rolls the first back, and a failed rollback marks nothing', async () => {
  globalThis.document = globalThis.document || { createElement: () => ({}) };
  const { makeAtlasSwitch } = await import('../js/atlas-switch.js');
  const calls = (log, failOn) => makeAtlasSwitch({ CAPS: { ofSpelling: () => ({ id: 'x', risk: 'reversible-session', confirmation: 'none' }) }, L: (en) => en,
    dispatch: async (c) => { log.push(c.type + c.i); return failOn(c, log) ? { ok: false, meta: { code: 'LAYER_FAILED' } } : { ok: true }; } });

  /* map shows option 0; option 1's layer step fails; option 0's calls succeed on the way back */
  let log = [];
  let row = fakeRow(2, 0);
  await calls(log, (c) => c.type === 'layer' && c.i === 1).press(row.tabs[1]);
  if (!log.length) return assert.fail('the press ran nothing — the call check refused the markup, so this test measured nothing');
  assert.deepEqual(log, ['time1', 'layer1', 'time0', 'layer0'], 'the confirmed option is restored');
  assert.ok(row.isOn(row.tabs[0]) && !row.isOn(row.tabs[1]), 'the row shows the option the map shows');

  /* a success moves the selection */
  log = []; row = fakeRow(2, 0);
  await calls(log, () => false).press(row.tabs[1]);
  assert.ok(row.isOn(row.tabs[1]) && !row.isOn(row.tabs[0]));
  assert.equal(row.root.getAttribute('data-confirmed'), '1');

  /* the rollback fails too: nothing is selected — the reader is not told a state the map is not in */
  log = []; row = fakeRow(2, 0);
  await calls(log, (c) => c.type === 'layer').press(row.tabs[1]);
  assert.ok(!row.isOn(row.tabs[0]) && !row.isOn(row.tabs[1]), 'no tab claims a state the map is not in');
  assert.equal(row.root.getAttribute('data-confirmed'), '');
});
