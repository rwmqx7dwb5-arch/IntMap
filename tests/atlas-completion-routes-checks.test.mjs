/* ============================================================================
 *  atlas-completion — a route, a map explanation and the answer pins are judged by what is ON THE MAP
 * ----------------------------------------------------------------------------
 *  Four defects a reader reproduced, each run here against the shipped modules over the REAL renderer
 *  facade (js/geo-engine.js) driving a MapLibre-shaped stand-in, and the REAL sea-route search over a
 *  land mask rasterised from a two-block world:
 *    A2  routing.setEndpoints drove the SEA route (IntMapRoute) and was judged by the LAND router: a
 *        drawn sea route was 「no_route」, a stale land route 「ok」, one resolved end was ok:true, and
 *        the search ran in a setTimeout nobody waited for.
 *    A3  compose_map drew every relation as one great-circle arc — a 「shipping route」 over a continent —
 *        and its result could not say whether a line was a representative sketch or a computed path.
 *    B2a the answer-pin pass called a place 「mapped」 once it had a coordinate: four failed paints,
 *        「4 places mapped」.
 *    B2b the object list typed its subsystems in by hand and missed Atlas's own drawings: 4 pins, 0 objects.
 * ==========================================================================*/
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

/* ── the stand-ins: a map, a document, and a canvas that really rasterises the land ─────────────────── */
const W = 3600, H = 1800;
function fakeCanvas() {
  const px = new Uint8Array(W * H).fill(255);
  let fill = 255, path = [], sub = null;
  const col = (c) => (/^#?0+$|^#000/.test(String(c)) ? 0 : 255);
  const ctx = {
    set fillStyle(v) { fill = col(v); }, get fillStyle() { return fill; },
    strokeStyle: '', lineWidth: 1, lineJoin: '',
    fillRect(x, y, w, h) { for (let j = Math.max(0, y); j < Math.min(H, y + h); j++) px.fill(fill, j * W + Math.max(0, x), j * W + Math.min(W, x + w)); },
    beginPath() { path = []; sub = null; },
    moveTo(x, y) { sub = [[x, y]]; path.push(sub); }, lineTo(x, y) { if (sub) sub.push([x, y]); }, closePath() {},
    /* even-odd scanline fill at pixel centres — enough for the rectangles below */
    fill() {
      const edges = [];
      path.forEach((r) => r.forEach((p, i) => { const q = r[(i + 1) % r.length]; if (p[1] !== q[1]) edges.push([p, q]); }));
      let y0 = H, y1 = 0; edges.forEach(([p, q]) => { y0 = Math.min(y0, p[1], q[1]); y1 = Math.max(y1, p[1], q[1]); });
      for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
        const yc = y + 0.5, xs = [];
        edges.forEach(([p, q]) => { if ((p[1] <= yc) !== (q[1] <= yc)) xs.push(p[0] + (yc - p[1]) * (q[0] - p[0]) / (q[1] - p[1])); });
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) { const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W, Math.ceil(xs[k + 1] - 0.5)); if (b > a) px.fill(fill, y * W + a, y * W + b); }
      }
    },
    getImageData() { const d = new Uint8Array(W * H * 4); for (let i = 0; i < px.length; i++) d[i * 4] = px[i]; return { data: d }; },
  };
  return { width: W, height: H, getContext: () => ctx };
}
const el = () => ({ style: {}, children: [], appendChild(c) { this.children.push(c); }, querySelector: () => el(), querySelectorAll: () => [],
  addEventListener() {}, setAttribute() {}, getAttribute: () => null, hasAttribute: () => false, remove() {}, classList: { toggle() {}, add() {}, remove() {} } });
function fakeMap() {
  const sources = new Map(), layers = [];
  return {
    style: { _loaded: true }, isStyleLoaded: () => true,
    getSource: (id) => sources.get(id), addSource: (id, d) => { sources.set(id, { _data: d.data, setData(x) { this._data = x; } }); },
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.find((l) => l.id === id), addLayer: (l) => { layers.push({ ...l, layout: { ...(l.layout || {}) } }); },
    removeLayer: (id) => { const i = layers.findIndex((l) => l.id === id); if (i >= 0) layers.splice(i, 1); },
    getLayoutProperty: (id, p) => { const l = layers.find((x) => x.id === id); return l && l.layout[p]; },
    setLayoutProperty: (id, p, v) => { const l = layers.find((x) => x.id === id); if (l) l.layout[p] = v; },
    setPaintProperty() {}, setFilter() {},
    getStyle: () => ({ layers: layers.map((l) => ({ id: l.id, source: l.source, layout: l.layout })), sources: {} }),
    on() {}, off() {}, once() {}, fitBounds() {}, flyTo() {}, easeTo() {}, getZoom: () => 3, getCanvas: () => ({ style: {} }), triggerRepaint() {},
  };
}
const rect = (w, s, e, n) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] }, properties: {} });
/* two continents: a narrow one a route must go AROUND, and a wide one whose middle is farther from water than the
   search will snap (140 cells = 14°), so a point there has no sea */
const NARROW = [10, -20, 20, 20], WIDE = [40, -40, 80, 40];
const inside = (p, b) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3];
const hav = (a, b) => { const r = Math.PI / 180, x = Math.sin((b[1] - a[1]) * r / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin((b[0] - a[0]) * r / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(x)); };

const PLACES = { 'West Port': [0, 0], 'East Port': [30, 0], 'South Port': [15, -30], 'NW Mark': [5, 30], 'NE Mark': [25, 30], 'Inland City': [60, 0],
  Tokyo: [139.7, 35.7], Osaka: [135.5, 34.7], Nagoya: [136.9, 35.2], Sapporo: [141.35, 43.06] };
const geocode = async (q) => { const n = String(q).split(',')[0].trim(); const p = PLACES[n]; return p ? { lng: p[0], lat: p[1], name: n } : null; };

const saved = {};
let GE, SR, CAPS, makeAtlasMapCompose, V, GEOBJ;
before(async () => {
  for (const k of ['window', 'document', 'location', '__imap', 'countryGeo', 'IntMapGeoEngine', 'IntMapLang', 'IntMapRuntime', 'IntMapRoute', 'IntMapRouting', 'IntMapObjects']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  globalThis.window = globalThis;
  globalThis.location = { search: '' };
  globalThis.document = { createElement: (t) => (t === 'canvas' ? fakeCanvas() : el()), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { lang: 'en' } };
  globalThis.__imap = fakeMap();
  globalThis.IntMapRuntime = { every: () => () => {} };   /* the object list's fab tick: not under test, and no interval left running */
  globalThis.countryGeo = { features: [rect(...NARROW), rect(...WIDE)] };
  ({ IntMapGeoEngine: GE } = await import('../js/geo-engine.js'));
  globalThis.IntMapGeoEngine = GE;
  globalThis.IntMapLang = (await import('../js/lang-registry.js')).IntMapLang;
  const MT = await import('../js/map-tools.js');
  MT.seaRoute({ t: (k) => k, fmtLL: () => '', makeDraggable() {}, canDraw: () => true, lang: 'en' });
  SR = globalThis.IntMapRoute;
  MT.objectList({ removePin() {}, refreshTool() {}, makeDraggable() {}, isMobile: () => false, userPins: [], radiusItems: [], lang: 'en' });
  CAPS = (await import('../js/atlas-capabilities.js')).makeAtlasCapabilities({});
  ({ makeAtlasMapCompose } = await import('../js/atlas-map-compose.js'));
  V = (await import('../js/atlas-verify.js')).makeAtlasVerify({}, { L: (en) => en, esc: (s) => String(s) });
  GEOBJ = (await import('../js/atlas-geo-object.js')).makeAtlasGeoObject();
});
after(() => { for (const [k, d] of Object.entries(saved)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });

const routeCap = async () => (await import('../js/atlas-cap-routing.js')).default.find((e) => e.row[0] === 'routing.setEndpoints');
const K = () => ({ geocode, GE: () => GE, R: (ok, html, x) => Object.assign({ ok: !!ok, html: html || '' }, x || null),
  note: (s) => s, warn: (s) => s, L: (en) => en, esc: (s) => String(s), whereMiss: (s, p) => s + ' [' + p + ']' });
/* what js/atlas-executor.js does around a capability: observe, run, observe, verify */
async function execute(entry, args) {
  const obs = CAPS.OBSERVERS[entry.row[4]];
  const before = obs.observe(), raw = await entry.run(args, {}, K()), after = obs.observe();
  return { raw, verdict: obs.verify({}, args, before, after, raw, entry.row[0]) };
}

/* ══ A2 ═══════════════════════════════════════════════════════════════════════════════════════ */
test('A2 ①: IntMapRoute.run resolves after the route is computed AND drawn, around the land, numbered', async () => {
  const r = await SR.run({ from: [0, 0], to: [30, 0] });
  assert.equal(r.ok, true, JSON.stringify({ ...r, coords: undefined }));
  assert.ok(r.opId > 0);
  assert.ok(!r.coords.some((p) => inside(p, NARROW)), 'the sea route crosses the continent');
  assert.ok(r.km > hav([0, 0], [30, 0]), 'a detour is longer than the straight line');
  const st = SR.state();
  assert.deepEqual([st.opId, st.hasRoute, st.painted], [r.opId, true, true], 'state() describes the run that just finished');
  const line = GE.layers.sourceData('route-src').features.filter((f) => f.properties.kind === 'route');
  assert.ok(line.length > 0, 'the route line is in the source when run() resolves — not a setTimeout later');
});

test('A2 ②: routing.setEndpoints is judged by the sea route of ITS OWN operation, not by the land router', async () => {
  const cap = await routeCap();
  assert.equal(cap.row[4], 'seaRoute', 'observed by the sea-route observer');
  /* a sea route and no land route: completed (was failed / no_route) */
  globalThis.IntMapRouting = { hasRoute: () => false, painted: () => false, visible: () => false };
  let x = await execute(cap, { from: 'West Port', to: 'East Port' });
  assert.equal(x.raw.ok, true);
  assert.equal(x.raw.meta.seaRoute.opId, SR.state().opId, 'the result carries the operation it started');
  assert.deepEqual([x.verdict.status, x.verdict.code], ['completed', 'ok']);
  /* no sea route possible, but an old land route on the map: failed (was completed / ok) */
  globalThis.IntMapRouting = { hasRoute: () => true, painted: () => true, visible: () => true };
  x = await execute(cap, { from: 'Inland City', to: 'East Port' });
  assert.equal(x.raw.ok, false);
  assert.equal(x.raw.meta.code, 'on_land');
  assert.equal(x.verdict.status, 'failed', 'a stale land route does not make a failed sea route a success');
  assert.equal(SR.state().hasRoute, false, '…and the engine says there is no route');
});

test('A2 ③: one resolved end is not a route — ok:false, the missing end named', async () => {
  const cap = await routeCap();
  const opBefore = SR.state().opId;
  const x = await execute(cap, { from: 'West Port', to: 'Nowhereville' });
  assert.equal(x.raw.ok, false, 'one end used to set a start and report ok:true');
  assert.deepEqual(x.raw.meta.unresolved, ['Nowhereville']);
  assert.match(x.raw.html, /Nowhereville/);
  assert.equal(SR.state().opId, opBefore, 'nothing was run on half a route');
  assert.equal(x.verdict.status, 'failed');
});

test('A2 ④: a run replaced before it finished says so, and the verdict will not take the newer route as its own', async () => {
  const first = SR.run({ from: [0, 0], to: [30, 0] });
  const second = SR.run({ from: [0, 5], to: [30, 5] });
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual([a.ok, a.reason], [false, 'superseded']);
  assert.equal(b.ok, true);
  const obs = CAPS.OBSERVERS.seaRoute;
  const v = obs.verify({}, {}, null, obs.observe(), { ok: true, html: '', meta: { seaRoute: { opId: a.opId } } });
  assert.deepEqual([v.status, v.code], ['failed', 'superseded']);
});

test('A2 ⑤: the panel button and setEnd go through the same run; a hidden line is computed-but-not-drawn', async () => {
  SR.setStart({ lng: 0, lat: 0 });
  const r = await SR.setEnd({ lng: 30, lat: 0 });
  assert.ok(r && r.ok && r.opId === SR.state().opId, 'setEnd → compute → run, and it can be awaited');
  GE.layers.setLayout('route-line', 'visibility', 'none');
  const obs = CAPS.OBSERVERS.seaRoute;
  const v = obs.verify({}, {}, null, obs.observe(), { ok: true, html: '', meta: { seaRoute: { opId: r.opId } } });
  assert.deepEqual([v.status, v.code], ['partial', 'not_rendered']);
  GE.layers.setLayout('route-line', 'visibility', 'visible');
});

test('A2 ⑥: seaPath computes without drawing or touching the panel route', async () => {
  const st = SR.state();
  const p = await SR.seaPath([0, 0], [30, 0]);
  assert.equal(p.ok, true);
  assert.ok(!p.coords.some((q) => inside(q, NARROW)));
  assert.equal(SR.state().opId, st.opId, 'not an operation of the route panel');
  assert.deepEqual(await SR.seaPath([60, 0], [30, 0]), { ok: false, reason: 'on_land' });
});

/* ══ A3 ═══════════════════════════════════════════════════════════════════════════════════════ */
function compose() { return makeAtlasMapCompose({ GE: () => GE, geocode, now: Date.now, L: (en) => en }); }
const relLines = () => (GE.layers.sourceData('atl-compose-src').features || []).filter((f) => f.properties.t === 'rel');
const flat = (g) => (g.type === 'LineString' ? g.coordinates : g.coordinates.flat());

test('A3 ⓪: a route with no basis is COMPUTED (the reader’s decision 2026-11-18); other types keep the arc', async () => {
  const C = compose();
  const r = await C.run({ items: ['West Port', 'East Port'].map((name) => ({ name })), relations: [
    { from: 1, to: 2, type: 'route', label: 'R' },
    { from: 1, to: 2, type: 'flow', label: 'F' },
  ] });
  assert.deepEqual(r.exec.relations.map((x) => x.basis), ['computed', 'schematic']);
  assert.equal(r.exec.relations[0].sea.onSea, true);
});

test('A3 ①: basis "computed" is a path over water; "schematic" through via points stays a schematic and says whether it is on water', async () => {
  const C = compose();
  const items = ['West Port', 'East Port', 'South Port'].map((name) => ({ name }));
  const r = await C.run({ items, relations: [
    { from: 1, to: 2, type: 'route', basis: 'computed', label: 'A' },
    { from: 3, to: 2, type: 'route', basis: 'computed', label: 'B' },
    { from: 1, to: 2, type: 'route', basis: 'schematic', label: 'C' },
    { from: 1, to: 2, type: 'route', basis: 'schematic', via: ['NW Mark', 'NE Mark'], label: 'D' },
  ] });
  assert.equal(r.ok, true);
  const rel = r.exec.relations;
  assert.deepEqual(rel.map((x) => x.basis), ['computed', 'computed', 'schematic', 'schematic']);
  assert.equal(relLines().length, 4, 'several suppliers\' routes are held on the map at once');
  /* the computed ones go around the continent */
  relLines().slice(0, 2).forEach((f) => assert.ok(!flat(f.geometry).some((p) => inside(p, NARROW)), 'a computed route crosses land'));
  assert.deepEqual(rel.slice(0, 2).map((x) => x.sea.onSea), [true, true]);
  assert.ok(rel[0].km > hav([0, 0], [30, 0]));
  /* the bare arc is drawn, labelled schematic, and reported as crossing land */
  assert.deepEqual([rel[2].sea.checked, rel[2].sea.onSea], [true, false]);
  assert.ok(rel[2].sea.landSamples > 0);
  /* via points are passed in order, and that schematic does stay on water */
  assert.deepEqual(rel[3].via, ['NW Mark', 'NE Mark']);
  const d = flat(relLines()[3].geometry);
  assert.ok(d.some((p) => hav(p, [5, 30]) < 1) && d.some((p) => hav(p, [25, 30]) < 1), 'the line passes its via points');
  assert.deepEqual([rel[3].sea.checked, rel[3].sea.onSea], [true, true]);
  /* the features carry it too, so a reader of the MAP sees the same */
  assert.deepEqual(relLines().map((f) => [f.properties.basis, f.properties.sea]), [['computed', 'sea'], ['computed', 'sea'], ['schematic', 'land'], ['schematic', 'sea']]);
  /* and the legend shows the three apart */
  assert.match(r.html, /computed sea route/);
  assert.match(r.html, /schematic — not a surveyed path/);
  assert.match(r.html, /crosses land/);
  assert.match(r.html, /via NW Mark → NE Mark/);
});

test('A3 ②: a computed route with no water path is a FAILED relation, not an arc; a track IntMap does not hold is said so', async () => {
  const C = compose();
  const r = await C.run({ items: ['West Port', 'East Port', 'Inland City'].map((name) => ({ name })), relations: [
    { from: 1, to: 2, type: 'route', basis: 'computed' },
    { from: 1, to: 3, type: 'route', basis: 'computed' },
    { from: 1, to: 2, type: 'route', basis: 'track' },
    { from: 1, to: 2, type: 'route', via: ['Atlantis'] },
  ] });
  assert.equal(r.exec.relationsDrawn, 1);
  assert.deepEqual(r.exec.relationsSkipped.map((x) => x.reason), ['sea_path_failed', 'track_unavailable', 'via_unplaced']);
  assert.equal(r.exec.relationsSkipped[0].leg.reason, 'on_land');
  assert.deepEqual(r.exec.relationsSkipped[2].via, ['Atlantis']);
  assert.equal(relLines().length, 1, 'nothing stands in for the failed ones');
  assert.equal(r.exec.status, 'partial');
  assert.match(r.exec.relationNote, /sea_path_failed/);
  assert.match(r.html, /Links not drawn/);
  /* the verdict reads the relations off the map, apart from the result */
  const obs = CAPS.OBSERVERS.mapCompose;
  const v = obs.verify({}, {}, null, obs.observe(), r);
  assert.equal(v.status, 'partial');
  assert.deepEqual(v.observed.compose.relations.byBasis, { computed: 1 });
  assert.deepEqual(v.observed.compose.relations.sea, { sea: 1, land: 0, unchecked: 0 });
  assert.equal(v.observed.compose.relations.onMap, 1);
  assert.deepEqual(v.observed.compose.relations.skipped.map((x) => x.reason), ['sea_path_failed', 'track_unavailable', 'via_unplaced']);
});

test('A3 ③: the verdict reports lines the result claims but the map does not hold', async () => {
  const C = compose();
  const r = await C.run({ items: ['West Port', 'East Port'].map((name) => ({ name })), relations: [{ from: 1, to: 2, type: 'route', basis: 'computed' }] });
  const obs = CAPS.OBSERVERS.mapCompose;
  const ok = obs.verify({}, {}, null, obs.observe(), r);
  assert.deepEqual([ok.status, ok.observed.compose.relations.onMap], ['completed', 1]);
  /* the line leaves the map while the points stay */
  GE.layers.setSourceData('atl-compose-src', { type: 'FeatureCollection', features: GE.layers.sourceData('atl-compose-src').features.filter((f) => f.properties.t !== 'rel') });
  const gone = obs.verify({}, {}, null, obs.observe(), r);
  assert.deepEqual([gone.status, gone.code], ['partial', 'relations_not_rendered']);
});

/* ══ B2a ══════════════════════════════════════════════════════════════════════════════════════ */
const JAPAN = ['Tokyo', 'Osaka', 'Nagoya', 'Sapporo'].map((name) => ({ name, country: 'Japan', kind: 'city' }));
async function pinPass(paint) {
  let pois = [];
  const pin = V.makePinReplyPlaces({ GE: () => GE, GEOBJ, L: (en) => en, geocode, ledger: null,
    paintPois: () => paint(pois), getPois: () => pois, setPois: (v) => { pois = v; } });
  return pin(JAPAN, { text: '', citations: [], contentClass: 'geographic' });
}
const mappedN = (html) => { const m = /(\d+) places? from this answer mapped/.exec(html); return m ? +m[1] : 0; };
const notDrawn = (html) => { const i = html.indexOf('Located but not drawn on the map: '); return i < 0 ? [] : html.slice(i + 34, html.indexOf('<', i)).split(', '); };
const paintReal = (pois) => {
  if (!GE.layers.hasSource('nlq-poi-src')) GE.layers.addSource('nlq-poi-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!GE.layers.has('nlq-poi-c')) GE.layers.add({ id: 'nlq-poi-c', type: 'circle', source: 'nlq-poi-src' });
  GE.layers.setSourceData('nlq-poi-src', { type: 'FeatureCollection', features: pois.map((p, i) => ({ type: 'Feature', id: i, geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { name: p.name } })) });
  return true;
};

test('B2a ①: four located places whose paint failed every time are not 「4 places mapped」', { timeout: 20000 }, async () => {
  /* before the POI painter has claimed anything the renderer cannot be asked — the painter's own answer decides */
  const html = await pinPass(() => false);
  assert.equal(mappedN(html), 0, html);
  assert.deepEqual(notDrawn(html), ['Tokyo', 'Osaka', 'Nagoya', 'Sapporo']);
});

test('B2a ②: a paint that says true but leaves the map empty is caught by asking the renderer', async () => {
  GE.render.claim('nlq-poi-src', 'map.poi', { clear() {} });   /* as js/atlas-console.js does */
  const html = await pinPass(() => true);
  assert.equal(mappedN(html), 0, html);
  assert.equal(notDrawn(html).length, 4);
  const ok = await pinPass(paintReal);
  assert.equal(mappedN(ok), 4, ok);
  assert.deepEqual(notDrawn(ok), []);
});

/* ══ B2b ══════════════════════════════════════════════════════════════════════════════════════ */
test('B2b: the object list holds what is drawn — found from the renderer\'s claims, with the ids the painters report', async () => {
  const C = compose();
  const r = await C.run({ items: ['West Port', 'East Port'].map((name) => ({ name })) });
  await pinPass(paintReal);
  /* a land route: its subsystem lists it, so the claim it also makes must not list it twice */
  GE.layers.addSource('imroute-src', { type: 'geojson', data: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} }] } });
  GE.layers.add({ id: 'imroute-line', type: 'line', source: 'imroute-src' });
  GE.render.claim('imroute-src', 'map.route');
  const L = globalThis.IntMapObjects.list();
  const byId = Object.fromEntries(L.map((o) => [o.id, o]));
  /* (atlas-objects-unify) a composed map is listed as ITS figures — one object per placed place, shape and link, under the id the compose result reports — not as one anonymous surface */
  const placedIds = r.meta.compose.placed.map((p) => p.id);
  assert.deepEqual(placedIds.filter((id) => byId[id] && byId[id].kind === 'place'), placedIds, 'every placed place is an object in the list, under the id the compose result reports');
  assert.deepEqual(r.objectIds.slice(0, placedIds.length), placedIds, 'the compose result hands the ids back as objectIds');
  assert.ok(!byId['surface:atl-compose-src'], 'the composed map is listed once, as its figures (not again as a surface)');
  assert.ok(placedIds.every((id) => byId[id].editable.includes('color') && byId[id].editable.includes('opacity')), 'a place takes a colour and an opacity');
  assert.equal(byId['surface:nlq-poi-src'].features.length, 4, 'the four answer pins');
  assert.ok(byId['surface:route-src'], 'the sea route');
  assert.ok(byId.route && !byId['surface:imroute-src'], 'a surface a subsystem already lists is listed once');
  /* × removes through the painter's own remover, and the list follows the map */
  /* deleting ONE figure takes that one: the other place of the same composed map stays drawn and listed (the owner removes by id; only clear() empties the map) */
  assert.equal(globalThis.IntMapObjects.remove(placedIds[0]), true);
  assert.equal(GE.layers.sourceData('atl-compose-src').features.length, placedIds.length - 1, 'one place gone, the rest of the map still drawn');
  assert.ok(!globalThis.IntMapObjects.list().some((o) => o.id === placedIds[0]), 'the removed place is no longer listed');
  assert.ok(placedIds.slice(1).every((id) => globalThis.IntMapObjects.list().some((o) => o.id === id)), 'the other places are still listed');
  /* and the last one empties it */
  placedIds.slice(1).forEach((id) => globalThis.IntMapObjects.remove(id));
  assert.equal(GE.layers.sourceData('atl-compose-src').features.length, 0);
});
