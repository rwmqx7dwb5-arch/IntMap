// The base map — the Chronos historical basemap, the current-map / satellite choice and its credit,
// the theme switch, and the polar caps.
//
// Gathered from tests/r705-chronos-basemap-checks (the engine-independent half: which rasters the
// historical physical basemap replaces, what it excludes, that it validates, and the visible credit —
// the Cesium half is in tests/engine-cesium-rendering-checks), tests/r181-checks ⑤ (applyTheme on the
// DEFAULT engine called something that called it back) and tests/r219-checks ⑦ (the polar caps on
// every base map). Titles keep the round that wrote them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import { full } from 'acorn-walk';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { installSafe } from './helpers/safe-html.mjs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const ctx = vm.createContext({ window: {}, console });
for (const file of ['js/historical-basemap.js', 'js/cesium-style.js']) vm.runInContext(read(file), ctx);
const base = ctx.window.IntMapHistoricalBasemap, style = ctx.window.IntMapStyle;

/* ══ #R705 THE CHRONOS HISTORICAL BASEMAP ═════════════════════════════════════════════════════ */

function engine() {
  const defs = ['layer-sat', 'layer-light', 'layer-light-nl', 'layer-dark', 'layer-dark-nl', 'imtb-fill', 'imtb-line'].map((id) => ({ id, type: id.startsWith('layer-') ? 'raster' : 'fill', layout: { visibility: 'none' } }));
  defs.unshift({ id: 'world-floor', type: 'raster', layout: { visibility: 'none' } }, { id: 'polar-cap', type: 'background', layout: { visibility: 'visible' } });
  const get = (id) => defs.find((d) => d.id === id);
  return { defs, scene: { getStyle: () => ({ layers: defs }) }, layers: { hasSource: () => true, has: (id) => !!get(id), add: (d, b) => defs.splice(b ? defs.findIndex((x) => x.id === b) : defs.length, 0, d), setPaint: (id, k, v) => { get(id).paint = { ...get(id).paint, [k]: v }; }, setLayout: (id, k, v) => { get(id).layout[k] = v; } } };
}
test('#R705 Chronos replaces all baked political rasters and restores each current map / satellite choice', () => {
  const e = engine();
  for (const light of [true, false]) for (const sat of [true, false]) for (const labels of [true, false]) for (const active of [true, false]) {
    base.apply(e, { active, sat, light, labels });
    for (const d of e.defs.filter((x) => x.id.startsWith('layer-') && x.id !== 'layer-sat')) assert.equal(d.layout.visibility, (!active && !sat && d.id === `layer-${light ? 'light' : 'dark'}${labels ? '' : '-nl'}`) ? 'visible' : 'none');
    for (const d of e.defs.filter((x) => x.id.startsWith('imhb-'))) assert.equal(d.layout.visibility, active && !sat ? 'visible' : 'none');
  }
  assert.equal(new Set(e.defs.map((d) => d.id)).size, e.defs.length);
  assert.ok(e.defs.findIndex((d) => d.id === 'imhb-ground') > e.defs.findIndex((d) => d.id === 'polar-cap'));
  assert.ok(e.defs.findIndex((d) => d.id === 'imhb-water') < e.defs.findIndex((d) => d.id === 'imtb-fill'));
});
test('#R705 physical geography excludes modern built land use and engineered waterways', () => {
  for (const light of [true, false]) {
    const defs = base.definitions(light);
    assert.ok(defs.every((d) => !['boundary', 'place', 'transportation', 'building', 'landuse', 'poi'].includes(d['source-layer'])));
    const cover = defs.find((d) => d['source-layer'] === 'landcover');
    for (const subclass of ['farmland', 'forest', 'garden', 'golf_course', 'park', 'village_green', 'allotments', 'flowerbed', 'residential', 'commercial']) assert.equal(style.evaluate(cover.filter, { properties: { subclass } }), false, subclass);
    assert.equal(style.evaluate(cover.filter, { properties: { subclass: 'wood' } }), true);
    const water = defs.find((d) => d['source-layer'] === 'water');
    for (const cl of ['swimming_pool', 'dock', 'pond']) assert.equal(style.evaluate(water.filter, { properties: { class: cl } }), false);
    assert.equal(style.evaluate(water.filter, { properties: { class: 'ocean' } }), true);
    const river = defs.find((d) => d['source-layer'] === 'waterway');
    for (const cl of ['canal', 'ditch', 'drain']) assert.equal(style.evaluate(river.filter, { properties: { class: cl } }), false);
    assert.equal(style.evaluate(river.filter, { properties: { class: 'river' } }), true);
    assert.equal(style.evaluate(river.filter, { properties: { class: 'river', brunnel: 'tunnel' } }), false);
    for (const z of [0, 5, 12, 18]) assert.ok(style.resolveNum(river.paint['line-width'], { zoom: z }, NaN) > 0);
  }
  assert.deepEqual(Array.from(style.gaps()), []);
});
test('#R705 both themes validate against the actual MapLibre style schema', () => {
  for (const light of [true, false]) assert.deepEqual(validateStyleMin({ version: 8, sources: { ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } }, layers: base.definitions(light) }), []);
});
test('#R705 visible credit follows historical physical base, satellite and return to Now', () => {
  let active = false, sat = false;
  const el = { innerHTML: '' };
  const document = { readyState: 'complete', getElementById: (id) => (id === 'map-credit' ? el : { classList: { contains: () => sat } }) };
  const win = { IntMapTimeBorders: { active: () => active } };
  installSafe(win);   /* the credit's links go through window.IntMapSafe.url (safe-output-single-module) */
  vm.runInNewContext(read('js/carto-basemap.js'), { window: win, document });
  assert.match(el.innerHTML, /CARTO/);
  active = true; win.IntMapCartoCredit(); assert.match(el.innerHTML, /OpenFreeMap/); assert.match(el.innerHTML, /OpenStreetMap/); assert.doesNotMatch(el.innerHTML, /CARTO/);
  sat = true; win.IntMapCartoCredit(); assert.match(el.innerHTML, /Esri/); assert.doesNotMatch(el.innerHTML, /OpenFreeMap/);
  active = false; sat = false; win.IntMapCartoCredit(); assert.match(el.innerHTML, /CARTO/);
});

/* ══ #R181 ⑤ THE DEFAULT ENGINE: applyTheme CALLED SOMETHING THAT CALLED IT BACK ═══════════════
   Pressing Satellite threw `RangeError: Maximum call stack size exceeded` on the DEFAULT engine —
   applyTheme rebuilds a sprite, which fires styledata synchronously, and the styledata handler calls
   applyTheme back. (#R199) applyTheme lives in js/theme-sky.js with the rest of the theme + sky block. */

/* RUN: applyTheme is lifted out of makeThemeSky and driven with a body that re-enters it exactly the
   way the styledata handler did. */
function liftApplyTheme(body) {
  const src = read('js/theme-sky.js');
  let fn = null;
  full(parse(src, { ecmaVersion: 'latest', sourceType: 'module' }), (n) => {
    if (!fn && n.type === 'FunctionDeclaration' && n.id && n.id.name === 'applyTheme') fn = n;
  });
  assert.ok(fn, 'js/theme-sky.js no longer declares applyTheme');
  return new Function('_applyThemeBody', `${src.slice(fn.start, fn.end)}\nreturn applyTheme;`)(body);
}
test('R181 ⑤: applyTheme cannot re-enter itself', () => {
  let calls = 0, applyTheme = null;
  applyTheme = liftApplyTheme(() => { calls++; if (calls < 50) applyTheme(); return 'themed'; });
  assert.equal(applyTheme(), 'themed');
  assert.equal(calls, 1, 'the styledata handler\'s call back into applyTheme must be a no-op while one is running — ' +
    'it ran eleven deep and then threw RangeError');
  assert.equal(applyTheme(), 'themed', 'and the next real call is not swallowed');
  assert.equal(calls, 2);
  /* the flag has to come off even if the body throws */
  let n = 0;
  const once = liftApplyTheme(() => { n++; if (n === 1) throw new Error('mid-theme'); return 'recovered'; });
  assert.throws(() => once(), /mid-theme/);
  assert.equal(once(), 'recovered', 'a throw must not leave the theme permanently locked');
});

/* ⚠ READ, NOT RUN: the handler is a styledata listener inside the booted app shell. */
test('R181 ⑤: and the handler that closes the loop is still there', () => {
  const src = read('js/app-body.js');
  assert.match(src, /wantSat!==isSat\) applyTheme\(\)/,
    'the desync repair is the point of that handler — it is the RE-ENTRY that was wrong, ' +
    'not the correction');
});

/* ══ #R219 ⑦ THE POLAR CAPS ARE COVERED ON EVERY BASE MAP ══════════════════════════════════════
   #R207 showed the cap only with the satellite view, so on the vector base map the ±85°–90° hole was
   still the renderer's black — measured at (7,7,15). And a flat colour is not imagery: the bundled
   equirectangular picture reaches ±90° and supplies the two bands the Mercator tile protocol cannot. */

/* ⚠ READ, NOT RUN: the cap is a set of MapLibre layers added to a live map, and what is measured
   (the pixel at the pole) only exists in a browser. */
test('R219 ⑦ the cap is shown on every base map, and carries the bundled imagery', () => {
  const src = read('js/world-base.js');
  assert.ok(/setLayout\(CAP,'visibility','visible'\)/.test(src),
    'applyCap must show the cap unconditionally — the satellite-only guard is the #R219 defect');
  assert.ok(/CAP_VEC_LIGHT/.test(src) && /CAP_VEC_DARK/.test(src), 'the vector base map needs its own cap tone');
  /* ⚠ MEASURED: a `background` layer is painted over the TILE COVERAGE, and there is no tile above
     85.0511° — with the cap background visible at #545454 the south polar pixel was still (11,11,11).
     Only GEOMETRY reaches a pole, so the fill mosaic is what covers the caps on EVERY base map and
     only its colour depends on which map is under it. */
  const ci = src.slice(src.indexOf('function capImages('), src.indexOf('function capImages(') + 1400);
  assert.ok(/satOn \? \['get', 'c'\] : \(_darkBase\(\)/.test(ci),
    'the cap mosaic must be shown on both base maps, with the colour choosing between them');
  assert.ok(!/if \(!satOn\) \{ try \{ if \(GE\(\)\.layers\.has\(CAPLYR\)\) GE\(\)\.layers\.setLayout\(CAPLYR, 'visibility', 'none'\)/.test(ci),
    'hiding the mosaic on the vector map is the defect this replaced');
  /* ⚠ NOT an `image` source: MapLibre puts every image corner through MercatorCoordinate, and
     latitude 90 has no Mercator y — measured, it throws on load. The caps carry the picture as a
     POLYGON MOSAIC coloured from it. */
  assert.ok(!/type:'image'/.test(src), 'an image source cannot be placed at a pole (see js/world-base.js)');
  assert.ok(/world-cap-src/.test(src) && /_capMosaic/.test(src) && /'fill-color': col/.test(src),
    'the caps must carry the bundled picture, not only a colour');
  /* the seam is the Mercator limit, exactly */
  assert.ok(/85\.0511287798066/.test(src), 'the band must start at the Web Mercator limit');
});
