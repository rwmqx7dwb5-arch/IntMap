/* atlas-real-shapes — an item asked as an AREA or a LINE is drawn as its REAL geometry with its source, or reported
   unresolved; points joined by relations never stand in for it, and the result is not `completed` without it.
   Evaluated: js/atlas-shape-resolve.js with scripted ladders, js/atlas-map-compose.js with a fake engine. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { resolveShape, geometryOf, shapeAnchor } from '../js/atlas-shape-resolve.js';

const { makeAtlasMapCompose } = await import('../js/atlas-map-compose.js');
const { makeAtlasGeoLedger } = await import('../js/atlas-geo-ledger.js');
const { makeAtlasGeoObject } = await import('../js/atlas-geo-object.js');

const POLY = { type: 'Polygon', coordinates: [[[137.5, 35], [139.5, 35], [139.5, 37.5], [137.5, 37.5], [137.5, 35]]] };
const LINE = { type: 'LineString', coordinates: [[137.86, 37.04], [138.2, 36.2], [138.38, 34.97]] };

/* ── the resolver ─────────────────────────────────────────────────────────────────────────── */
test('area: the highlight ladder\'s outline is real; an approximate one is derived and names its rung', async () => {
  const real = await resolveShape('Nagano', 'area', { area: async () => ({ poly: { name: 'Nagano', geo: POLY }, rrMethod: 'admin1_index', entity: { source: 'admin1-index' } }) });
  assert.deepEqual([real.ok, real.basis, real.method, real.source], [true, 'real', 'admin1_index', 'admin1-index']);
  const ai = await resolveShape('Fossa Magna', 'area', { area: async () => ({ poly: { geo: POLY }, approx: true }) });
  assert.deepEqual([ai.ok, ai.basis, ai.method], [true, 'derived', 'model_outline']);
});

test('area: a bounding box, a line and an ambiguity are refusals, never shapes', async () => {
  assert.equal((await resolveShape('X', 'area', { area: async () => ({ poly: { geo: POLY }, soft: true }) })).reason, 'only_extent');
  const km = await resolveShape('X', 'area', { area: async () => ({ geo: LINE }) });
  assert.deepEqual([km.ok, km.reason, km.got], [false, 'kind_mismatch', 'line']);
  const amb = await resolveShape('Georgia', 'area', { area: async () => ({ ambiguous: true, candidates: [{ name: 'a' }, { name: 'b' }] }) });
  assert.deepEqual([amb.reason, amb.candidates.length], ['ambiguous', 2]);
  assert.equal((await resolveShape('Nowhere', 'area', { area: async () => null, extent: async () => null })).reason, 'not_found');
});

test('area: country codes become the country layer\'s outline, said so', async () => {
  const r = await resolveShape('Japan', 'area', { area: async () => ({ code: 'JPN' }), countries: async (c) => (c[0] === 'JPN' ? POLY : null) });
  assert.deepEqual([r.ok, r.method, r.source], [true, 'country', 'IntMap country outlines']);
});

test('line: a river asks the river course first; anything else asks the gazetteer and refuses a polygon', async () => {
  let riverAsked = 0;
  const rv = await resolveShape('信濃川', 'line', { isRiver: () => true, river: async () => { riverAsked++; return { geo: LINE }; }, extent: async () => null });
  assert.deepEqual([rv.ok, rv.method, riverAsked], [true, 'waterway', 1]);
  const fault = await resolveShape('Itoigawa-Shizuoka Tectonic Line', 'line', { isRiver: () => false, extent: async () => ({ geojson: LINE }) });
  assert.deepEqual([fault.ok, fault.basis, fault.method], [true, 'real', 'osm_line']);
  const poly = await resolveShape('Lake Biwa', 'line', { isRiver: () => false, extent: async () => ({ geojson: POLY }) });
  assert.deepEqual([poly.ok, poly.reason, poly.got], [false, 'kind_mismatch', 'area']);
});

test('geometryOf / shapeAnchor read every rung\'s shape and centre it', () => {
  assert.equal(geometryOf({ entity: { geometry: LINE } }), LINE);
  assert.equal(geometryOf({ poly: { geo: 'nope' } }), null);
  assert.deepEqual(shapeAnchor(POLY), { lng: 138.5, lat: 36.25 });
});

/* ── the map explanation ───────────────────────────────────────────────────────────────────── */
function fakeEngine() {
  const layers = new Set(), sources = new Set(); let data = null; const added = [];
  const g = {
    layers: { hasSource: (id) => sources.has(id), addSource: (id) => sources.add(id), setSourceData: (id, d) => { data = d; }, has: (id) => layers.has(id),
      add: (d) => { layers.add(d.id); added.push(d); }, setVisible: () => {}, getLayout: () => 'visible', setFilter: () => {} },
    camera: { flyTo: () => {}, fitBounds: () => {}, getZoom: () => 3 }, events: { onLayer: () => {}, on: () => {} }, render: { canvas: () => ({ style: {} }), claim: () => {} },
  };
  return { GE: () => g, data: () => data, added };
}
function compose(shapes) {
  const eng = fakeEngine();
  const GEOBJ = makeAtlasGeoObject();
  const ledger = makeAtlasGeoLedger({ geoObject: GEOBJ.geoObject });
  const GEO = { 'itoigawa, japan': { lng: 137.86, lat: 37.04, name: 'Itoigawa' }, 'shizuoka, japan': { lng: 138.38, lat: 34.97, name: 'Shizuoka' } };
  const geocode = async (q) => GEO[String(q).toLowerCase()] || null;
  const C = makeAtlasMapCompose({ GE: eng.GE, geocode, ledger, geoObject: GEOBJ.geoObject, dispatch: async () => ({ ok: true }), verifyBudgetMs: 0,
    resolveShape: async (nm, want) => (shapes[nm + '|' + want] || { ok: false, reason: 'not_found' }) });
  return { C, eng };
}

test('compose: a real area and a real line are drawn into the map with their source; points stay numbered', async () => {
  const { C, eng } = compose({ 'Fossa Magna|area': { ok: true, geometry: POLY, basis: 'derived', method: 'model_outline', source: 'Atlas (web-checked)' },
    'Itoigawa-Shizuoka Tectonic Line|line': { ok: true, geometry: LINE, basis: 'real', method: 'osm_line', source: 'OpenStreetMap' } });
  const r = await C.run({ items: [{ name: 'Fossa Magna', country: 'Japan', shape: 'area' }, { name: 'Itoigawa-Shizuoka Tectonic Line', country: 'Japan', shape: 'line' }, { name: 'Itoigawa', country: 'Japan' }] });
  const feats = eng.data().features;
  const shp = feats.filter((f) => f.properties.t === 'shape');
  assert.deepEqual(shp.map((f) => [f.properties.g, f.properties.basis, f.geometry.type]), [['area', 'derived', 'Polygon'], ['line', 'real', 'LineString']]);
  assert.equal(r.exec.counts.shapesDrawn, 2); assert.equal(r.exec.counts.shapesDerived, 1); assert.equal(r.exec.status, 'ok');
  /* the two shapes had no gazetteer point of their own: their markers stand at the shape, said so */
  assert.ok(r.exec.placed.filter((p) => p.provenance === 'resolved_place_centroid').length === 2);
  assert.ok(/近似|approximate/.test(r.html) && /OpenStreetMap/.test(r.html));
  /* the derived outline is drawn on the dashed layer, the real one on the solid */
  const dashed = eng.added.find((d) => d.id === 'atl-compose-sld'); assert.ok(dashed && dashed.paint['line-dasharray']);
});

test('composed objects keep opacity from zero to full in every painted part', async () => {
  const { C, eng } = compose({
    'Fossa Magna|area': { ok: true, geometry: POLY, basis: 'derived' },
    'Fault|line': { ok: true, geometry: LINE, basis: 'real' },
  });
  await C.run({
    items: [
      { name: 'Fossa Magna', country: 'Japan', shape: 'area' },
      { name: 'Fault', country: 'Japan', shape: 'line' },
      { name: 'Itoigawa', country: 'Japan' },
    ],
    relations: [{ from: 1, to: 3, type: 'flow' }],
  });
  const obj = C.objects();
  assert.deepEqual(new Set(obj.map((o) => o.geom)), new Set(['area', 'line', 'point']));
  assert.ok(obj.some((o) => o.kind === 'link'));
  assert.ok(obj.every((o) => o.alpha > 0 && o.alpha < 1), 'unused sliders start at existing paint strength');
  const paints = {
    area: [['sf', 'fill-opacity', 0.85], ['sld', 'line-opacity', 1]],
    shape: [['sl', 'line-opacity', 1]],
    link: [['line', 'line-opacity', 1], ['dash', 'line-opacity', 1], ['arrow', 'text-opacity', 1]],
    place: [['c', 'circle-opacity', 1], ['c', 'circle-stroke-opacity', 1], ['n', 'text-opacity', 1], ['t', 'text-opacity', 1],
      ['hl', 'circle-opacity', 0.3], ['hl', 'circle-stroke-opacity', 0.9]],
  };
  for (const opacity of [0, 0.4, 1]) {
    for (const o of obj) assert.equal(o.setOpacity(opacity), true);
    const props = new Map(eng.data().features.map((f) => [f.properties.id, f.properties]));
    for (const o of C.objects()) {
      assert.equal(o.alpha, opacity, o.id + ' readback');
      for (const [layer, property, peak] of paints[o.geom === 'area' ? 'area' : o.kind]) {
        const style = eng.added.find((l) => l.id === 'atl-compose-' + layer);
        const parsed = createExpression(style.paint[property], { type: 'number' });
        assert.equal(parsed.result, 'success');
        assert.equal(parsed.value.evaluate({ zoom: 3 }, { properties: props.get(o.id) }), opacity * peak, layer + ' ' + property);
      }
    }
  }
});

test('compose: a shape that cannot be obtained is NOT drawn, nothing stands in for it, and the run is partial', async () => {
  const { C, eng } = compose({});
  const r = await C.run({ items: [{ name: 'Fossa Magna', country: 'Japan', shape: 'area' }, { name: 'Itoigawa', country: 'Japan' }, { name: 'Shizuoka', country: 'Japan' }] });
  assert.equal(eng.data().features.filter((f) => f.properties.t === 'shape').length, 0);
  assert.equal(eng.data().features.filter((f) => f.properties.t === 'rel').length, 0);
  assert.equal(r.exec.status, 'partial');
  assert.deepEqual(r.exec.shapesUnresolved.map((x) => [x.name, x.want, x.reason]), [['Fossa Magna', 'area', 'not_found']]);
  assert.ok(/stand relations/.test(r.exec.shapeNote));
  assert.ok(/描けなかった形|Shapes not drawn/.test(r.html));
  assert.equal(r.meta.partial, true);
});

test('a name-agreeing shape in another country is refused when the item names its country (Fossa Magna → Lombard canals)', async () => {
  const CANAL = { type: 'LineString', coordinates: [[10.4, 45.3], [10.45, 45.32]] };
  const at = (lng) => (lng > 120 ? 'JPN' : 'ITA');
  const deps = { isRiver: () => false, extent: async () => ({ geojson: CANAL }), countryCode: (c) => ({ japan: 'JPN', italy: 'ITA' })[String(c).toLowerCase()] || '', countryAt: at };
  const r = await resolveShape('Fossa Magna', 'line', deps, { country: 'Japan' });
  assert.deepEqual([r.ok, r.reason, r.got], [false, 'elsewhere', 'ITA']);
  assert.equal((await resolveShape('Fossa Magna', 'line', deps, { country: 'Italy' })).ok, true);
  /* no country named, or a country the deps cannot code: the shape stands as it came */
  assert.equal((await resolveShape('Fossa Magna', 'line', deps)).ok, true);
  assert.equal((await resolveShape('Fossa Magna', 'line', deps, { country: 'Atlantis' })).ok, true);
});
