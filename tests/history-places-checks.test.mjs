/* ============================================================================
 *  IntMap · independent historical places (Pleiades) — the licensed derivation, what may enter it,
 *  and the runtime that draws, opens and disposes of them  (scripts/build-hist-places.mjs ·
 *  data/hist-places.json · js/hist-places.js)
 *  (consolidated from tests/r709-historical-places-source and r712-historical-coverage-fidelity;
 *   each test keeps its round tag)
 * ----------------------------------------------------------------------------
 *  #R709 — the source places are an EXACT licensed derivation of the harvested Pleiades record, with
 *  source names and their uncertainty intact; eligibility is decided by the source (settlement type,
 *  CC BY 3.0 rights, a real coordinate, a stated period), never guessed. The runtime is run against a
 *  recording engine: it draws only in its periods, inherits the city label policy, survives a style
 *  reload without loops, opens escaped evidence through the shared place reader and unregisters on
 *  disposal. #R712 — modern-name evidence never removes an otherwise eligible place, and every
 *  eligible identity reaches exactly ONE of the two delivery paths (this record or data/hist-cities.json).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importModule } from './helpers/import-module.mjs';
import { compile, eligible, selectRecords, SOURCE } from '../scripts/build-hist-places.mjs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const record = JSON.parse(read('scripts/histplaces/pleiades-record.json'));
const data = JSON.parse(read('data/hist-places.json'));
const cityIds = new Set(JSON.parse(read('data/hist-cities.json')).cities.map(p => p.id));

test('#R709 the shipped source places are an exact licensed derivation, with source names and uncertainty intact', () => {
  assert.deepEqual(compile(record, cityIds), data);
  assert.ok(record.harvest.inputRecords > record.places.length);
  assert.match(record.harvest.inputSha256, /^[a-f\d]{64}$/);
  assert.ok(data.places.length > 5000, 'exercise the omitted source population, not a curated handful');
  assert.equal(new Set(data.places.map(p => p.id)).size, data.places.length);
  const src = new Map(record.places.map(p => ['pl-' + p.id, p]));
  let uncertain = 0, ancientScripts = 0;
  for (const p of data.places) {
    assert.ok(!cityIds.has(p.id), 'never duplicate an existing source identity');
    assert.deepEqual([p.lon, p.lat], src.get(p.id).rp);
    assert.equal(p.title, src.get(p.id).title);
    assert.ok(eligible(src.get(p.id), 2026));
    for (const n of p.names) {
      assert.ok(src.get(p.id).names.some(v => JSON.stringify(v) === JSON.stringify(n)));
      assert.ok(n.s <= n.e && n.s !== 0 && n.e !== 0);
      if (n.l && n.a && !['en', 'ja'].includes(n.l)) ancientScripts++;
    }
    if (p.title.includes('?')) uncertain++;
  }
  assert.ok(uncertain > 500);
  assert.ok(ancientScripts > 100);
});

test('#R709 eligibility is source-based; modern identity, non-settlements, dates and licence cannot be guessed', () => {
  const p = { id: '1', title: 'Source place', rp: [10, 20], types: ['settlement'],
    rights: 'Creative Commons Attribution 3.0', names: [{ r: 'A', a: '', l: '', s: -500, e: 500 }] };
  assert.ok(eligible(p, 2026));
  assert.ok(eligible({ ...p, names: [...p.names, { r: 'A', s: 1700, e: 2100 }] }, 2026));
  assert.ok(!eligible({ ...p, types: ['bath', 'river'] }, 2026));
  assert.ok(!eligible({ ...p, rights: p.rights + ' Share-Alike' }, 2026));
  assert.ok(!eligible({ ...p, rights: '' }, 2026));
  assert.ok(!eligible({ ...p, rp: [181, 20] }, 2026));
  assert.ok(!eligible({ ...p, names: [{ r: 'A', s: 10, e: 1 }] }, 2026));
  assert.ok(!eligible({ ...p, names: [{ r: 'A', s: 0, e: 1 }] }, 2026));
  assert.equal(selectRecords([p, p], 2026).length, 1);
  assert.throws(() => selectRecords([p, { ...p, title: 'Different identity evidence' }], 2026), /Conflicting/);
  const small = { source: SOURCE, asOf: '2026-09-11', places: [p] };
  assert.equal(compile(small, new Set(['pl-1'])).places.length, 0);
  assert.equal(compile(small, new Set(['wd-similar-name'])).places.length, 1);
});

async function runtime(payload = data, initialLive = false, fetcher) {
  let live = initialLive, date = new Date('0300-06-15T12:00:00Z'), writes = 0, removed = 0;
  const subscribers = new Set(), listeners = new Map(), layerEvents = new Map(), windowEvents = new Map(), readers = new Map();
  let unregistered = 0;
  const layers = new Map([['ofm-city', { id: 'ofm-city', type: 'symbol', minzoom: 3,
    layout: { visibility: 'visible', 'text-max-width': 7, 'text-variable-anchor': ['top', 'bottom'],
      'text-radial-offset': 0.4, 'text-justify': 'auto' },
    paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.6 } }]]);
  const sources = new Map(), popups = [];
  const emit = name => { for (const fn of listeners.get(name) || []) fn(); };
  const on = (map, key, fn) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(fn); };
  const off = (map, key, fn) => map.get(key)?.delete(fn);
  let query = [];
  const ge = {
    ready: () => true,
    layers: {
      has: id => layers.has(id), get: id => layers.get(id), remove: id => layers.delete(id),
      add: spec => { layers.set(spec.id, structuredClone(spec)); emit('styledata'); },
      hasSource: id => sources.has(id), addSource: (id, spec) => { sources.set(id, structuredClone(spec)); emit('styledata'); },
      removeSource: id => sources.delete(id),
      setSourceData: (id, fc) => { sources.get(id).data = structuredClone(fc); writes++; emit('styledata'); },
      isVisible: id => layers.has(id) && layers.get(id).layout.visibility !== 'none',
      getLayout: (id, p) => layers.get(id)?.layout[p], getPaint: (id, p) => layers.get(id)?.paint[p],
      setVisible: (id, value) => { layers.get(id).layout.visibility = value ? 'visible' : 'none'; writes++; emit('styledata'); },
      setLayout: (id, p, v) => { layers.get(id).layout[p] = structuredClone(v); writes++; emit('styledata'); },
      setPaint: (id, p, v) => { layers.get(id).paint[p] = structuredClone(v); writes++; emit('styledata'); },
    },
    events: {
      on: (e, fn) => on(listeners, e, fn), off: (e, fn) => off(listeners, e, fn),
      onLayer: (e, id, fn) => on(layerEvents, e + ':' + id, fn),
      offLayer: (e, id, fn) => off(layerEvents, e + ':' + id, fn),
      clickClaimed: e => !!e.claimed, claimClick: e => { e.claimed = true; },
      clickLayers: () => [...layerEvents.keys()].filter(k => k.startsWith('click:')).map(k => k.slice(6)),
    },
    coords: { queryRenderedFeatures: () => query }, render: { canvas: () => ({ style: {} }) },
    ui: { popup: () => {
      const pop = { setLngLat(v) { this.at = v; return this; }, setHTML(v) { this.html = v; return this; }, remove() { removed++; } };
      popups.push(pop); return pop;
    }, attach: p => p },
  };
  /* (module-graph) js/hist-places.js is IMPORTED, fresh per runtime: the renderer, the clock and the language
     registry are stubs handed at its import edges, and `ctx` is the browser window it publishes to and reads
     its page-level collaborators from (js/hist-scale.js and js/label-scale.js are imported into it first). */
  const edges = {
    'js/geo-engine.js': { IntMapGeoEngine: ge },
    'js/lang-registry.js': { IntMapLang: { t: (lang, en, jp) => lang === 'jp' ? jp : en, htmlTag: lang => lang === 'jp' ? 'ja' : lang } },
    'js/chronos.js': { IntMapTime: { isLive: () => live, when: () => date, on(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } } },
  };
  const ctx = {
    IntMapSafe: { html: v => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) },
    IntMapMapTypography: { readerFont: () => ['Noto Sans Regular'] },
    IntMapPlaceReaders: { register(id, provider) { assert.ok(!readers.has(id)); readers.set(id, provider); return () => { readers.delete(id); unregistered++; }; } },
    addEventListener: (e, fn) => on(windowEvents, e, fn), removeEventListener: (e, fn) => off(windowEvents, e, fn),
  };
  ctx.window = ctx;
  const globals = { window: ctx, document: { baseURI: 'https://example.invalid/' },
    fetch: fetcher || (async () => ({ ok: true, json: async () => payload })) };
  await importModule('js/hist-scale.js', { globals });
  await importModule('js/label-scale.js', { globals });
  const { histPlaces } = await importModule('js/hist-places.js', { globals, mocks: edges });
  const host = { lang: 'en' }, api = histPlaces(host);
  return { ctx, api, host, layers, sources, popups, subscribers, listeners, layerEvents, windowEvents, readers,
    emit, writes: () => writes, removed: () => removed,
    unregistered: () => unregistered,
    tick(year) { live = year === null; if (!live) { date = new Date(0); date.setUTCFullYear(year, 5, 15); } for (const fn of subscribers) fn(); },
    query(hits) { query = hits; },
    click(e) { return readers.get('imhp-lbl').open(e.features[0], e); },
  };
}

test('#R709 real source population draws only in its periods, inherits city policy and survives style reload without loops', async () => {
  const h = await runtime(); await h.api.ensure();
  assert.ok(h.api.currentFC().features.length > 4000);
  assert.equal(h.api.state().activeRecords, h.api.currentFC().features.length);
  assert.equal(h.api.state().ready, true);
  assert.equal(h.api.state().visible, true);
  assert.ok(JSON.stringify(h.api.state()).length < 1000, 'Atlas receives compact provenance, not a source dump');
  const layer = h.layers.get('imhp-lbl');
  assert.equal(layer.minzoom, h.layers.get('ofm-city').minzoom);
  assert.deepEqual(layer.layout['text-size'], JSON.parse(JSON.stringify(h.ctx.IntMapLabelScale.place('city'))));
  const errors = validateStyleMin({ version: 8, glyphs: 'https://example.invalid/{fontstack}/{range}.pbf',
    sources: { 'imhp-src': { type: 'geojson', data: h.sources.get('imhp-src').data } }, layers: [layer] });
  assert.deepEqual(errors.map(e => e.message), []);
  const before = h.writes(); for (let n = 0; n < 20; n++) h.emit('styledata');
  assert.equal(h.writes(), before, 'stable style events never repaint source or layout');
  h.layers.get('ofm-city').layout.visibility = 'none'; h.emit('styledata');
  assert.equal(h.layers.get('imhp-lbl').layout.visibility, 'none');
  assert.equal(h.api.state().enabled, false);
  h.tick(1000); assert.ok(h.api.currentFC().features.length < 300, 'hidden labels still follow the actual clock');
  h.layers.get('ofm-city').layout.visibility = 'visible';
  h.layers.get('ofm-city').paint['text-color'] = '#000000'; h.emit('styledata');
  assert.equal(h.layers.get('imhp-lbl').paint['text-color'], '#000000');
  h.layers.delete('imhp-lbl'); h.sources.delete('imhp-src'); h.emit('styledata');
  assert.ok(h.layers.has('imhp-lbl'));
  assert.equal(h.sources.get('imhp-src').data.features.length, h.api.currentFC().features.length);
  h.tick(null); assert.equal(h.layers.get('imhp-lbl').layout.visibility, 'none');
  assert.equal(h.api.currentFC().features.length, 0);
  assert.equal(h.api.state().activeRecords, 0);
  h.api.dispose();
});

test('#R709 the shared source reader opens evidence with scripts, escaping and BCE boundaries and unregisters on disposal', async () => {
  const p = { id: 'pl-123', title: '<Source> ?', lon: 179, lat: 10,
    names: [{ a: 'Ἀθήναι', r: 'Athenae, Athenai', l: 'grc', s: -1, e: 1 }, { a: '別名', r: 'Alias', l: 'ja', s: -1, e: 1 }] };
  const h = await runtime({ ...data, places: [p] }); await h.api.ensure();
  h.tick(-1); assert.equal(h.api.currentFC().features.length, 0, 'JS year -1 is 2 BCE, before the -1 source bound');
  h.tick(0); assert.equal(h.api.currentFC().features.length, 1, '1 BCE is JS year zero');
  const feature = h.api.currentFC().features[0];
  assert.match(feature.properties.name, /\?$/);
  assert.equal(feature.properties.name, 'Athenae ?');
  const e = { features: [feature], lngLat: { lng: -181, lat: 10 } };
  assert.equal(h.layerEvents.size, 0, 'the source module has no competing click or hover handler');
  assert.equal(h.click(e), true);
  assert.equal(h.popups[0].at.lng, -181);
  assert.match(h.popups[0].html, /https:\/\/pleiades\.stoa\.org\/places\/123/);
  assert.match(h.popups[0].html, /&lt;Source&gt;/);
  assert.match(h.popups[0].html, /Ἀθήναι/);
  assert.match(h.popups[0].html, /Athenae, Athenai/);
  assert.match(h.popups[0].html, /別名/);
  assert.match(h.popups[0].html, /Approximate source periods/);
  assert.match(h.popups[0].html, /representative point/);
  assert.match(h.popups[0].html, /CC BY 3\.0/);
  h.tick(2); assert.equal(h.api.currentFC().features.length, 0);
  assert.ok(h.removed() > 0, 'popup closes when its period leaves the map');
  h.api.dispose();
  assert.equal(h.readers.size, 0);
  assert.equal(h.unregistered(), 1);
  assert.equal(h.subscribers.size, 0);
  for (const group of [h.listeners, h.layerEvents, h.windowEvents]) for (const fns of group.values()) assert.equal(fns.size, 0);
  assert.ok(!h.layers.has('imhp-lbl') && !h.sources.has('imhp-src'));
});

test('#R709 disposing a pending load aborts it and prevents late results restoring layers', async () => {
  let resolve, signal;
  const h = await runtime(data, true, async (url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  h.tick(300);
  const ready = h.api.ensure();
  h.api.dispose();
  assert.ok(signal.aborted);
  resolve({ ok: true, json: async () => data }); await ready;
  assert.ok(!h.layers.has('imhp-lbl') && !h.sources.has('imhp-src'));
});

for (const nextYear of [1000, null]) test(`#R709 a clock change to ${nextYear === null ? 'Now' : nextYear} closes source cards while the renderer is not drawable`, async () => {
  const h = await runtime(); await h.api.ensure();
  const first = h.api.currentFC().features[0];
  assert.ok(h.api.open(first.properties.id));
  const closedBefore = h.removed(), writesBefore = h.writes();
  h.host.canDraw = () => false;
  h.tick(nextYear);
  assert.equal(h.removed(), closedBefore + 1, 'DOM evidence must stop describing the old year immediately');
  assert.equal(h.writes(), writesBefore, 'renderer mutations still wait until its style is writable');
  h.host.canDraw = () => true;
  h.emit('styledata');
  if (nextYear === null) {
    assert.equal(h.layers.get('imhp-lbl').layout.visibility, 'none');
    assert.equal(h.api.currentFC().features.length, 0);
  } else {
    assert.equal(h.layers.get('imhp-lbl').layout.visibility, 'visible');
    assert.equal(h.sources.get('imhp-src').data.features.length, h.api.state().activeRecords);
    assert.ok(h.api.currentFC().features.length < 300, 'recovery publishes the new century, not the old source collection');
  }
  h.api.dispose();
});

const readJson = name => JSON.parse(readFileSync(new URL('../' + name, import.meta.url), 'utf8'));

test('#R712 modern-name evidence never removes an otherwise eligible independent historical place', () => {
  const ancient = { r: 'Ancient source name', a: '', l: 'la', s: -500, e: 600 };
  const modern = { r: 'Modern source name', a: '', l: 'en', s: 1700, e: 2100 };
  const p = { id: '1', title: 'Source settlement', rights: 'Creative Commons Attribution 3.0',
    types: ['settlement'], rp: [10, 20], names: [ancient, modern] };
  const record = { source: SOURCE, asOf: '2026-09-11', places: selectRecords([p], 2026) };
  assert.equal(record.places.length, 1);
  const result = compile(record, new Set(['pl-other']));
  assert.equal(result.places.length, 1);
  assert.deepEqual(result.places[0].names, [ancient, modern], 'both assertions retain their own periods');
  assert.equal(compile(record, new Set(['pl-1'])).places.length, 0, 'only actual shipped identity suppresses duplication');
});

test('#R712 every eligible source identity reaches exactly one of the historical place delivery paths', () => {
  const record = readJson('scripts/histplaces/pleiades-record.json');
  const cities = new Set(readJson('data/hist-cities.json').cities.map(p => p.id));
  const places = readJson('data/hist-places.json').places;
  const ids = new Set(places.map(p => p.id));
  assert.equal(ids.size, places.length);
  let modernNames = 0;
  for (const p of record.places) {
    const id = 'pl-' + p.id;
    assert.notEqual(cities.has(id), ids.has(id), id + ' must reach exactly one delivery path');
    if (ids.has(id) && p.names.some(n => n.e >= 2026)) modernNames++;
  }
  assert.ok(modernNames > 0, 'the actual source population must exercise the former coverage gap');
  assert.deepEqual(compile(record, cities).places, places);
});
