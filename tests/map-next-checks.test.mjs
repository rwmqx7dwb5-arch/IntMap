/* ============================================================================
 *  map-next — the reader's own map: kept, carried by the link, read back without trusting it,
 *  measured, analysed, exported, and reached by Atlas   (node --test)
 * ----------------------------------------------------------------------------
 *  What is held here, by running the code (not by reading it):
 *    ① the path codec (js/my-map-doc.js) round-trips vertices exactly at the stored precision, and the link
 *      form round-trips a map — Japanese words included;
 *    ② a link is not trusted: a feature that does not read is COUNTED and left out, control and
 *      bidirectional characters are cleaned, a colour can only be one of the palette;
 *    ③ the map state carries it as `&mm=` — last, so every link written before is byte-identical — and its
 *      owner is fetched only when a restore carries a drawing (js/map-state.js `lazy`);
 *    ④ the geometry drawn is the great circle in pieces of at most DENSIFY_DEG, cut at the antimeridian, and an
 *      area round a pole is refused rather than drawn as the other half of the Earth;
 *    ⑤ the controller (js/my-map.js): add / edit / remove / maps, kept across a reload, a link of one's own map
 *      brings back one's own copy, someone else's is shown read-only and can be kept, collect MOVES the session's
 *      pins and shapes, analysis registers a dataset that says who drew it;
 *    ⑥ the file it exports is read back by the import path a dropped file takes (js/geo-import.js);
 *    ⑦ Atlas: `map.myMap` is a registry row watched by the `myMap` observer, whose verdict is «the state asked
 *      for, observed after»; the catalogue describes it in English and Japanese.
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { importModule } from './helpers/import-module.mjs';
/* read by name (scripts/export-readers.mjs counts static imports) */
import { encodePath, decodePath, toLinkValue, fromLinkValue, geometryOf, polar, labelPoint, toFeatureCollection, makeFeature, newDoc, readDoc, COORD_SCALE, DENSIFY_DEG, PALETTE } from '../js/my-map-doc.js';
import { LAZY_REGISTRY } from '../js/lazy-modules.js';
/* the SAME instance js/my-map.js imports (importModule would evaluate a fresh copy of it, with its own owners) */
import { MapState } from '../js/map-state.js';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); } };
if (!globalThis.window) globalThis.window = globalThis;
await importModule('js/geodesy.js');
const G = window.IntMapGeodesy;
const strip = (fs) => fs.map((f) => ({ kind: f.kind, name: f.name, note: f.note, color: f.color, coords: f.coords }));

test('① the path codec is exact at the stored precision, and the link form round-trips a map', () => {
  const c = [[139.767125, 35.681236], [135.5, 34.7], [-179.999999, -89.5], [179.999999, 89.5], [0, 0]];
  assert.deepEqual(decodePath(encodePath(c)), c);
  assert.equal(COORD_SCALE, 1e6);
  const doc = newDoc('遠足の地図');
  doc.features.push(makeFeature({ kind: 'pin', coords: [[139.7671254321, 35.6812361234]], name: '集合場所', note: '8:30 に改札前' }).feature);
  doc.features.push(makeFeature({ kind: 'line', coords: [[139.7, 35.6], [139.8, 35.7], [139.9, 35.65]], name: 'route', color: PALETTE[4] }).feature);
  doc.features.push(makeFeature({ kind: 'area', coords: [[139, 35], [140, 35], [140, 36], [139, 35]], name: '範囲' }).feature);
  assert.deepEqual(doc.features[0].coords, [[139.767125, 35.681236]], 'a vertex is rounded where it enters the map, to 1e-6°');
  assert.equal(doc.features[2].coords.length, 3, 'an area\'s repeated closing vertex is implied, not stored');
  const back = fromLinkValue(JSON.parse(JSON.stringify(toLinkValue(doc))));
  assert.equal(back.ok, true); assert.equal(back.dropped, 0);
  assert.equal(back.doc.id, doc.id); assert.equal(back.doc.title, '遠足の地図');
  assert.deepEqual(strip(back.doc.features), strip(doc.features));
  /* and through the map state's own packing (base64url JSON, like `s=`) */
  const h = MapState.encode({ view: { lng: 139.7, lat: 35.68, zoom: 9, bearing: 0, pitch: 0, proj: 'flat' }, mymap: toLinkValue(doc) });
  assert.match(h, /&mm=[A-Za-z0-9_-]+$/);
  assert.deepEqual(strip(fromLinkValue(MapState.decode(h).mymap).doc.features), strip(doc.features));
});

test('② a link is read, not trusted: what does not read is counted, words are cleaned, colours are the palette', () => {
  const ok = encodePath([[1, 2]]);
  const v = { v: 1, i: 'mabcd1234', t: 'x‮y\u0007z', f: [
    ['p', 'a‮named\u0000pin', 'note', 99, ok],          /* colour index out of range → the first colour */
    ['q', 'bad kind', '', 0, ok],                            /* not a kind */
    ['l', 'one vertex is not a line', '', 0, ok],            /* too few */
    ['p', 'broken path', '', 0, '\u0001\u0002'],              /* not the alphabet */
    ['a', 'lat out of range', '', 0, encodePath([[0, 0], [1, 95], [2, 0]])],
    'not a row',
  ] };
  const r = fromLinkValue(v);
  assert.equal(r.ok, true);
  assert.equal(r.doc.features.length, 1); assert.equal(r.dropped, 5, 'the features that did not read were not counted');
  assert.equal(r.doc.features[0].name, 'a named pin'); assert.equal(r.doc.title, 'x y z');
  assert.ok(PALETTE.indexOf(r.doc.features[0].color) >= 0);
  assert.equal(fromLinkValue({ v: 1, f: [] }).ok, false, 'a map with no identifier was accepted');
  assert.equal(fromLinkValue({ v: 2, i: 'mabcd1234', f: [] }).ok, false);
  assert.equal(fromLinkValue(null).ok, false);
  /* a stored library that an older build wrote is held to today's rules the same way */
  const st = readDoc({ v: 1, id: 'mold12345', title: 't', features: [{ kind: 'pin', coords: [[1, 2]] }, { kind: 'area', coords: [[0, 0]] }] });
  assert.equal(st.doc.features.length, 1); assert.equal(st.dropped, 1);
});

test('③ the map state carries it last, and fetches its owner only for a link that carries a drawing', () => {
  /* ⚠ (data-studio) THE INTENT IS «APPENDED, NOT INSERTED», NOT «LAST FOR EVER». `mm` was the last parameter when it was
     added, so every older link stayed byte-identical; a later field (`ds`, js/data-studio.js) is appended after it for the
     same reason. What must hold is that `mm` comes after every field older links carry and that nothing was put before it
     since — the byte check on `old` below is the measurement of that. */
  const rows = MapState.SCHEMA.filter((f) => f.params.length);
  const keys = rows.map((f) => f.key);
  assert.deepEqual(keys.slice(keys.indexOf('mymap')), ['mymap', 'ds'], 'mm must stay after every older field, with only later fields appended after it');
  const old = '#v=139.7000,35.6800,9.00,0,0,f&l=dl-quakes&tt=1914-06-15&title=T&note=N';
  assert.equal(MapState.encode(MapState.decode(old)), old);
  assert.equal(MapState.decode(old).mymap, null);
  const asked = [];
  window.IntMapLazy = { need: (n) => { asked.push(n); return Promise.resolve(true); } };
  MapState.restore(old, { full: true });
  assert.deepEqual(asked, [], 'a link with no drawing fetched the drawing module');
  const d = newDoc('m'); d.features.push(makeFeature({ kind: 'pin', coords: [[1, 2]] }).feature);
  const withMm = MapState.encode({ view: { lng: 1, lat: 2, zoom: 5, bearing: 0, pitch: 0, proj: 'flat' }, mymap: toLinkValue(d) });
  MapState.restore(withMm, { full: true });
  assert.deepEqual(asked, ['myMap'], 'a link carrying a drawing did not ask for its owner');
  const plain = MapState.restore(withMm, { full: false });   /* a crashed reload: 'full' fields are not restored */
  assert.ok(plain); assert.deepEqual(asked, ['myMap']);
  delete window.IntMapLazy;
});

test('④ drawn geometry: great-circle pieces, cut at the antimeridian; a polar ring is refused', () => {
  const line = makeFeature({ kind: 'line', coords: [[170, 10], [-170, 10]] }).feature;
  const g = geometryOf(line, G);
  assert.equal(g.type, 'MultiLineString', 'a line across the antimeridian must be cut, not drawn the long way round');
  g.coordinates.forEach((part) => part.forEach((p) => assert.ok(p[0] >= -180 && p[0] <= 180)));
  const n = g.coordinates.reduce((s, p) => s + p.length, 0);
  assert.ok(n >= Math.ceil(20 / DENSIFY_DEG) * 0.9, 'the edge was not drawn in pieces');
  const area = makeFeature({ kind: 'area', coords: [[170, 10], [-170, 10], [-170, 20], [170, 20]] }).feature;
  const ga = geometryOf(area, G);
  assert.equal(ga.type, 'MultiPolygon');
  ga.coordinates.forEach((poly) => { const r = poly[0]; assert.deepEqual(r[0], r[r.length - 1], 'a ring must close'); });
  const pole = makeFeature({ kind: 'area', coords: [[0, 80], [120, 80], [-120, 80]] }).feature;
  assert.equal(polar(pole, G), true); assert.equal(geometryOf(pole, G), null);
  const lp = labelPoint(area, G); assert.ok(Math.abs(Math.abs(lp[0]) - 180) < 1, 'the label of a ring across the seam went to the far side');
  const fc = toFeatureCollection({ v: 1, id: 'mx', title: '', updated: 0, features: [pole, line] }, G, () => ({ lengthKm: 1 }));
  assert.equal(fc.features[0].geometry, null); assert.equal(fc.features[0].properties.polar, true);
  assert.equal(fc.features[1].properties.length_km, 1);
});

/* the controller, on a page with no renderer: the map layers are skipped (the engine says it cannot draw) and
   everything the reader made is still kept, linked and read back */
const pins = [{ id: 'p1', lng: 139.7, lat: 35.6, meta: { name: 'old pin' } }], annots = [{ id: 'an1', geom: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, name: 'measured', color: '#0a84ff' }], radii = [{ id: 'r1', center: [10, 10], radiusKm: 5, color: '#34c759' }];
window.IntMapAnnotations = { _items: annots, remove: (id) => { const i = annots.findIndex((x) => x.id === id); if (i >= 0) annots.splice(i, 1); } };
window.removeRadiusItem = (id) => { const i = radii.findIndex((x) => x.id === id); if (i >= 0) radii.splice(i, 1); };
const HOST = { lang: 'en', canDraw: () => true, imToast: () => { }, ringArea: () => 12.5, distHTML: (k) => k + ' km', areaHTML: (k) => k + ' km²', distTXT: (k) => k + ' km', areaTXT: (k) => k + ' km²',
  userPins: pins, radiusItems: radii, removePin: (id) => { const i = pins.findIndex((x) => x.id === id); if (i >= 0) pins.splice(i, 1); }, toolMode: null };
/* the renderer, as its contract: what the map is handed is recorded, so «it is on the map» is measured here too */
const drawn = new Map(), layers = new Set();
const GEstub = { layers: { hasSource: (id) => drawn.has(id), addSource: (id, d) => { drawn.set(id, d.data); }, setSourceData: (id, d) => { drawn.set(id, d); },
    has: (id) => layers.has(id), add: (spec) => { layers.add(spec.id); } },
  events: { on() { }, off() { }, onLayer() { }, claimClick() { } }, render: { claim() { }, canvas: () => ({ style: {} }) }, input: { set() { } },
  whenCanDraw: () => new Promise(() => { }), coords: { project: (p) => ({ x: p[0], y: p[1] }) } };
const { myMap } = await importModule('js/my-map.js', { mocks: { 'js/geo-engine.js': { IntMapGeoEngine: GEstub } } });

test('⑤ the controller keeps, links, receives and collects', async () => {
  const M = myMap(HOST);
  const a = M.add({ kind: 'pin', coords: [[139.7671, 35.6812]], name: '東京駅', note: '北口' });
  assert.equal(a.ok, true);
  const b = M.add({ kind: 'area', coords: [[139, 35], [140, 35], [140, 36]] });
  assert.equal(M.add({ kind: 'line', coords: [[1, 1]] }).reason, 'too-few-vertices');
  assert.equal(M.edit(a.id, { note: 'south‮ exit' }).ok, true);
  assert.equal(M.state().features.find((f) => f.id === a.id).note, 'south  exit'.replace(/\s+/g, ' '));
  assert.equal(M.state().features.find((f) => f.id === b.id).areaKm2, 12.5, 'the area is the measure tool\'s answer (HOST.ringArea)');
  assert.equal(M.state().shown, 'own');
  assert.equal(drawn.get('mymap-src').features.length, 2, 'the map was not handed what was drawn');
  assert.deepEqual(drawn.get('mymap-lbl-src').features.map((f) => f.properties.name), ['東京駅'], 'only a named feature is labelled');
  /* the address bar's value is the map, in its link form */
  const lv = MapState.read('mymap'); assert.equal(fromLinkValue(lv).doc.features.length, 2);
  /* kept across a reload: a second controller reads the same library */
  const id0 = M.state().map.id;
  const M2 = myMap(HOST);
  assert.equal(M2.state().map.id, id0); assert.equal(M2.state().features.length, 2);
  /* a link of one's own map brings back one's own copy — newer than the link */
  const stale = JSON.parse(JSON.stringify(lv)); stale.f = stale.f.slice(0, 1);
  MapState.restore(MapState.encode({ view: { lng: 1, lat: 1, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, mymap: stale }), { full: true });
  await new Promise((r) => setTimeout(r, 380));
  assert.equal(M2.state().shown, 'own'); assert.equal(M2.state().showing.count, 2, 'one\'s own map was replaced by an older link of it');
  /* someone else's map is shown read-only, and can be kept as a copy */
  const theirs = newDoc('their map'); theirs.features.push(makeFeature({ kind: 'pin', coords: [[2, 2]], name: 'x' }).feature);
  try { MapState.restore(MapState.encode({ view: { lng: 1, lat: 1, zoom: 3, bearing: 0, pitch: 0, proj: 'flat' }, mymap: toLinkValue(theirs) }), { full: true }); } catch (_) { }
  await new Promise((r) => setTimeout(r, 380));
  assert.equal(M2.state().shown, 'received'); assert.equal(M2.add({ kind: 'pin', coords: [[0, 0]] }).reason, 'received');
  const k = M2.keepReceived(); assert.equal(k.ok, true);
  assert.notEqual(k.id, theirs.id, 'a kept copy must be the reader\'s map, not the sender\'s identifier');
  assert.equal(M2.state().maps.length, 2);
  /* collect MOVES the session's objects in: a pin, a kept line, a radius circle as a 64-gon that says so */
  const before = M2.state().features.length;
  const c = M2.collect(); assert.equal(c.ok, true); assert.equal(c.moved, 3);
  assert.equal(pins.length + annots.length + radii.length, 0, 'the session objects were copied, not moved');
  const st = M2.state(); assert.equal(st.features.length, before + 3);
  assert.ok(st.features.some((f) => /64/.test(f.name) && f.kind === 'area' && f.vertices === 64));
  /* the dataset analysis receives says who drew it, and that it is a snapshot of which map */
  window.IntMapLazy = { need: () => Promise.resolve(true) };
  const { makeGisDatasets } = await importModule('js/gis-datasets.js');
  window.IntMapData = makeGisDatasets();
  const an = await M2.analyze({ open: false });
  assert.equal(an.ok, true, JSON.stringify(an));
  const rec = window.IntMapData.get(an.datasetId);
  assert.equal(rec.provenance.kind, 'sketch'); assert.equal(rec.provenance.author, 'reader'); assert.equal(rec.provenance.map, st.map.id);
  assert.equal(rec.count, st.features.length);
  assert.equal(window.IntMapData.editable(rec.id).ok, true, 'a drawn dataset is the reader\'s and can be edited');
  M2.hide(); assert.equal(MapState.read('mymap'), null, 'a hidden map is still in the address bar');
  delete window.IntMapLazy;
});

test('⑥ the exported file is read back by the import path a dropped file takes', async () => {
  const { GEO_IMPORT } = await importModule('js/geo-import.js');
  const { makeGisExport } = await importModule('js/gis-export.js');
  const doc = newDoc('trip');
  doc.features.push(makeFeature({ kind: 'pin', coords: [[139.767125, 35.681236]], name: '駅', note: 'n' }).feature);
  doc.features.push(makeFeature({ kind: 'line', coords: [[170, 10], [-170, 10]], name: 'seam' }).feature);
  const fc = toFeatureCollection(doc, G, () => ({}));
  const out = makeGisExport().write({ id: doc.id, title: doc.title, kind: 'vector', crs: 'EPSG:4326', features: () => fc.features, provenance: { kind: 'sketch', author: 'reader' } }, { format: 'geojson' });
  assert.equal(out.ok, true, JSON.stringify(out));
  const back = await GEO_IMPORT.readGeoFile(new File([Buffer.from(out.bytes)], out.filename));
  assert.equal(back.ok, true, JSON.stringify(back.why || null));
  assert.equal(back.fc.features.length, 2);
  assert.deepEqual(back.fc.features[0].geometry.coordinates, [139.767125, 35.681236]);
  assert.equal(back.fc.features[0].properties.name, '駅');
  assert.equal(back.fc.features[1].geometry.type, 'MultiLineString');
});

test('⑦ Atlas reaches it: a registry row, its own observer, a catalogue entry in both languages', async () => {
  assert.ok(LAZY_REGISTRY.myMap && LAZY_REGISTRY.myMap.publishes === 'IntMapMyMap');
  const { makeAtlasCapabilities } = await importModule('js/atlas-capabilities.js');
  const CAPS = makeAtlasCapabilities({ lang: 'en' });
  const cap = CAPS.resolve('map.myMap');
  assert.ok(cap, 'map.myMap is not registered'); assert.equal(cap.observerKind, 'myMap');
  let st = { shown: 'own', map: { id: 'mA', title: 't' }, showing: { count: 1 }, features: [{ id: 'f1', name: 'a', note: '', color: '#ff3b30' }] };
  window.IntMapMyMap = { state: () => st };
  const before = await cap.observe();
  st = { shown: 'own', map: { id: 'mA', title: 't' }, showing: { count: 2 }, features: [{ id: 'f1', name: 'a', note: '', color: '#ff3b30' }, { id: 'f2', name: 'b', note: '', color: '#ff3b30' }] };
  const after = await cap.observe();
  assert.equal(cap.verify({}, {}, before, after, { ok: true, want: { shown: 'own', has: ['f2'] } }).status, 'completed');
  /* the observer's own verdict — the registry wraps a negative given while no renderer can be asked into
     「could not look」 (atlas-observer-undo), which is what this headless process is */
  const V = CAPS.OBSERVERS.myMap.verify;
  assert.equal(V({}, {}, before, before, { ok: true, want: { shown: 'own', has: ['f2'] } }).code, 'no_change', 'a feature that did not land was called done');
  assert.equal(cap.verify({}, {}, before, before, { ok: true, want: { shown: 'own', has: ['f2'] } }).status, 'unobserved');
  assert.equal(cap.verify({}, {}, after, after, { ok: true, want: { shown: 'own', has: ['f2'] } }).code, 'already_there');
  assert.equal(V({}, {}, before, after, { ok: true, want: { features: { f1: { name: 'zz' } } } }).code, 'no_change');
  assert.equal(V({}, {}, before, Object.assign({}, after, { drawn: 0 }), { ok: true, want: { shown: 'own', has: ['f2'] } }).code, 'not_rendered', 'a map shown with features and nothing drawn was called done');
  assert.equal(cap.verify({}, {}, before, after, { ok: true }).status, 'completed', 'a read with no want must complete on its answer');
  delete window.IntMapMyMap;
  assert.equal(cap.verify({}, {}, before, await cap.observe(), { ok: true, want: { shown: 'own' } }).status, 'unobserved', '«could not be asked» was reported as a result');
  const { makeAtlasCatalogText } = await importModule('js/atlas-catalog-text.js');
  const text = makeAtlasCatalogText({ lang: 'en' }, {}).text(['map.myMap']);
  assert.match(text, /"type":"myMap"/); assert.match(text, /マイマップ/); assert.match(text, /my map/i);
});
