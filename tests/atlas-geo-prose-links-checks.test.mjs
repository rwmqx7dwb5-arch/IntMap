/* Atlas · the prose, the legend and the map share ONE reference to a geographic object.
   Driven against the modules the browser runs (js/atlas-geo-refs.js, js/atlas-map-compose.js, js/atlas-geo-ledger.js) with a fake engine. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeAtlasGeoRefs } from '../js/atlas-geo-refs.js';
import { makeAtlasGeoLedger } from '../js/atlas-geo-ledger.js';
import { makeAtlasGeoObject } from '../js/atlas-geo-object.js';
import { makeAtlasMapCompose } from '../js/atlas-map-compose.js';

const GEOBJ = makeAtlasGeoObject();
const newLedger = () => makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
const placedResult = (placed, shapes) => ({ meta: { compose: { placed, shapes: shapes || [] } } });

function fakeEngine() {
  const calls = { flyTo: [], fitBounds: [], layers: [], data: {} };
  const layers = new Set(), sources = new Set();
  const g = {
    layers: { hasSource: (i) => sources.has(i), addSource: (i) => sources.add(i), setSourceData: (i, d) => { calls.data[i] = d; }, has: (i) => layers.has(i),
      add: (d) => { layers.add(d.id); calls.layers.push(d); }, setVisible() {}, getLayout: () => 'visible' },
    camera: { flyTo: (o) => calls.flyTo.push(o), fitBounds: (b, o) => calls.fitBounds.push([b, o]), getZoom: () => 3 },
    events: { onLayer() {}, on() {} }, render: { canvas: () => ({ style: {} }), claim() {} },
  };
  return { GE: () => g, calls };
}

test('refs: everything the turn resolved is a ref, placed or not — and nothing it did not resolve', () => {
  const ledger = newLedger();
  ledger.beginTurn(1);
  ledger.record({ name: 'Old Place', kind: 'city', lng: 1, lat: 1, provenance: 'geocoded_point' });
  ledger.beginTurn(2);
  ledger.record({ name: 'Channel Tunnel', kind: 'tunnel', lng: 1.5, lat: 51, provenance: 'geocoded_point', bbox: [1.1, 50.9, 1.8, 51.1] });
  ledger.record({ name: 'Gare du Nord', kind: 'station', lng: 2.355, lat: 48.88, provenance: 'geocoded_point' });
  ledger.record({ name: 'No Coordinate', kind: 'city' });   /* nothing to move the camera to */
  const R = makeAtlasGeoRefs({ ledger });
  const list = R.build([], { turn: ledger.turn() });
  const names = list.map((r) => r.name).sort();
  assert.deepEqual(names, ['Channel Tunnel', 'Gare du Nord'], 'this turn only; no coordinate → not a link');
  const tun = list.find((r) => r.name === 'Channel Tunnel');
  assert.equal(tun.extent, 'line'); assert.ok(tun.bbox);
  assert.ok(list.every((r) => r.placed === false && r.n == null), 'unplaced refs carry no number');
  assert.ok(list.every((r) => r.spellings.every((s) => s.indexOf(':') < 0)), "the ledger's own identifier is not a word in an answer");
});

test('refs: a placed record outranks the ledger entry for the same object; a past reply keeps its refs', () => {
  const ledger = newLedger(); ledger.beginTurn(1);
  const e = ledger.record({ name: 'St Pancras', kind: 'station', lng: -0.126, lat: 51.532, provenance: 'geocoded_point' });
  const R = makeAtlasGeoRefs({ ledger });
  const res = [placedResult([{ id: e.stableId, n: 1, name: 'St Pancras', kind: 'station', lng: -0.126, lat: 51.532, color: '#0a84ff', role: 'start', note: 'Eurostar terminus', spellings: ['St Pancras'], item: 1 }])];
  const first = R.build(res, { turn: 1 });
  assert.equal(first.length, 1); assert.equal(first[0].placed, true); assert.equal(first[0].n, 1); assert.equal(first[0].note, 'Eurostar terminus');
  ledger.beginTurn(2); ledger.record({ name: 'Elsewhere', kind: 'city', lng: 5, lat: 5, provenance: 'geocoded_point' });
  const later = R.build([], { turn: 1, prev: first });
  assert.equal(later.length, 1, 'refs the reply already held are never forgotten');
});

test('refs.view: a spot is centred, a region or a course is framed whole', () => {
  const R = makeAtlasGeoRefs({});
  assert.deepEqual(R.view({ lng: 2, lat: 48, extent: 'point' }, 3).kind, 'point');
  assert.ok(R.view({ lng: 2, lat: 48, extent: 'point' }, 3).zoom >= 9);
  assert.equal(R.view({ lng: 2, lat: 48, extent: 'point' }, 12).zoom, 12, 'never zoomed OUT');
  const v = R.view({ lng: 1.5, lat: 51, extent: 'line', bbox: [1.1, 50.9, 1.8, 51.1] }, 3);
  assert.equal(v.kind, 'bounds'); assert.deepEqual(v.bounds, [[1.1, 50.9], [1.8, 51.1]]);
  assert.equal(R.view({ extent: 'point' }, 3), null, 'no position → nothing to do');
  assert.deepEqual(R.bboxOf({ type: 'LineString', coordinates: [[1, 2], [3, 5]] }), [1, 2, 3, 5]);
});

test('linkProse: an object Atlas resolved links without a badge; an unrelated name does not; first occurrence only', () => {
  const { GE } = fakeEngine();
  const C = makeAtlasMapCompose({ GE });
  const html = '<p>Eurostar passes through the Channel Tunnel to Gare du Nord. Then Gare du Nord again, and Lisbon is far away.</p>';
  const out = C.linkProse(html, [
    { id: 'tunnel', name: 'Channel Tunnel', spellings: ['Channel Tunnel'], placed: false },
    { id: 'gdn', name: 'Gare du Nord', n: 2, color: '#30d158', spellings: ['Gare du Nord'], placed: true }]);
  assert.match(out, /<span class="atl-geo-ref" data-geo="tunnel" role="button" tabindex="0">Channel Tunnel<\/span>/, 'no badge on an unnumbered object');
  assert.match(out, /data-geo="gdn"[^>]*>Gare du Nord<span class="atl-geo-n"[^>]*>2<\/span>/, 'a placed one keeps its number');
  assert.equal((out.match(/data-geo="gdn"/g) || []).length, 1, 'first occurrence only');
  assert.ok(!/data-geo="[^"]*"[^>]*>Lisbon/.test(out), 'a name that is not a resolved object is not a link');
});

test('legend: both ends of a route in the places table are references (they had no data-geo)', async () => {
  const eng = fakeEngine();
  const ledger = newLedger();
  const GEO = { 'london': { lng: -0.12, lat: 51.5, name: 'London' }, 'paris': { lng: 2.35, lat: 48.85, name: 'Paris' } };
  const C = makeAtlasMapCompose({ GE: eng.GE, ledger, geoObject: GEOBJ.geoObject, geocode: async (q) => GEO[String(q).toLowerCase()] || null, dispatch: async () => ({ ok: true }) });
  const r = await C.run({ items: [{ name: 'London', role: 'start' }, { name: 'Paris', role: 'end', note: 'Gare du Nord is the terminus' }], relations: [{ from: 'London', to: 'Paris', type: 'link' }] });
  assert.equal(r.ok, true);
  const rel = r.meta.compose.links[0];
  assert.ok(rel.fromId && rel.toId, 'the published relation names its end-points by id');
  assert.ok(r.html.indexOf('data-geo="' + rel.fromId + '"') >= 0 && r.html.indexOf('data-geo="' + rel.toId + '"') >= 0);
  const spans = r.html.match(/<span class="atl-cmp-rel">.*?<\/span><span class="atl-cmp-arr">/);
  assert.match(spans[0], /data-geo=/, 'the badge inside the route row is clickable');
  assert.equal(r.meta.compose.placed[1].note, 'Gare du Nord is the terminus', 'the hover text is data written at placement');
});

test('click: a reference works from a past reply — it reads the bubble\'s refs, not the live records — and adds no marker', async () => {
  const eng = fakeEngine();
  const C = makeAtlasMapCompose({ GE: eng.GE });
  const el = { __atlGeoRefs: [{ id: 'tunnel', name: 'Channel Tunnel', extent: 'line', lng: 1.5, lat: 51, bbox: [1.1, 50.9, 1.8, 51.1], spellings: [] },
    { id: 'gdn', name: 'Gare du Nord', extent: 'point', lng: 2.355, lat: 48.88, spellings: [] }] };
  const nodes = [];
  const mk = (id) => { const n = { __h: {}, getAttribute: () => id, addEventListener(t, f) { this.__h[t] = f; }, click() { this.__h.click({ preventDefault() {} }); } }; nodes.push(n); return n; };
  el.querySelectorAll = () => [mk('tunnel'), mk('gdn')];
  assert.equal(C.bind(el), 2);
  assert.deepEqual(C.records(), [], 'nothing is drawn now — the current render holds no records');
  nodes[0].click(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(eng.calls.fitBounds.length, 1, 'a course is framed whole');
  nodes[1].click(); await new Promise((r) => setTimeout(r, 20));
  assert.equal(eng.calls.flyTo.length, 1, 'a spot is centred');
  assert.deepEqual(eng.calls.flyTo[0].center, [2.355, 48.88]);
  assert.deepEqual(C.records(), [], 'the click added no marker');
  const flash = eng.calls.data['atl-geo-flash-src'];
  assert.ok(flash && flash.features.length === 1, 'the object is lit in a source of its own');
  C.clear();
  assert.equal(eng.calls.data['atl-geo-flash-src'].features.length, 0, 'and cleared with the map');
});

test('labels: the names of what Atlas placed are not optional — a basemap label does not take their place', async () => {
  const eng = fakeEngine();
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode: async () => ({ lng: 1, lat: 1, name: 'X' }), dispatch: async () => ({ ok: true }) });
  await C.run({ items: [{ name: 'X' }] });
  const t = eng.calls.layers.find((l) => l.id === 'atl-compose-t');
  assert.ok(t, 'the name layer exists');
  assert.ok(!('text-optional' in t.layout), 'text-optional would drop the name on a collision');
  assert.ok(!t.layout['text-allow-overlap'] || t.layout['text-allow-overlap'] === true);
});

test('the console hands the bubble to the compose module; no ceiling-bound line was added', () => {
  const con = fs.readFileSync(new URL('../js/atlas-console.js', import.meta.url), 'utf8');
  assert.match(con, /COMPOSE\.refsFor\(keep,ai\)/);
});

test('labels: when the style puts other symbol layers above the name layer, the name layer is lifted back above them', async () => {
  const eng = fakeEngine();
  const g = eng.GE();
  /* a style where the basemap's labels were added AFTER Atlas's layers — the order measured on the preview */
  const order = [];
  const origAdd = g.layers.add, origHas = g.layers.has;
  g.layers.add = (d, before) => { origAdd(d, before); const i = before ? order.findIndex((l) => l.id === before) : -1; order.splice(i < 0 ? order.length : i, 0, { id: d.id, type: d.type }); };
  g.layers.remove = (id) => { const i = order.findIndex((l) => l.id === id); if (i >= 0) order.splice(i, 1); eng.calls.layers = eng.calls.layers.filter((l) => l.id !== id); };
  g.layers.has = (id) => order.some((l) => l.id === id) || origHas(id);
  g.scene = { getStyle: () => ({ layers: order }) };
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode: async () => ({ lng: 1, lat: 1, name: 'X' }), dispatch: async () => ({ ok: true }) });
  await C.run({ items: [{ name: 'X' }] });
  order.push({ id: 'ofm-city', type: 'symbol' }, { id: 'ofm-country', type: 'symbol' });   /* the basemap's labels land on top */
  C.paint();
  const ids = order.map((l) => l.id);
  const t = ids.indexOf('atl-compose-t');
  assert.ok(t > ids.indexOf('ofm-city') && t > ids.indexOf('ofm-country'), 'the name layer is above every basemap label: ' + ids.join(','));
  assert.equal(ids.filter((i) => i === 'atl-compose-t').length, 1, 'and exists once');
});
