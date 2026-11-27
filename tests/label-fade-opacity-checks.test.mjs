// The two rules, as pure functions — no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPropertyExpression, featureFilter, latest } from '@maplibre/maplibre-gl-style-spec';
import { fillFromAlpha, alphaFromFill, opacityPaint } from '../js/object-opacity.js';
const FILL_AT_FULL = fillFromAlpha(1);

globalThis.window = globalThis;
await import('../js/country-extent.js');
const CE = window.IntMapCountryExtent;

test('the opacity slider spans 0..FILL_AT_FULL for a fill and 0..1 for everything else', () => {
  assert.equal(fillFromAlpha(0), 0);
  assert.equal(fillFromAlpha(1), FILL_AT_FULL);
  assert.ok(FILL_AT_FULL >= 0.8, '100 % must read as dense');
  assert.ok(fillFromAlpha(1) - fillFromAlpha(0.1) > 0.5, 'the range must be wide enough to see');
  assert.deepEqual(opacityPaint('line', 0.4), [['line-opacity', 0.4]]);
  assert.deepEqual(opacityPaint('symbol', 0.4).map((x) => x[0]), ['text-opacity', 'icon-opacity']);
  assert.equal(opacityPaint('fill', 1)[0][1], FILL_AT_FULL);
});
test('a fill nobody set shows on the slider where the map is', () => {
  assert.equal(alphaFromFill(0.16), 0.2);
  assert.equal(alphaFromFill(FILL_AT_FULL), 1);
});
test('no painter multiplies the slider by a private fill base again', () => {
  const src = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  assert.ok(!/a\*0\.4/.test(src('map-tools.js')), 'generic layer fill = a*0.4');
  assert.ok(!/p\.op=a\*\(HP\.fillBase/.test(src('map-tools.js')), 'Atlas polygon');
});

function mapLayer(base = 1){
  const layoutFilter = ['==', ['get', 'class'], 'country'];
  let paint = base, filter = layoutFilter;
  const GE = () => ({ layers: {
    has: () => true, getPaint: () => paint, setPaint: (_id, _property, value) => { paint = value; },
    getFilter: () => filter, setFilter: (_id, value) => { filter = value; },
  }, render: { canvas: () => ({clientWidth: 1400, clientHeight: 800}) }, camera: {zoomRange: () => [0, 19]} });
  return {GE, get paint(){ return paint; }, get filter(){ return filter; }, set filter(value){ filter = value; }, layoutFilter};
}

function paintEvaluator(paint){
  const result = createPropertyExpression(paint, 'layers[0].paint.text-opacity', latest.paint_symbol['text-opacity']);
  assert.equal(result.result, 'success', JSON.stringify(result.value));
  return (zoom, properties) => result.value.evaluate({zoom}, {properties});
}

test('region names lose opacity over fractional zoom, and zooming out restores it', () => {
  const big = [0, 0, 40, 40], small = [0, 0, 0.5, 0.5];
  const {GE, paint} = (() => {
    const layer = mapLayer();
    CE.applyNameFade(layer.GE, 'test-country', ['get', 'name'], [{key:'big',box:big}, {key:'small',box:small}, {key:'unknown',box:null}]);
    return layer;
  })();
  const alpha = paintEvaluator(paint);
  const zoom = -Math.log2(CE.viewShare(big, 0, 1400, 800));
  const read = (z) => alpha(z, {name:'big'});
  assert.equal(read(zoom - 1), 1);
  assert.ok(read(zoom - 0.5) > read(zoom - 0.25));
  assert.ok(read(zoom - 0.25) > 0);
  assert.equal(read(zoom), 0);
  assert.equal(read(zoom + 1), 0);
  assert.equal(read(zoom - 1), 1, 'the same paint recovers on zoom-out');
  assert.equal(alpha(zoom + 1, {name:'small'}), 1);
  assert.equal(alpha(19, {name:'unknown'}), 1, 'a point without an extent stays governed by its own layer');
});

test('a historical polygon supplies its own extent and preserves the layer opacity', () => {
  const layer = mapLayer(0.8);
  CE.applyNameFade(layer.GE, 'test-historical-regions');
  const alpha = paintEvaluator(layer.paint);
  const large = {name:'larger region', ...CE.labelDimensions([100, 20, 140, 52])};
  const small = {name:'smaller region', ...CE.labelDimensions([100, 20, 101, 21])};
  assert.equal(alpha(1, large), 0.8);
  assert.ok(alpha(3.4, large) > alpha(3.8, large));
  assert.equal(alpha(7, large), 0);
  assert.equal(alpha(7, small), 0.8);
  assert.equal(alpha(19, {}), 0.8);
});

test('name filtering lets the ordinary layer and pin rules work with the fade', () => {
  const layer = mapLayer(), items = [{key:'large',box:[0,0,40,40]}, {key:'small',box:[0,0,0.5,0.5]}];
  CE.applyNameFade(layer.GE, 'test-place', ['get', 'name'], items);
  const sizeFilter = featureFilter(layer.filter, 'layers[0].filter').filter;
  assert.equal(sizeFilter({zoom:3}, {properties:{class:'country',name:'large'}}), true);
  assert.equal(sizeFilter({zoom:8}, {properties:{class:'country',name:'large'}}), false);
  assert.equal(sizeFilter({zoom:8}, {properties:{class:'country',name:'small'}}), true);
  assert.equal(sizeFilter({zoom:3}, {properties:{class:'city',name:'other'}}), false);
  CE.suppressNameFade(layer.GE, 'test-place', ['small']);
  CE.applyNameFade(layer.GE, 'test-place', ['get', 'name'], items);
  assert.equal(paintEvaluator(layer.paint)(3, {name:'small'}), 0);
  assert.equal(paintEvaluator(layer.paint)(1, {name:'large'}), 1);
  CE.suppressNameFade(layer.GE, 'test-place', []);
  assert.equal(paintEvaluator(layer.paint)(3, {name:'small'}), 1);
  assert.equal(paintEvaluator(layer.paint)(8, {name:'large'}), 0);
  const next = ['==', ['get', 'class'], 'state'];
  layer.filter = next;
  CE.applyNameFade(layer.GE, 'test-place', ['get', 'name'], items);
  assert.deepEqual(layer.filter[1], next, 'a changed clock filter is the new base');
  CE.applyNameFade(layer.GE, 'test-place', ['get', 'name'], []);
  assert.deepEqual(layer.filter, next);
});

test('modern and historical area labels use the shared fade', () => {
  const src = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  for(const f of ['place-labels.js', 'time-borders.js', 'time-admin1.js']) assert.match(src(f), /CE\.applyNameFade\(/);
});
