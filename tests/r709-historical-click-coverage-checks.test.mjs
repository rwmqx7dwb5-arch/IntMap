/* R709: a background reader must not make the foreground place reader refuse the same tap.
 * Run the shipped engine registry, the whole labelPopup module, and the actual historical fill
 * handler together. Renderer hits and popup DOM are doubles; arbitration is not copied here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { makeCameraMath } from '../js/camera-math.js';
import { makeCommandCensus } from '../js/geo-command-log.js';
import { makeClickOwnership } from '../js/click-ownership.js';
import { asClassicScript } from './app-source.mjs';

const rd = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ui = rd('js/map-ui.js'), borders = rd('js/time-borders.js');
const ast = source => parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
function assignment(source, name) {
  let found;
  simple(ast(source), { AssignmentExpression(n) {
    if (n.left.type === 'MemberExpression' && n.left.property.name === name) found = source.slice(n.right.start, n.right.end);
  } });
  assert.ok(found, name + ' is a real module'); return found;
}
function declaration(source, name) {
  let found;
  simple(ast(source), { VariableDeclarator(n) {
    if (n.id.name === name) found = 'const ' + source.slice(n.start, n.end) + ';';
  } });
  assert.ok(found, name + ' is declared'); return found;
}
function fillBinding() {
  let found;
  simple(ast(borders), { CallExpression(n) {
    if (n.callee.type === 'MemberExpression' && n.callee.property.name === 'onLayer'
      && n.arguments[0]?.value === 'click' && n.arguments[1]?.value === 'imtb-fill') found = borders.slice(n.start, n.end) + ';';
  } });
  assert.ok(found, 'the historical fill has a real reader'); return found;
}
const labelModule = assignment(ui, 'labelPopup');
const labelDeclarations = ['PLACE_LBL', 'ALL_LBL'].map(n => declaration(ui, n)).join('\n');
const blankWiring = ['_tapPad', '_ERA_LAYERS', '_ownedElsewhere', '_named'].map(n => declaration(borders, n)).join('\n') + '\n' + fillBinding();

function harness({ mount = true, backgroundFirst = false } = {}) {
  const layerHandlers = [], mapHandlers = [], layers = new Map(), popups = [], blank = [], timers = [], copied = [], outlines = [];
  const copyButton = {};
  const state = { hits: [], padded: false, queries: [], moves: [] };
  const noop = () => {};
  const adapter = {
    id: 'test', raw: () => ({}), styleReady: () => true, canDraw: () => true,
    hasLayer: id => layers.has(id), getLayer: id => layers.get(id), getLayout: () => 'visible',
    getStyle: () => ({ layers: [...layers.values()] }), hasSource: () => true,
    addSource: noop, setSourceData: noop, addLayer: d => layers.set(d.id, d),
    setLayout: noop, setPaint: noop, canvas: () => ({ style: {} }),
    moveLayer: id => { const layer = layers.get(id); if (layer) { layers.delete(id); layers.set(id, layer); state.moves.push(id); } },
    onLayer: (type, id, fn) => layerHandlers.push({ type, id, fn }),
    offLayer: (type, id, fn) => { const i = layerHandlers.findIndex(h => h.type === type && h.id === id && h.fn === fn); if (i >= 0) layerHandlers.splice(i, 1); },
    on: (type, fn) => mapHandlers.push({ type, fn }), off: noop,
    queryRenderedFeatures: (pt, opts) => {
      state.queries.push({ pt, layers: opts?.layers });
      return state.hits.filter(f => (!opts?.layers || opts.layers.includes(f.layer.id))
        && (!state.padded || Array.isArray(pt) || f.layer.type !== 'symbol'));
    },
    popup: () => ({ html: '', removed: false, setLngLat() { return this; }, setHTML(h) { this.html = h; return this; }, remove() { this.removed = true; }, on() { return this; } }),
    attach: p => { popups.push(p); return p; },
  };
  const win = { makeCameraMath, makeCommandCensus, makeClickOwnership, console, URL, setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: noop,
    document: { baseURI: 'https://example.invalid/', getElementById: () => null, querySelector: s => s === '.plc-copy' ? copyButton : null },
    navigator: { clipboard: { writeText: text => copied.push(text) } },
    IntMapOutline: { show: name => outlines.push(name), clear: noop },
    IntMapModules: {}, IntMapLang: { t: (_lang, en) => en },
    HOST: { lang: 'en', canDraw: () => true, isMobile: () => false },
    _openBlank: (f) => { blank.push(f); return true; }, active: true,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  vm.runInContext(rd('js/geo-engine.js').replace(/^import .*;\r?\n/gm, ''), ctx);
  const GE = win.IntMapGeoEngine; GE.use(adapter);
  win.GE = () => GE;
  vm.runInContext(labelDeclarations + '\nthis.labelIds = ALL_LBL;', ctx);
  const labelIds = Array.from(win.labelIds);
  for (const id of [...labelIds, 'imtb-fill']) layers.set(id, { id, type: id === 'imtb-fill' ? 'fill' : 'symbol' });
  const mountBlank = () => vm.runInContext(blankWiring, ctx);
  if (mount) {
    if (backgroundFirst) mountBlank();
    vm.runInContext('(' + labelModule + ')(HOST)', ctx);
    if (!backgroundFirst) mountBlank();
  }
  return { GE, state, labelIds, layers, blank, popups, win, copied, outlines, copyButton,
    handlersFor: id => layerHandlers.filter(h => h.id === id),
    loadOcclusion() {
      win.everyTick = noop;
      const source = rd('js/label-occlusion.js');
      const owner = ast(source).body.find(n => n.type === 'ExportNamedDeclaration' && n.declaration?.id?.name === 'makeLabelOcclusion').declaration;
      vm.runInContext(source.slice(owner.start, owner.end), ctx);
      vm.runInContext('makeLabelOcclusion(HOST, {GE, isMobile: HOST.isMobile})', ctx);
    },
    async loadCities(date) {
      const data = JSON.parse(rd('data/hist-cities.json'));
      win.fetch = async () => ({ ok: true, json: async () => data });
      win.IntMapTime = { isLive: () => !date, when: () => date, on: noop };
      vm.runInContext(asClassicScript(rd('js/hist-cities.js')), ctx);
      await win.IntMapHistCities.ensure();
      return data;
    },
    live: () => popups.filter(p => !p.removed),
    async click(hits, { padded = false, claim = false, reverseHandlers = false } = {}) {
      state.hits = hits; state.padded = padded; state.queries = [];
      const e = { point: { x: 100, y: 100 }, lngLat: { lng: 139, lat: 35 }, originalEvent: {} };
      const handlers = layerHandlers.filter(h => h.type === 'click');
      for (const h of reverseHandlers ? handlers.reverse() : handlers) {
        const features = adapter.queryRenderedFeatures(e.point, { layers: [h.id] });
        if (features.length) h.fn({ ...e, features });
      }
      for (const h of mapHandlers.filter(h => h.type === 'click')) h.fn(e);
      if (claim) GE.events.claimClick(e);
      await Promise.resolve(); await Promise.resolve();
      while (timers.length) timers.shift()();
    },
  };
}
const feature = (id, name, type = 'symbol') => ({ layer: { id, type }, properties: { name, en: name }, geometry: { type: 'Point', coordinates: [139, 35] } });

test('R709: click inventory includes fallback readers, ownership excludes them, and handlers retain their own lifetime', () => {
  const { GE } = harness({ mount: false });
  const fallback = () => {}, exclusive = () => {};
  GE.events.onLayer('click', 'surface', fallback, { ownership: 'fallback' });
  assert.ok(GE.events.clickLayers().includes('surface'));
  assert.ok(!GE.events.clickLayers({ ownersOnly: true }).includes('surface'));
  GE.events.onLayer('click', 'surface', exclusive);
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('surface'));
  const anotherFallback = () => {};
  GE.events.onLayer('click', 'surface', anotherFallback, { ownership: 'fallback' });
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('surface'), 'a fallback must not demote an exclusive handler');
  GE.events.offLayer('click', 'surface', exclusive);
  assert.ok(!GE.events.clickLayers({ ownersOnly: true }).includes('surface'));
  assert.ok(GE.events.clickLayers().includes('surface'));
  GE.events.offLayer('click', 'surface', fallback);
  GE.events.offLayer('click', 'surface', anotherFallback);
  assert.ok(!GE.events.clickLayers().includes('surface'), 'an unregistered reader cannot keep claiming its former surface');
  GE.events.onLayer('click', 'surface', exclusive);
  GE.events.onLayer('click', 'surface', exclusive);
  GE.events.offLayer('click', 'surface', () => {});
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('surface'), 'removing a different callback cannot steal ownership');
  GE.events.offLayer('mouseenter', 'surface', exclusive);
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('surface'), 'removing hover cannot unregister click');
  GE.events.offLayer('click', 'surface', exclusive);
  assert.ok(!GE.events.clickLayers().includes('surface'), 'repeated wiring of the same callback is one registration');
  GE.events.onLayer('click', 'surface', fallback, { ownership: 'fallback' });
  GE.events.onLayer('click', 'surface', fallback);
  GE.events.onLayer('click', 'surface', fallback, { ownership: 'fallback' });
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('surface'), 'exclusive registration of the same callback cannot be demoted');
  GE.events.offLayer('click', 'surface', fallback);
  assert.ok(!GE.events.clickLayers().includes('surface'));
  const otherAdapter = { id: 'other-view', onLayer() {}, offLayer() {} };
  const other = GE.makeFacade(otherAdapter);
  GE.events.onLayer('click', 'shared-surface', exclusive);
  other.events.onLayer('click', 'shared-surface', exclusive);
  other.events.offLayer('click', 'shared-surface', exclusive);
  assert.ok(GE.events.clickLayers({ ownersOnly: true }).includes('shared-surface'), 'a subview cannot unregister the same callback on the main view');
  GE.events.offLayer('click', 'shared-surface', exclusive);
  assert.ok(!GE.events.clickLayers().includes('shared-surface'));
});

for (const backgroundFirst of [false, true]) for (const padded of [false, true]) {
  test(`R709: every place reader answers over named and unnamed historical territory (background first ${backgroundFirst}, padded ${padded})`, async () => {
    const H = harness({ backgroundFirst });
    assert.ok(H.labelIds.length >= 11, 'the population is the actual label inventory, not just cities');
    for (const name of ['Historical territory', '']) for (const id of H.labelIds) {
      await H.click([feature(id, 'Readable place'), feature('imtb-fill', name, 'fill')], { padded });
      assert.equal(H.live().length, 1, id + ': exactly one place popup remains after all click listeners');
      assert.ok(H.live()[0].html.includes('Readable place'), id + ': the visible label has answered');
      assert.equal(H.blank.length, 0, id + ': the background did not swallow the place');
    }
  });
}

test('R709: empty land retains its meaning and actual object owners still take precedence', async () => {
  const H = harness();
  await H.click([feature('imtb-fill', 'Named territory', 'fill')]);
  assert.equal(H.live().length, 0); assert.equal(H.blank.length, 0);
  await H.click([feature('imtb-fill', '', 'fill')]);
  assert.equal(H.blank.length, 1, 'unnamed territory still has a reader');
  H.layers.set('an-object', { id: 'an-object', type: 'circle' });
  H.GE.events.onLayer('click', 'an-object', () => {});
  await H.click([feature('ofm-city', 'City'), feature('an-object', 'Object', 'circle'), feature('imtb-fill', '', 'fill')]);
  assert.equal(H.live().length, 0); assert.equal(H.blank.length, 1);
  await H.click([feature('ofm-city', 'City'), feature('imtb-fill', '', 'fill')], { claim: true });
  assert.equal(H.live().length, 0, 'map-level claimed events still suppress deferred labels');
  assert.equal(H.blank.length, 1);
});

test('R709: a city popup repeats the historical name that was drawn, preserving its place identity for actions', async () => {
  const H = harness();
  const data = await H.loadCities(new Date('1860-06-15T12:00:00Z'));
  const tokyo = data.cities.find(c => c.id === 'tokyo');
  assert.ok(tokyo, 'Tokyo is an actual shipped record');
  const f = feature('ofm-city', 'Tokyo');
  f.geometry.coordinates = [tokyo.lon, tokyo.lat];
  f.properties['name:en'] = 'Tokyo';
  const HC = H.win.IntMapHistCities;
  assert.equal(HC.forFeature(f, 'en', 'ui'), 'Edo');
  assert.equal(HC.forFeature(f, 'jp', 'ui'), '江戸');
  for (const mode of ['en', 'local']) assert.equal(HC.forFeature(f, 'jp', mode), HC.forFeature(f, 'en', 'ui'), mode + ' uses the same historical column as the map');
  for (const padded of [false, true]) {
    await H.click([f, feature('imtb-fill', 'Japan', 'fill')], { padded });
    assert.equal(H.live().length, 1);
    assert.ok(H.live()[0].html.includes('Tokyo (Edo)'), 'the heading carries the actual historical label');
    assert.equal(H.outlines.at(-1), 'Tokyo', 'outline queries retain the settlement identity');
    H.copyButton.onclick();
    assert.equal(H.copied.at(-1), 'Tokyo', 'the copy action retains the identity rather than copying a presentation caption');
  }
  const localOnly = { ...f, properties: { name: '東京' } };
  assert.equal(HC.forFeature(localOnly, 'jp', 'ui'), '江戸', 'the local-spelling lane is reachable');
  assert.equal(HC.forFeature({ ...f, layer: { id: 'ofm-admin1' } }, 'en', 'ui'), null);
  assert.equal(HC.forFeature({ ...f, geometry: null }, 'en', 'ui'), null);
  assert.equal(HC.forFeature({ ...f, geometry: { type: 'LineString', coordinates: [f.geometry.coordinates] } }, 'en', 'ui'), null);
  for (const xy of [[0, 0], [NaN, tokyo.lat], [tokyo.lon, Infinity]]) {
    assert.equal(HC.forFeature({ ...f, geometry: { type: 'Point', coordinates: xy } }, 'en', 'ui'), null, 'the spelling alone cannot identify a city');
    assert.equal(HC.at('Tokyo', ...xy, 'en'), null, 'the direct lookup keeps the same position guard');
  }
  H.win.IntMapTime.isLive = () => true;
  assert.equal(HC.forFeature(f, 'en', 'ui'), null);
  await H.click([f]);
  assert.ok(!H.live()[0].html.includes('Edo'), 'Now restores the ordinary city heading');
});

for (const reverseHandlers of [false, true]) for (const padded of [false, true]) {
  test(`R709: a dynamically registered source place shares label arbitration (reverse handlers ${reverseHandlers}, padded ${padded})`, async () => {
    const H = harness();
    const id = 'test-source-owned-place';
    H.layers.set(id, { id, type: 'symbol' });
    const calls = [];
    let visible = false;
    const unregister = H.win.IntMapPlaceReaders.register(id, {
      open(f, e) { calls.push({ f, e }); visible = true; return true; },
      close() { visible = false; },
    });
    const f = feature(id, 'Source-attested place');
    assert.ok(H.GE.events.clickLayers().includes(id), 'dynamic readers are real click registrations');
    assert.equal(H.handlersFor(id).length, 3, 'click and both pointer affordances are registered');
    for (const touch of [false, true]) for (const name of ['Named historical territory', '']) {
      H.win._imTouchPrimary = () => touch;
      const before = calls.length;
      await H.click([f, feature('imtb-fill', name, 'fill')], { padded, reverseHandlers });
      assert.equal(calls.length, before + 1, 'one source answer, after the whole dispatch');
      assert.equal(calls.at(-1).f, f, 'the source receives its original attested feature');
      assert.ok(visible, 'the source answer remains open');
      assert.equal(H.live().length, 0, 'the generic place popup never substitutes for the source');
      assert.equal(H.outlines.length, 0, 'there is no unrelated modern geocoder request');
      assert.equal(H.blank.length, 0, 'historical background yields to the source place');
      if (padded) {
        const box = H.state.queries.find(q => Array.isArray(q.pt) && q.layers?.includes(id));
        assert.ok(box, 'the source is included in the actual padded label query');
        assert.equal(box.pt[1][0] - box.pt[0][0], touch ? 30 : 12, 'the shared pointer tolerance reaches new source layers');
      }
    }
    await H.click([]);
    assert.ok(!visible, 'empty map closes the source answer');
    await H.click([f], { padded, reverseHandlers });
    await H.click([feature('ofm-city', 'Modern place')]);
    assert.ok(!visible, 'opening another place closes the source answer');
    assert.equal(H.live().length, 1);
    await H.click([]);
    const before = calls.length;
    H.layers.set('test-exclusive-object', { id: 'test-exclusive-object', type: 'circle' });
    H.GE.events.onLayer('click', 'test-exclusive-object', () => {});
    await H.click([f, feature('test-exclusive-object', 'Object', 'circle'), feature('imtb-fill', '', 'fill')], { padded, reverseHandlers });
    assert.equal(calls.length, before, 'an exclusive object outranks the source reader');
    await H.click([f, feature('imtb-fill', '', 'fill')], { padded, reverseHandlers, claim: true });
    assert.equal(calls.length, before, 'a map-level claim outranks the source reader');
    unregister(); unregister();
    assert.equal(H.handlersFor(id).length, 0, 'unregister removes click and hover callbacks, idempotently');
    assert.ok(!H.GE.events.clickLayers().includes(id), 'unregister removes ownership');
    await H.click([f], { padded: true });
    assert.equal(calls.length, before);
    assert.equal(H.live().length, 0, 'unregister also removes the label fallback entry');
    const staleQueries = H.state.queries.filter(q => Array.isArray(q.pt) && q.layers?.includes(id));
    assert.equal(staleQueries.length, 0, 'a removed source is absent from padded label queries');
  });
}

test('R709: the real label stack restores newly registered source names above opaque data without reorder loops', () => {
  const H = harness();
  H.loadOcclusion();
  const id = 'a-source-registered-after-owner-boot';
  H.layers.set(id, { id, type: 'symbol' });
  const unregister = H.win.IntMapPlaceReaders.register(id, { open: () => true, close() {} });
  H.layers.set('opaque-data-raster', { id: 'opaque-data-raster', type: 'raster' });
  H.layers.set('tool-poly', { id: 'tool-poly', type: 'fill' });
  H.win._raiseLabelLayers();
  const order = [...H.layers.keys()];
  assert.ok(order.indexOf(id) > order.indexOf('opaque-data-raster'), 'late opaque data cannot bury the source name');
  assert.equal(order.indexOf(id) + 1, order.indexOf('ofm-city'), 'dynamic names participate at the city tier');
  assert.ok(order.indexOf('tool-poly') > order.indexOf('ofm-country'), 'the user drawing remains above the label stack');
  assert.ok(H.state.moves.includes(id), 'the shipped owner actually moved the dynamic source');
  const settled = H.state.moves.length;
  H.win._raiseLabelLayers();
  H.win._raiseLabelLayers();
  assert.equal(H.state.moves.length, settled, 'a settled stack does not keep issuing renderer moves');
  unregister();
  assert.ok(!H.win.IntMapPlaceReaders.ids().includes(id));
  H.layers.set('another-opaque-raster', { id: 'another-opaque-raster', type: 'raster' });
  H.state.moves = [];
  H.win._raiseLabelLayers();
  assert.ok(!H.state.moves.includes(id), 'unregistered sources leave the owner stack');
  assert.ok(H.state.moves.includes('ofm-city'), 'the owner still heals the remaining labels');
  const afterRemoval = H.state.moves.length;
  H.win._raiseLabelLayers();
  assert.equal(H.state.moves.length, afterRemoval, 'removal does not create a reorder loop either');
});
