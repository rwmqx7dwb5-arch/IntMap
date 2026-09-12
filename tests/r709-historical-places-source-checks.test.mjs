import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { compile, eligible, selectRecords, SOURCE } from '../scripts/build-hist-places.mjs';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const record = JSON.parse(read('scripts/histplaces/pleiades-record.json'));
const data = JSON.parse(read('data/hist-places.json'));
const cityIds = new Set(JSON.parse(read('data/hist-cities.json')).cities.map(p => p.id));

test('the shipped source places are an exact licensed derivation, with source names and uncertainty intact', () => {
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

test('eligibility is source-based; modern identity, non-settlements, dates and licence cannot be guessed', () => {
  const p = { id: '1', title: 'Source place', rp: [10, 20], types: ['settlement'],
    rights: 'Creative Commons Attribution 3.0', names: [{ r: 'A', a: '', l: '', s: -500, e: 500 }] };
  assert.ok(eligible(p, 2026));
  assert.ok(!eligible({ ...p, names: [...p.names, { r: 'A', s: 1700, e: 2100 }] }, 2026));
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

function runtime(payload = data, initialLive = false, fetcher) {
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
  const ctx = vm.createContext({ console, URL, AbortController, document: { baseURI: 'https://example.invalid/' },
    fetch: fetcher || (async () => ({ ok: true, json: async () => payload })),
    IntMapGeoEngine: ge, IntMapLang: { t: (lang, en, jp) => lang === 'jp' ? jp : en, htmlTag: lang => lang === 'jp' ? 'ja' : lang },
    IntMapSafe: { html: v => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]) },
    IntMapMapTypography: { readerFont: () => ['Noto Sans Regular'] },
    IntMapPlaceReaders: { register(id, provider) { assert.ok(!readers.has(id)); readers.set(id, provider); return () => { readers.delete(id); unregistered++; }; } },
    IntMapTime: { isLive: () => live, when: () => date, on(fn) { subscribers.add(fn); return () => subscribers.delete(fn); } },
    addEventListener: (e, fn) => on(windowEvents, e, fn), removeEventListener: (e, fn) => off(windowEvents, e, fn),
  });
  ctx.window = ctx;
  vm.runInContext(read('js/hist-scale.js'), ctx);
  vm.runInContext(read('js/label-scale.js'), ctx);
  vm.runInContext(read('js/hist-places.js'), ctx);
  const host = { lang: 'en' }, api = ctx.IntMapModules.histPlaces(host);
  return { ctx, api, host, layers, sources, popups, subscribers, listeners, layerEvents, windowEvents, readers,
    emit, writes: () => writes, removed: () => removed,
    unregistered: () => unregistered,
    tick(year) { live = year === null; if (!live) { date = new Date(0); date.setUTCFullYear(year, 5, 15); } for (const fn of subscribers) fn(); },
    query(hits) { query = hits; },
    click(e) { return readers.get('imhp-lbl').open(e.features[0], e); },
  };
}

test('real source population draws only in its periods, inherits city policy and survives style reload without loops', async () => {
  const h = runtime(); await h.api.ensure();
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

test('the shared source reader opens evidence with scripts, escaping and BCE boundaries and unregisters on disposal', async () => {
  const p = { id: 'pl-123', title: '<Source> ?', lon: 179, lat: 10,
    names: [{ a: 'Ἀθήναι', r: 'Athenae, Athenai', l: 'grc', s: -1, e: 1 }, { a: '別名', r: 'Alias', l: 'ja', s: -1, e: 1 }] };
  const h = runtime({ ...data, places: [p] }); await h.api.ensure();
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

test('disposing a pending load aborts it and prevents late results restoring layers', async () => {
  let resolve, signal;
  const h = runtime(data, true, async (url, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  h.tick(300);
  const ready = h.api.ensure();
  h.api.dispose();
  assert.ok(signal.aborted);
  resolve({ ok: true, json: async () => data }); await ready;
  assert.ok(!h.layers.has('imhp-lbl') && !h.sources.has('imhp-src'));
});

for (const nextYear of [1000, null]) test(`a clock change to ${nextYear === null ? 'Now' : nextYear} closes source cards while the renderer is not drawable`, async () => {
  const h = runtime(); await h.api.ensure();
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
