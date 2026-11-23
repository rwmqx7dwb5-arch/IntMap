/* The two halves of this round, run for real (no browser):
 *  ① js/render-witness.js — 「it is drawn」 is said of what reached the screen. Fake adapters implement only the members BOTH real
 *     adapters implement; every verdict below is one of the five ways a surface the renderer holds is still not seen, plus the
 *     two ways it IS seen, plus the case that must NOT become a failure (could not tell).
 *  ② js/building-attrs.js — the attribute names are the ones read off the datasets' own tiles (dev-notes/2026-11-24-…).
 * The wiring (Atlas result line, facade member, Cesium pick, card mount) is read as source where it cannot be run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeRenderWitness } from '../js/render-witness.js';
import { describeBuilding, datasetOfTileset } from '../js/building-attrs.js';
import { worldTilesetId } from '../js/world-3d-sources.js';
import { plateauTilesetId } from '../js/plateau-cities.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

/** a fake adapter: one GeoJSON surface `s` read by layer `s-l`, camera over [0,0]-[10,10], a canvas whose pixel at the feature depends on visibility */
function fake(o = {}) {
  const st = { vis: { 's-l': o.visible !== false }, op: 1, frames: 0 };
  const layer = Object.assign({ id: 's-l', type: 'fill', source: 's', paint: {} }, o.layer || {});
  const feats = o.features || [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[2, 2], [4, 2], [4, 4], [2, 4], [2, 2]]] } }];
  const canvas = { width: 200, height: 200, clientWidth: 200, clientHeight: 200,
    snapshot() { const covered = !!o.covered, on = st.vis['s-l'] && st.op !== 0 && !o.paintsNothing && !covered; return () => (on ? [200, 0, 0, 255] : [10, 10, 10, 255]); } };
  const a = {
    getStyle: () => ({ layers: [layer] }), isVisible: (id) => st.vis[id] !== false, setVisible: (id, v) => { st.vis[id] = !!v; },
    getPaint: (id, p) => (o.paint ? o.paint[p] : undefined), setPaint: (id, p, v) => { st.op = v === undefined ? 1 : v; if (o.paint) o.paint[p] = v; }, sourceData: () => ({ type: 'FeatureCollection', features: feats }),
    getBounds: () => ({ getWest: () => o.west ?? 0, getEast: () => o.east ?? 10, getSouth: () => 0, getNorth: () => 10 }),
    getZoom: () => o.zoom ?? 5, project: (p) => ({ x: p[0] * 20, y: 200 - p[1] * 20 }), getCanvas: () => canvas,
    queryRenderedFeatures: () => (o.rendered === 0 ? [] : [{ layer: { id: 's-l' } }]),
    redraw: o.noRedraw ? undefined : () => { st.frames++; },
  };
  const deps = { makeCanvas: () => { let snap = null; const cx = { drawImage(src) { snap = src.snapshot(); }, getImageData(x, y) { return { data: snap(x, y) }; } }; return { width: 200, height: 200, getContext: () => cx }; } };
  const drawn = { observable: true, surfaces: { s: { owners: ['k'], state: o.state || 'drawn', features: 1 } }, drawn: ['s'], gone: [] };
  const frame = (fn) => fn(o.live !== false);
  return { a, deps, drawn, frame, st, look: (q) => makeRenderWitness(deps).look(a, drawn, q || {}, (ids) => (o.errors || []), frame) };
}

test('① a surface whose frame changes where its features are is SEEN', async () => {
  const f = fake(); const r = await f.look(); const s = r.surfaces.s;
  assert.equal(s.verdict, 'seen'); assert.equal(s.reason, 'pixels_changed'); assert.ok(s.pixels.changed > 0);
  assert.equal(f.st.op, 1, 'the opacity is put back exactly as it was found'); assert.equal(f.st.vis['s-l'], true, 'visibility is never touched (it rebuilds the tiles — measured)'); assert.equal(f.st.frames, 2, 'one frame at opacity 0 and one with it back');
});

test('① the five ways a held, visible-flagged surface is still not on the screen', async () => {
  assert.equal((await fake({ paint: { 'fill-opacity': 0 } }).look()).surfaces.s.reason, 'opacity_0');
  assert.equal((await fake({ layer: { minzoom: 8 } }).look()).surfaces.s.reason, 'zoom_range');
  assert.equal((await fake({ layer: { maxzoom: 5 } }).look()).surfaces.s.reason, 'zoom_range', 'maxzoom is exclusive');
  assert.equal((await fake({ west: 20, east: 30 }).look()).surfaces.s.reason, 'viewport');
  const er = await fake({ errors: ['tile 404'] }).look(); assert.equal(er.surfaces.s.reason, 'error'); assert.deepEqual(er.surfaces.s.errors, ['tile 404']);
  const cv = await fake({ covered: true }).look(); assert.equal(cv.surfaces.s.verdict, 'not_seen'); assert.equal(cv.surfaces.s.reason, 'covered', 'the renderer has it, the screen does not change');
  const np = await fake({ paintsNothing: true, rendered: 0 }).look(); assert.equal(np.surfaces.s.reason, 'no_pixels');
});

test('① a circle at opacity 0 with a visible stroke, and an expression opacity, are NOT reported invisible', async () => {
  const c = await fake({ layer: { type: 'circle' }, paint: { 'circle-opacity': 0, 'circle-stroke-opacity': 1 } }).look(); assert.equal(c.surfaces.s.verdict, 'seen');
  const e = await fake({ paint: { 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0, 10, 1] } }).look(); assert.equal(e.surfaces.s.verdict, 'seen', 'cannot evaluate an expression ≠ transparent');
});

test('① COULD NOT TELL is never a failure (one-pass-or-a-reason §5)', async () => {
  const hidden = await fake({ live: false, rendered: 0 }).look(); assert.equal(hidden.surfaces.s.verdict, 'unconfirmed'); assert.deepEqual(hidden.notSeen, []);
  const noRedraw = await fake({ noRedraw: true, rendered: 0 }).look(); assert.equal(noRedraw.surfaces.s.verdict, 'unconfirmed', 'an adapter that cannot redraw is not a map that drew nothing');
  const viaQuery = await fake({ live: false }).look(); assert.equal(viaQuery.surfaces.s.verdict, 'seen', 'the renderer reporting its features at the screen is evidence enough');
  const unknown = await makeRenderWitness({}).look(fake().a, { observable: true, surfaces: { s: { owners: [], state: 'unknown', features: null } } }, {}, null, null); assert.equal(unknown.surfaces.s.verdict, 'unconfirmed');
  const no = await makeRenderWitness({}).look(null, { observable: false, surfaces: {} }, {}, null, null); assert.equal(no.observable, false);
});

test('① states other than drawn are reported as they are, and pixels can be switched off', async () => {
  const h = await fake({ state: 'hidden' }).look(); assert.equal(h.surfaces.s.verdict, 'not_drawn'); assert.equal(h.surfaces.s.reason, 'hidden');
  const f = fake(); const r = await f.look({ pixels: false }); assert.equal(f.st.frames, 0, 'no frame was rendered'); assert.equal(r.surfaces.s.verdict, 'seen');
});

test('① the frames are compared in ONE task: the opacity is back before anything can be presented, even if a render throws', async () => {
  const f = fake(); f.a.redraw = () => { if (f.st.op === 0) throw new Error('boom'); };
  const r = await f.look(); assert.equal(f.st.op, 1); assert.ok(['unconfirmed', 'seen'].includes(r.surfaces.s.verdict));
});

test('① wiring: facade member, error hearing, lazy chunk, Atlas result line, both adapters speak the members it reads', () => {
  const ge = read('js/geo-engine.js');
  assert.match(ge, /witness:q=>_witness\(q\)/); assert.match(ge, /import\('\.\/render-witness\.js'\)/); assert.match(ge, /a\.on\('error'/);
  const ce = read('js/cesium-engine.js'); assert.match(ce, /fire\('error',\{error:err\|\|new Error\(rec\.unpainted\),layerId:/, 'Cesium raises the error event the witness hears');
  for (const m of ['getPaint(', 'sourceData(', 'getBounds(', 'queryRenderedFeatures(', 'project(', 'getCanvas(']) assert.ok(ce.includes(m), 'cesium adapter has ' + m);
  const con = read('js/atlas-console.js'); assert.match(con, /render\.witness\(\{sources:ids\}\)/); assert.match(con, /Drawn, but not visible on screen/);
  assert.match(con, /meta:r\.meta|r\.meta=Object\.assign\(\{\},r\.meta\|\|\{\},\{ seen:_sn \}\)/);
});

/* ② ────────────────────────────────────────────────────────────────────────────────────────────── */
test('② the dataset of a tileset id is read from the same constants the layer opens them under', () => {
  assert.equal(datasetOfTileset(worldTilesetId('3dbag')), '3dbag'); assert.equal(datasetOfTileset(worldTilesetId('reearth-buildings')), 'reearth-buildings');
  assert.equal(datasetOfTileset(plateauTilesetId('13101')), 'plateau'); assert.equal(datasetOfTileset('something-else'), null); assert.equal(describeBuilding('something-else', {}), null);
});

test('② PLATEAU: the names read off a real Chiyoda b3dm (2026-11-24) give height, use, storeys, address, structure', () => {
  const d = describeBuilding(plateauTilesetId('13101'), { 'gml:name': '読売新聞社東京本社', 'bldg:class': '堅ろう建物', 'bldg:usage': '業務施設', 'bldg:measuredHeight': 204.2, 'bldg:storeysAboveGround': 33, 'bldg:storeysBelowGround': 3,
    'bldg:address': '東京都千代田区大手町一丁目', 'uro:BuildingIDAttribute_uro:buildingID': '13101-bldg-418', 'uro:BuildingDetailAttribute_uro:fireproofStructureType': '耐火', 'attributes': { big: 1 }, '_x': 1 });
  assert.equal(d.title, '読売新聞社東京本社'); assert.equal(d.headline.value, '204.2 m');
  const by = Object.fromEntries(d.rows.map((r) => [r.key, r.value])); assert.equal(by.usage, '業務施設'); assert.equal(by.floorsAbove, '33'); assert.equal(by.floorsBelow, '3'); assert.equal(by.fireproof, '耐火'); assert.equal(by.id, '13101-bldg-418');
  assert.equal(by.year, undefined, 'no year in the tile → no row, nothing guessed');
  assert.ok(!d.all.some(([k]) => k === 'attributes' || k.startsWith('_')), 'the duplicate object and the engine fields are not listed');
  assert.ok(d.all.some(([k]) => k === 'bldg:usage'));
  assert.equal(describeBuilding(plateauTilesetId('1'), { 'bldg:yearOfConstruction': 1964 }).rows.find((r) => r.key === 'year').value, '1964');
  assert.equal(describeBuilding(plateauTilesetId('1'), { 'bldg:yearOfConstruction': 0 }).rows.find((r) => r.key === 'year'), undefined, '0 is a missing year, not the year 0');
});

test('② 3D BAG: year, storeys, and a ridge height derived from the two states the dataset gives — and the nodata sentinels are not values', () => {
  const d = describeBuilding(worldTilesetId('3dbag'), { identificatie: 'NL.IMBAG.Pand.0363100012345678', oorspronkelijkbouwjaar: 1925, b3_bouwlagen: 4, b3_h_nok: 14.3, b3_h_maaiveld: 2.1, b3_dak_type: 'slanted', status: 'Pand in gebruik' });
  assert.equal(d.headline.value, '12.2 m'); assert.equal(d.headline.note.code, 'ridge-derived', 'the headline says it is derived, not stated');
  const by = Object.fromEntries(d.rows.map((r) => [r.key, r.value])); assert.equal(by.year, '1925'); assert.equal(by.floors, '4'); assert.equal(by.roof, 'slanted');
  const n = describeBuilding(worldTilesetId('3dbag'), { b3_h_nok: 3.4028234663852886e+38, b3_h_maaiveld: 2, b3_bouwlagen: 2147483647, oorspronkelijkbouwjaar: 2147483647 });
  assert.equal(n.headline, null); assert.equal(n.rows.length, 0); assert.equal(n.all.length, 1, 'only the real value is listed');
});

test('② Re:Earth Buildings: the height says HOW it was set, so a default is not shown as a measurement', () => {
  const d = describeBuilding(worldTilesetId('reearth-buildings'), { name: 'Tour Montparnasse', height: 210, height_method: 'explicit', num_floors: 59, subtype: 'commercial', class: 'office', roof_shape: 'flat', gers_id: 'abc', min_height: 0, source_height: 210 });
  assert.equal(d.title, 'Tour Montparnasse'); assert.equal(d.headline.value, '210 m'); assert.deepEqual(d.headline.note, { code: 'height-method', arg: 'explicit' });
  const f = describeBuilding(worldTilesetId('reearth-buildings'), { height: 9, height_method: 'footprint' }); assert.equal(f.headline.note.arg, 'footprint');
  assert.equal(f.rows.length, 0);
  const by = Object.fromEntries(d.rows.map((r) => [r.key, r.value])); assert.equal(by.type, 'commercial / office'); assert.equal(by.raised, undefined);
});

test('② the card owns the words: every row key the datasets can produce has en + jp text, written once', () => {
  const attrs = read('js/building-attrs.js'), card = read('js/building-info.js');
  const keys = [...attrs.matchAll(/\['([a-zA-Z]+)', \(/g)].map((m) => m[1]);
  assert.ok(keys.length >= 12);
  for (const k of new Set(keys)) assert.ok(card.includes("case '" + k + "': return L('"), 'a label for row key ' + k);
  assert.ok(!/\{ ?en:/.test(attrs), 'no language-keyed objects in the data module');
});

test('② the card is DOM text only, mounted lazily, closed with the layer, untinting what it tinted', () => {
  const card = read('js/building-info.js'); assert.ok(!/innerHTML\s*=\s*[^']/.test(card.replace(/x\.innerHTML = '<svg[^']*'/, '')), 'only the fixed close glyph uses innerHTML');
  assert.match(card, /clearBuildingPick/); assert.match(card, /Escape/);
  const bo = read('js/beta-overlays.js'); assert.match(bo, /import\('\.\/building-info\.js'\)/); assert.match(bo, /bldgCard\.destroy\(\)/);
  const ce = read('js/cesium-engine.js'); assert.match(ce, /_pickBuilding\(pos,ev\)/); assert.match(ce, /fire\('buildingpick',out\)/); assert.match(ce, /fire\('buildingpickclear'/);
  for (const f of ['js/geo-engine.js', 'types/geo-engine.d.ts']) assert.match(read(f), /clearBuildingPick/);
});
