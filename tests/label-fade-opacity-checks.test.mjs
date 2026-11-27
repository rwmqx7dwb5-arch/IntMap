// The two rules, as pure functions — no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('gone(): a region name goes once the region fills the view — one rule for every layer', () => {
  const big = [0, 0, 40, 40], small = [0, 0, 0.5, 0.5];
  const g = CE.gone([{ key: 'big', box: big }, { key: 'small', box: small }, { key: 'none', box: null }], 5, 1400, 800);
  assert.ok(g.has('big'));
  assert.ok(!g.has('small'));
  assert.ok(!g.has('none'));
  const out = CE.gone([{ key: 'big', box: big }], 2, 1400, 800);
  assert.equal(out.size, 0, 'zoomed out, the name stays');
});

test('applyGone(): writes the filter, restores the base, and adopts a filter someone else wrote', () => {
  let filter = ['==', ['get', 'class'], 'country'];
  const GE = () => ({ layers: { has: () => true, getFilter: () => filter, setFilter: (_, f) => { filter = f; } } });
  const st = {}, base = filter;
  CE.applyGone(GE, st, 'L', ['get', 'name'], new Set(['France']));
  assert.deepEqual(filter, ['all', base, ['!', ['in', ['get', 'name'], ['literal', ['France']]]]]);
  CE.applyGone(GE, st, 'L', ['get', 'name'], new Set());
  assert.deepEqual(filter, base);
  const other = ['==', ['get', 'class'], 'state'];
  filter = other;   // another module rewrote it
  CE.applyGone(GE, st, 'L', ['get', 'name'], new Set(['X']));
  assert.deepEqual(filter, ['all', other, ['!', ['in', ['get', 'name'], ['literal', ['X']]]]]);
});

test('every region-name layer uses the shared rule, none keeps its own copy', () => {
  const src = (f) => fs.readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
  for (const f of ['place-labels.js', 'time-borders.js']) assert.ok(/IntMapCountryExtent|CE\.gone|CE\.applyGone/.test(src(f)));
  assert.ok(!/NAME_GONE_SHARE\)\s*(gone|out)/.test(src('place-labels.js')));
});
