/* ============================================================================
 *  IntMap · news-map-legibility — the news bands and pins on the map, and the news card
 * ----------------------------------------------------------------------------
 *  「吹き出しの文字が小さい・右端で切れている・国名と重なる・密集時に出すぎ・白縁の輪が目立つ・
 *    詳細を開いている出来事がどれか分からない」
 *
 *  EVERYTHING HERE IS EVALUATED. js/map-typography.js is imported as the module it is (its band
 *  measurement runs on a canvas stand-in whose glyphs are 0.55 em wide), its declutter is called on
 *  pins at known screen positions, js/news-ui.js builds its layers against a recording engine, and the
 *  paint the renderer is handed is evaluated by MapLibre's own expression evaluator. The country-name
 *  layer is not named here either: js/place-labels.js is run, and the layer is identified by what its
 *  filter accepts.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExpression } from '@maplibre/maplibre-gl-style-spec';
import { importModule, langRegistry } from './helpers/import-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
langRegistry();

/* js/label-scale.js — a browser script that publishes on window */
function labelScale() { const w = {}; w.window = w; new Function('window', rd('js/label-scale.js'))(w); return w.IntMapLabelScale; }

const GLYPH_EM = 0.55;   /* the stand-in canvas: every glyph is this many ems wide */
const overlaps = (box, r) => box[0][0] < r.x1 && box[1][0] > r.x0 && box[0][1] < r.y1 && box[1][1] > r.y0;

/* js/map-typography.js, imported fresh, on a renderer stand-in that records the feature-state it is handed */
async function typography({ zoom = 4, W = 1000, H = 600, style = { layers: [] }, rendered = [], selected = null } = {}) {
  const LS = labelScale();
  const state = new Map(), queries = [];
  const ctx = { font: '', measureText(s) { return { width: [...String(s)].length * parseFloat(this.font) * GLYPH_EM }; } };
  const doc = {
    readyState: 'complete', documentElement: { lang: 'en' }, head: { appendChild() { } }, baseURI: 'http://x/', body: {},
    createElement: () => ({ getContext: () => ctx, dataset: {}, style: {} }),
    fonts: { addEventListener() { }, forEach() { } }, addEventListener() { }, elementFromPoint: () => null,
  };
  const win = { IntMapLabelScale: LS, addEventListener() { }, requestAnimationFrame: () => 0 };
  if (selected) win.IntMapNewsEvents = { state: () => ({ selectedEventId: selected }) };
  win.window = win;
  const GE = {
    camera: { getZoom: () => zoom },
    layers: { hasSource: () => true, has: () => true, setFeatureState: (f, s) => state.set(f.id, s) },
    render: { size: () => ({ width: W, height: H }), canvas: () => null },
    coords: {
      project: (c) => ({ x: c[0], y: c[1] }),
      queryRenderedFeatures: (box, o) => { queries.push(o.layers); return rendered.filter((r) => o.layers.includes(r.layer) && overlaps(box, r)); },
    },
    scene: { getStyle: () => style },
  };
  await importModule('js/map-typography.js', {
    globals: { window: win, document: doc, getComputedStyle: () => ({ fontFamily: 'Inter' }), requestAnimationFrame: win.requestAnimationFrame },
    mocks: { 'js/geo-engine.js': { IntMapGeoEngine: GE } },
  });
  return { T: win.IntMapMapTypography, LS, state, ctx, queries };
}
const pin = (fid, x, y, props = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { fid, mapped: 'true', short: 'Quake felt in Tokyo', ...props } });

/* js/news-ui.js setupIntelLayers, against a recording engine */
async function newsLayers(T, LS, { pane = null } = {}) {
  const layers = new Map(), onLayer = [], observers = [];
  let declutters = 0;
  const E = {
    canDraw: () => true, ready: () => true, hasRenderer: () => true,
    layers: { hasSource: () => false, addSource() { }, add: (l) => { layers.set(l.id, l); }, has: (id) => layers.has(id), get: (id) => layers.get(id), setSourceData() { }, setFeatureState() { } },
    events: { on() { }, onLayer: (type, layer, cb) => onLayer.push({ type, layer, cb }) },
    render: { setCursor() { }, canvas: () => ({ style: {} }) },
    coords: { project: () => ({ x: 0, y: 0 }), queryRenderedFeatures: () => [] },
    camera: { flyTo() { }, getCenter: () => ({ lng: 0, lat: 0 }) },
  };
  const win = globalThis;
  Object.assign(win, { IntMapMapTypography: T, IntMapLabelScale: LS });
  delete win._intelHandlersBound;
  class MO { constructor(cb) { this.cb = cb; } observe(target, opts) { observers.push({ target, opts, cb: this.cb }); } }
  const document = { getElementById: (id) => (id === 'news-reader-pane' ? pane : null), addEventListener() { }, body: { classList: { contains: () => false } } };
  const { newsUi } = await importModule('js/news-ui.js', { globals: { window: win, document, MutationObserver: MO }, mocks: { 'js/geo-engine.js': { IntMapGeoEngine: E } } });
  const HOST = {
    lang: 'en', newsFeatures: [], dashFeatures: [], extendedDashDB: [], bookmarks: [], mode: 'info',
    ensureLabelPill() { }, scheduleNewsDeclutter() { declutters++; }, refreshNewsPill() { }, isMobile: () => false,
    ensureMapTooltip: () => ({}), positionTooltip() { }, setMode() { },
  };
  newsUi(HOST).setupIntelLayers();
  return { layers, onLayer, observers, declutters: () => declutters };
}

/* MapLibre's evaluator over a paint/layout value */
function evaluate(value, type, zoom, featureState = {}) {
  const c = createExpression(value, { type, 'property-type': 'data-driven', expression: { interpolated: true, parameters: ['zoom', 'feature', 'feature-state'] } });
  if (c.result !== 'success') assert.fail('MapLibre rejected ' + JSON.stringify(value) + ': ' + JSON.stringify(c.value.map((x) => x.message)));
  return c.value.evaluate({ zoom }, { type: 'Point', properties: {} }, featureState);
}

test('the band\'s text, its measured box and its offset all come from ONE size, and it is one step larger', async () => {
  const LS0 = labelScale();
  for (const z of [1, 2.5, 4, 8]) {
    const { T, LS, ctx } = await typography({ zoom: z });
    const px = Math.max(6, Math.round(LS.subAt(z, T.BAND_W) * 10) / 10);
    const txt = 'Quake felt in Tokyo';
    const box = T.bandBox(txt);
    assert.equal(parseFloat(ctx.font), px, 'the band is measured at the size the layer draws at z' + z);
    const textW = Math.min([...txt].length * px * GLYPH_EM, 14 * px);
    assert.equal(box.w, Math.ceil(textW) + 2 * T.BAND.padX, 'width = the text + the band\'s own padding');
    assert.equal(box.h, Math.ceil(px * 1.2) + 2 * T.BAND.padY, 'height = one line + the band\'s own padding');
    assert.equal(box.line, Math.ceil(px * 1.2));
  }
  const { T } = await typography();
  assert.ok(LS0.subAt(4, T.BAND_W) > LS0.subAt(4, 0.92), 'larger than the 0.92 weight it had');
  assert.ok(LS0.subAt(4, T.BAND_W) <= LS0.SUB.at(-1)[1], 'and still under the place names (the sub ladder\'s ceiling)');

  /* the layers js/news-ui.js builds read the same weight, padding and offset */
  const { layers } = await newsLayers(T, LS0);
  const R = layers.get('news-labels'), L = [...layers.values()].find((l) => l !== R && l.type === 'symbol' && l.layout && l.layout['text-field'] && l.source === 'news-points');
  assert.ok(R && L, 'a right-hand and a mirrored band layer exist');
  assert.deepEqual(R.layout['text-size'], LS0.sub(T.BAND_W));
  assert.deepEqual(R.layout['icon-text-fit-padding'], [T.BAND.padY, T.BAND.padX, T.BAND.padY, T.BAND.padX]);
  for (const z of [1, 4, 10]) {
    const px = Math.max(6, LS0.subAt(z, T.BAND_W));
    const r = evaluate(R.layout['text-offset'], 'array', z), l = evaluate(L.layout['text-offset'], 'array', z);
    assert.ok(Math.abs(r[0] * px - (T.BAND.lead + T.BAND.padX)) < 0.02 * px, 'the text starts lead + padX right of the pin at z' + z);
    assert.equal(l[0], -r[0], 'the mirrored band is the same distance to the left');
  }
  assert.equal(R.layout['text-anchor'], 'left');
  assert.equal(L.layout['text-anchor'], 'right');
  for (const k of Object.keys(R.layout)) if (k !== 'text-anchor' && k !== 'text-offset') assert.deepEqual(L.layout[k], R.layout[k], 'the mirror copies ' + k);
});

test('a band never runs past the right edge: it flips to the left of its pin, or is not shown', async () => {
  const W = 1000;
  const { T, state } = await typography({ W });
  const w = T.bandBox('Quake felt in Tokyo').w;
  assert.ok(960 + T.BAND.lead + w > W, 'precondition: drawn on the right, this band would cross the edge');
  T.declutterNewsBands([pin('edge', 960, 300), pin('mid', 300, 300)]);
  assert.deepEqual([state.get('edge').bnd, state.get('edge').side], [true, 'L']);
  assert.ok(960 - T.BAND.lead - w >= 0, 'and the left-hand box is inside the canvas');
  assert.deepEqual([state.get('mid').bnd, state.get('mid').side], [true, 'R'], 'a pin with room keeps the right-hand band');

  /* a canvas too narrow for the band on either side: no band, not a clipped one */
  const narrow = await typography({ W: 150 });
  narrow.T.declutterNewsBands([pin('n', 75, 300)]);
  assert.equal(narrow.state.get('n').bnd, false);

  /* the layers show each band on exactly one side */
  const LS = labelScale();
  const { layers } = await newsLayers(T, LS);
  const R = layers.get('news-labels'), L = [...layers.values()].find((l) => l !== R && l.type === 'symbol' && l.source === 'news-points');
  const op = (layer, fs) => evaluate(layer.paint['text-opacity'], 'number', 4, fs) + evaluate(layer.paint['icon-opacity'], 'number', 4, fs);
  assert.deepEqual([op(R, { bnd: true, side: 'R' }), op(L, { bnd: true, side: 'R' })], [2, 0]);
  assert.deepEqual([op(R, { bnd: true, side: 'L' }), op(L, { bnd: true, side: 'L' })], [0, 2]);
  assert.deepEqual([op(R, { bnd: true }), op(L, { bnd: true })], [2, 0], 'a state written before sides existed reads as right');
  assert.deepEqual([op(R, { bnd: false, side: 'L' }), op(L, { bnd: false, side: 'L' })], [0, 0]);
  assert.deepEqual([op(R, { bnd: true, side: 'L', hover: true }), op(L, { bnd: true, side: 'L', hover: true })], [0, 0], 'hover hides it (the tooltip takes over)');
});

test('a band that would cover a country name moves to the other side, or is not shown', async () => {
  /* the base map's real label layers, from js/place-labels.js */
  const LS = labelScale();
  const added = new Map(), noop = () => { };
  const win = { console, matchMedia: () => ({ matches: false }), _imCanDraw: () => true, isMobile: () => false, imLabelLang: 'app',
    IntMapMapTypography: { placeFont: () => ['literal', ['Inter']], readerFont: () => ['literal', ['Inter']], cjkFamily: () => '', glyphRewrite: noop }, IntMapLabelScale: LS };
  win.window = win;
  const M = await importModule('js/place-labels.js', {
    globals: { window: win, document: { baseURI: 'https://example.invalid/' } },
    mocks: {
      'js/geo-engine.js': { IntMapGeoEngine: { hasRenderer: () => true, camera: { getZoom: () => 4 }, coords: { querySourceFeatures: () => [] }, events: { on: noop },
        layers: { has: (id) => added.has(id), hasSource: () => true, get: (id) => added.get(id), getLayout: () => 'visible', add: (d) => { added.set(d.id, d); }, setPaint: noop, setSourceData: noop, setLayout: noop } } },
      'js/lang-registry.js': { IntMapLang: { pick: () => ({ arr: (a) => a[0] }) } },
      'js/tables.js': { SEA_LABELS: [] },
    },
  });
  M.placeLabels({ lang: 'en', mapType: 'std', namesOn: true, geoLabelsOn: true, poiOn: true, userTheme: 'dark', mapLabelsViaVector: () => true, canDraw: () => true, _stabIdx: { water: new Map() } }).ensurePlaceLabels();
  /* which layer draws countries is what its filter accepts — not its name */
  const accepts = (l, cls) => {
    if (!l.filter) return false;
    const c = createExpression(l.filter, { type: 'boolean', 'property-type': 'data-driven', expression: { interpolated: false, parameters: ['zoom', 'feature'] } });
    return c.result === 'success' && c.value.evaluate({ zoom: 8 }, { type: 'Point', properties: { class: cls, name: 'x' } }) === true;
  };
  const symbols = [...added.values()].filter((l) => l.type === 'symbol');
  const country = symbols.filter((l) => accepts(l, 'country') && !accepts(l, 'city') && !accepts(l, 'state')), city = symbols.find((l) => accepts(l, 'city') && !accepts(l, 'country'));
  assert.equal(country.length, 1, 'js/place-labels.js draws country names in one layer');
  assert.ok(city, 'and city names in another');
  /* the page shows them (place-labels creates them hidden; applyLabelLang turns them on) */
  const style = { layers: symbols.map((l) => ({ ...l, layout: { ...l.layout, visibility: 'visible' } })) };

  const nameAt = { layer: country[0].id, x0: 180, y0: 285, x1: 330, y1: 315 };      /* a country name right of P */
  const wide = { layer: country[0].id, x0: 470, y0: 285, x1: 760, y1: 315 };        /* one under both of Q's sides */
  const town = { layer: city.id, x0: 310, y0: 485, x1: 470, y1: 515 };             /* a CITY name right of S */
  const { T, state, queries } = await typography({ style, rendered: [nameAt, wide, town] });
  T.declutterNewsBands([pin('P', 160, 300), pin('Q', 615, 300), pin('S', 300, 500)]);
  assert.deepEqual([state.get('P').bnd, state.get('P').side], [true, 'L'], 'P moves to the left of its pin, off the country name');
  assert.equal(state.get('Q').bnd, false, 'Q has a country name on both sides: no band');
  assert.deepEqual([state.get('S').bnd, state.get('S').side], [true, 'R'], 'a city name does not push a band');
  assert.ok(queries.length && queries.every((q) => q.length === 1 && q[0] === country[0].id), 'only the country-name layer is asked: ' + JSON.stringify(queries[0]));

  /* the era country names the time machine draws are found by the same rule (they ask for the same size) */
  const era = { id: 'era-fixture', type: 'symbol', layout: { 'text-size': LS.place('country') } };
  const t2 = await typography({ style: { layers: [era] }, rendered: [{ layer: 'era-fixture', x0: 180, y0: 285, x1: 330, y1: 315 }] });
  t2.T.declutterNewsBands([pin('P', 160, 300)]);
  assert.equal(t2.state.get('P').side, 'L');
});

test('in a dense view the bands are thinned by the share of the map they cover, best-reported first', async () => {
  const grid = [];
  let k = 0;
  for (let x = 40; x < 1000 - 200; x += 250) for (let y = 25; y < 600; y += 50) grid.push(pin('g' + k, x, y, { evSources: (k++ * 7) % 23 }));
  const run = async (W, H) => {
    const t = await typography({ W, H });
    t.T.declutterNewsBands(grid);
    const shown = grid.filter((f) => t.state.get(f.properties.fid).bnd);
    const area = shown.reduce((a, f) => { const b = t.T.bandBox(f.properties.short); return a + b.w * b.h; }, 0);
    return { shown, area, t };
  };
  const small = await run(1000, 600);
  assert.ok(small.shown.length > 0 && small.shown.length < grid.length, `some, not all: ${small.shown.length} of ${grid.length}`);
  assert.ok(small.area <= 0.08 * 1000 * 600, 'the shown bands cover at most 8 % of the map');
  const minShown = Math.min(...small.shown.map((f) => f.properties.evSources));
  const maxHidden = Math.max(...grid.filter((f) => !small.shown.includes(f)).map((f) => f.properties.evSources));
  assert.ok(minShown >= maxHidden, 'every shown band has at least as many outlets as every hidden one');
  /* a ratio, not a count: the same pins on a larger map show more bands */
  const big = await run(2000, 1200);
  assert.ok(big.shown.length > small.shown.length);

  /* the pills are a line of text apart, not 5 px */
  const t = await typography();
  const b = t.T.bandBox('Quake felt in Tokyo');
  t.T.declutterNewsBands([pin('A', 100, 100), pin('B', 100, 100 + b.h + 8)]);
  assert.deepEqual([t.state.get('A').bnd, t.state.get('B').bnd], [true, false], '8 px apart is too close at z4 (one line is ' + b.line + ' px)');
});

test('the resting pin is smaller with a thinner rim; the hovered pin and the OPEN event\'s pin are drawn hot', async () => {
  const LS = labelScale();
  /* the open event: the declutter asks js/news-events.js and writes `sel`, and its band is granted first */
  const { T, state } = await typography({ selected: 'evt-open' });
  T.declutterNewsBands([pin('a', 100, 300, { evSources: 9, evId: 'evt-other' }), pin('b', 100, 304, { evSources: 1, evId: 'evt-open' })]);
  assert.equal(state.get('b').sel, true);
  assert.equal(state.get('a').sel, false);
  assert.deepEqual([state.get('b').bnd, state.get('a').bnd], [true, false], 'the open event\'s band wins over a better-reported neighbour');

  const pane = {};
  const { layers, observers, declutters } = await newsLayers(T, LS, { pane });
  const dots = layers.get('news-dots').paint;
  const at = (k, fs) => evaluate(dots[k], 'number', 4, fs);
  const rest = {}, hot = { sel: true }, hover = { hover: true };
  assert.ok(at('circle-stroke-width', rest) < 2, 'the resting rim is thinner than the old 2 px');
  assert.ok(at('circle-stroke-opacity', rest) < 1, 'and translucent');
  assert.ok(at('circle-radius', rest) < 7, 'the resting pin is smaller than the old 7 px');
  for (const fs of [hot, hover]) {
    assert.ok(at('circle-radius', fs) > at('circle-radius', rest), 'a hot pin is larger: ' + JSON.stringify(fs));
    assert.ok(at('circle-stroke-width', fs) > at('circle-stroke-width', rest));
    assert.equal(at('circle-stroke-opacity', fs), 1);
  }
  assert.ok(T.BAND.lead > at('circle-radius', hot) + at('circle-stroke-width', hot), 'the open event\'s band starts clear of its hot pin');

  /* opening or closing the detail re-runs the declutter, which is what writes `sel` */
  const o = observers.find((x) => x.target === pane);
  assert.ok(o, 'the reading pane is observed');
  const before = declutters(); o.cb([]);
  assert.equal(declutters(), before + 1);
});

test('the mirrored band answers the pointer exactly as the right-hand one', async () => {
  const { T } = await typography();
  const { layers, onLayer } = await newsLayers(T, labelScale());
  const L = [...layers.values()].find((l) => l.id !== 'news-labels' && l.type === 'symbol' && l.source === 'news-points');
  for (const type of ['click', 'mousemove', 'mouseleave']) {
    const r = onLayer.filter((x) => x.type === type && x.layer === 'news-labels'), l = onLayer.filter((x) => x.type === type && x.layer === L.id);
    assert.equal(r.length, 1); assert.equal(l.length, 1);
    assert.equal(l[0].cb, r[0].cb, type + ' is the same handler on both band layers');
  }
});
