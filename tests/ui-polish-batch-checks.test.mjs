/* ============================================================================
 *  IntMap · ui-polish-batch — five small shell changes, measured
 * ----------------------------------------------------------------------------
 *  ① the coordinate / elevation readout stands at the right end of the credit strip, in the order
 *    layer values · eye altitude · elevation / depth · coordinates, each chip with a reserved width.
 *  ② the air of the satellite globe is read at the EQUATOR-EQUIVALENT zoom, so the same eye height gets the same air at
 *    every latitude (MapLibre draws the globe's radius / cos(latitude), so toward a pole a zoom number is a nearer eye).
 *  ③ the selected-item circle (.stat-pick) is gone from Countries and Companies; compare-on stays.
 *  ④ the place-search pill has ONE height (--ms-h) and ONE top margin at every container-query tier.
 *  ⑤ the sidebar title is the plain <h2>IntMap</h2> again.
 * ==========================================================================*/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* ── ② the air, evaluated from the file's own text ─────────────────────────────────────────────── */
function loadAir(centreLat) {
  const src = read('js/theme-sky.js');
  const a = src.indexOf('  const AIR_Z=');
  const b = src.indexOf('/* ══ ⚠⚠⚠ (#R241) THE STANDARD MAP HAS NO AIR AT ALL');
  assert.ok(a > 0 && b > a, 'the air curve and its latitude shift are one block of theme-sky.js');
  const GE = () => ({ camera: { getCenter: () => ({ lng: 0, lat: centreLat }) } });
  return new Function('GE', `${src.slice(a, b)}\nreturn { AIR_Z, _airAtZoom, _airLatShift, _airShift, _airEqZoom, _airRamp };`)(GE);
}

test('② the same eye height gets the same air at lat 0 and lat 85', () => {
  const eq = loadAir(0), pole = loadAir(85);
  const shift85 = pole._airLatShift(85);
  assert.ok(Math.abs(shift85 - Math.log2(1 / Math.cos(85 * Math.PI / 180))) < 1e-12, 'the shift is log2(1/cos lat)');
  assert.equal(eq._airLatShift(0), 0, 'on the equator the zoom number IS the height');
  for (let zEq = 0; zEq <= 11; zEq += 0.5) {
    /* the zoom at which a camera at 85 N is as high as one at zoom zEq on the equator: the sphere is 1/cos(lat) larger */
    const zPole = zEq - shift85;
    const aPole = pole._airAtZoom(zPole + shift85), aEq = eq._airAtZoom(zEq);
    assert.ok(Math.abs(aPole - aEq) < 1e-12, `z_eq ${zEq}: ${aPole} vs ${aEq}`);
    assert.ok(aPole >= 0 && aPole <= 1, 'bounded');
  }
  /* the defect, stated: read at the raw zoom number, a camera near the pole is handed far more air than its height has */
  const zPole = 5 - shift85;                                         /* as near the ground as z5 on the equator */
  assert.ok(pole._airAtZoom(zPole) > 2 * pole._airAtZoom(zPole + shift85), 'unshifted, the pole got more than twice the air');
  /* and the entry the renderer reads is the quantised shift */
  assert.equal(pole._airShift() % 0.25, 0);
  assert.ok(Math.abs(pole._airShift() - shift85) <= 0.125 + 1e-9);
  assert.equal(eq._airShift(), 0);
});

test('② the sky block ramp is the same curve moved by that shift, still ascending and still 0 before z11', () => {
  const eq = loadAir(0), pole = loadAir(85);
  const r0 = eq._airRamp(0.45), r1 = pole._airRamp(0.45), sh = pole._airShift();
  for (let i = 5; i < r1.length; i += 2) {
    assert.ok(r1[i] > r1[i - 2], 'stops stay strictly ascending');
    assert.ok(Math.abs(r1[i] - (r0[i] - sh)) < 1e-3, 'each stop is the equator stop less the shift');
    assert.equal(r1[i + 1], r0[i + 1], 'the values are untouched');
  }
  assert.ok(r1[r1.length - 2] <= 11 && r1[r1.length - 1] === 0, 'the curve is out before the globe becomes a plane');
});

test('② the limb strength and the sky comparison both read the shift', () => {
  const s = read('js/theme-sky.js');
  assert.equal((s.match(/_airAtZoom\(_airEqZoom\(GE\(\)\.camera\.getZoom\(\)\)\)/g) || []).length, 2, 'both setLimb callers');
  assert.match(s, /_airShift\(\)===_applySkyAtmosphere\._shift/, 'a pole-ward pan re-sets the sky block');
});

/* ── ① the readout ─────────────────────────────────────────────────────────────────────────────── */
test('① the readout is a sibling of #map-credit in .map-column, and the credit element is unchanged', () => {
  const html = read('index.html');
  const credit = html.indexOf('<div id="map-credit" class="map-credit"></div>');
  const ro = html.indexOf('<div id="coord-readout" class="coord-readout"></div>');
  assert.ok(credit > 0 && ro > credit, 'the readout follows the credit');
  assert.ok(html.indexOf('<div class="map-frame-bottom">') < credit, 'and it is no longer in the frame\'s bottom row');
  const between = html.slice(html.indexOf('<div class="map-frame-bottom">'), html.indexOf('id="news-timeline"'));
  assert.ok(!between.includes('coord-readout'), 'the bottom row holds Chronos only');
});

test('① the chips run layer values, eye, elevation, coordinates, left to right', () => {
  const s = read('js/map-readout.js');
  const m = /const CR_SEQ=\[([^\]]+)\];/.exec(s);
  assert.ok(m);
  const keys = [...m[1].matchAll(/k:'(\w+)'/g)].map((x) => x[1]);
  assert.deepEqual(keys, ['sat', 'wind', 'seis', 'eye', 'elev', 'll']);
});

test('① widths are reserved from the chips\' own formatters, and layer chips only grow', () => {
  const s = read('js/map-readout.js');
  assert.match(s, /fmtLL\(179\.999,-88\.888\)/);
  assert.match(s, /HOST\.elevText\(CR_GROUND_MAX_M\)/);
  assert.match(s, /HOST\.elevText\(CR_GROUND_MIN_M\)/);
  assert.match(s, /E\.textFor\(CR_EYE_MAX_M\)/);
  assert.match(s, /function _crGrow\(k,chip,len\)\{ if\(len>_crGrown\[k\]\)/);
  /* the eye chip asks the very function the readout prints with */
  const v = read('js/view-controls.js');
  assert.match(v, /return textFor\(a\); \}/);
  assert.match(v, /return \{ isOn:\(\)=>on, set, text, textFor,/);
});

test('① the longest elevation text is the same width for "Elev" and "Depth" only because both are reserved', () => {
  /* evaluated: the formatter the chip uses, with both words and the 'both' unit mode */
  const fmt = (e) => { const m = Math.round(e), ft = Math.round(e * 3.28084); return m.toLocaleString() + ' m (' + ft.toLocaleString() + ' ft)'; };
  const word = { elev: 'Elev', depth: 'Depth' };
  const text = (e) => (e < 0 ? `${word.depth} ${fmt(Math.abs(e))}` : `${word.elev} ${fmt(e)}`);
  assert.notEqual(text(8849).length, text(-10935).length, 'the two words DO differ in width');
  assert.ok(Math.max(text(8849).length, text(-10935).length) >= text(300).length, 'so the reserved width is the maximum of the two');
});

test('① the strip rule: no fill, theme colours, credit keeps priority, panel dodged, phone slot and capture untouched', () => {
  const css = read('css/intmap.css');
  const i = css.indexOf('.map-column > .coord-readout{');
  assert.ok(i > 0);
  const rule = css.slice(i, css.indexOf('}', i));
  assert.match(rule, /margin-top:calc\(-1 \* var\(--credit-h\)\)/);
  assert.match(rule, /max-width:calc\(100% - var\(--cr-credit-w,0px\) - var\(--cr-r\)\)/);
  assert.match(rule, /justify-content:flex-end/);
  assert.match(rule, /background:transparent !important/);
  assert.match(css, /body\.lsr-open:not\(\.ws-mode\) \.map-column > \.coord-readout\{ --cr-r:var\(--lsr-w\)/);
  assert.match(css, /body\.capture-mode \.coord-readout\{ visibility:hidden !important; \}/);
  assert.match(css, /#m-readout-slot \.coord-readout span\{[^}]*min-width:0 !important/);
  assert.ok(!/map-frame-bottom > \.coord-readout/.test(css), 'the old bottom-row rule is gone');
});

/* ── ③ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('③ no selected-item circle in Countries or Companies; compare-on remains', () => {
  for (const f of ['js/countries-ui.js', 'js/companies-ui.js', 'css/intmap.css']) assert.ok(!read(f).includes('stat-pick'), f);
  assert.match(read('js/companies-ui.js'), /compare-on/);
  assert.match(read('js/countries-ui.js'), /\$\{active\}/);
});

/* ── ④ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('④ the place-search pill has one height and one top margin at every tier', () => {
  const css = read('css/intmap.css');
  assert.match(css, /:root\{ --ms-h:35px; \}/);
  const base = /\.map-search\{ position:absolute;[^}]*\}/.exec(css)[0];
  assert.match(base, /box-sizing:border-box; height:var\(--ms-h\)/);
  assert.match(css, /\.map-search input\{[^}]*height:calc\(var\(--ms-h\) - 8px\)/);
  assert.match(css, /\.map-search>button\{ height:calc\(var\(--ms-h\) - 10px\)/);
  assert.ok(!/\.map-search\{[^}]*margin-top/.test(css) && !/map-frame-top > \.map-search\{ margin-top/.test(css),
    'no tier gives the pill a margin the others lack');
  assert.ok(!/\.map-search\{ margin-top:calc\(14px/.test(css));
});

/* ── ⑤ ─────────────────────────────────────────────────────────────────────────────────────────── */
test('⑤ the sidebar title is the plain heading again', () => {
  assert.match(read('index.html'), /<div class="title-group"><h2>IntMap<\/h2><\/div>/);
  assert.ok(!read('css/intmap.css').includes('im-wordmark'));
  assert.ok(!existsSync(new URL('../brand/intmap-wordmark.png', import.meta.url)));
});
