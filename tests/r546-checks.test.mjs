/* ============================================================================
 *  R546 — USGS ShakeMap: the ground-motion field of one earthquake
 * ----------------------------------------------------------------------------
 *  ⚠ THESE CHECKS EVALUATE THE SHIPPED MODULE (#R505). js/shakemap.js is run in
 *  a stub window with a stub renderer and a stub `fetch`, and every claim below
 *  is measured off what the module actually did — the source is never read for
 *  spellings (#R488/#R533: a test that pins a spelling keeps passing after the
 *  thing it was guarding died).
 *
 *  The fixture is a REAL, UNEDITED USGS product: tests/fixtures/shakemap-napa.json
 *  holds the three ShakeMap products of nc72282711 (2014 South Napa, M6.0) with
 *  their file lists, plus the MMI contour file, the MMI low-res CoverageJSON, the
 *  PGA contour file and the PGA coverage's parameter block. Public domain (USGS).
 * ==========================================================================*/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FIX = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/shakemap-napa.json'), 'utf8'));
const SRC = fs.readFileSync(path.join(ROOT, 'js/shakemap.js'), 'utf8');

/* ── the stub world ──────────────────────────────────────────────────────── */
function canvasStub(rec) {
  return {
    width: 0, height: 0,
    getContext() {
      return {
        createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (im) => { rec.image = im; }
      };
    },
    toDataURL: () => 'data:image/png;base64,stub'
  };
}

function makeWindow(rec) {
  const layers = rec.layers = { added: [], sources: {}, styles: {} };
  const GEO = {
    layers: {
      has: id => Object.prototype.hasOwnProperty.call(layers.styles, id),
      hasSource: id => Object.prototype.hasOwnProperty.call(layers.sources, id),
      addSource: (id, def) => { layers.sources[id] = def; },
      setSourceData: (id, d) => { layers.sources[id].data = d; },
      removeSource: id => { delete layers.sources[id]; },
      add: (def, before) => { layers.styles[def.id] = def; layers.added.push({ id: def.id, before: before || null }); },
      remove: id => { delete layers.styles[id]; },
      setPaint: (id, k, v) => { if (layers.styles[id]) layers.styles[id].paint[k] = v; },
      getLayout: () => 'visible'
    }
  };
  const win = {
    IntMapModules: {},
    IntMapGeoEngine: GEO,
    IntMapLang: {
      pickArgs: () => function () { return Array.prototype.slice.call(arguments); },
      pick: () => ({ arr: a => a[0] })
    },
    IntMapSafe: { html: s => String(s) },
    dispatchEvent: () => true,
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    URL: { createObjectURL: () => 'blob:stub', revokeObjectURL: () => { } }
  };
  return win;
}

/* the one product the fixture's own preference points at */
const PROD = FIX.products.reduce((b, p) => (!b || +p.preferredWeight > +b.preferredWeight) ? p : b, null);
const U = k => PROD.contents[k].url;

function load(rec) {
  const win = makeWindow(rec);
  const g = globalThis;
  g.window = win;
  g.document = { createElement: () => canvasStub(rec) };
  g.URL = win.URL;
  g.fetch = async (url) => {
    const body = ({
      [U('download/cont_mmi.json')]: FIX.contMmi,
      [U('download/coverage_mmi_low_res.covjson')]: FIX.covMmi,
      [U('download/cont_pga.json')]: FIX.contPga
    })[url];
    if (url.indexOf('/detail/') >= 0) return { ok: true, json: async () => ({ properties: { place: 'South Napa', mag: 6, time: 1, products: { shakemap: FIX.products } } }) };
    if (url === U('download/coverage_pga_low_res.covjson')) {
      /* the PGA grid: the fixture keeps its PARAMETER block (the ln unit) and the
         test supplies a tiny range of its own, because the point being measured
         is the unit, not USGS's arithmetic */
      const d = FIX.covMmi.domain;
      return { ok: true, json: async () => ({ type: 'Coverage', domain: { domainType: 'Grid', axes: { x: { start: d.axes.x.start, stop: d.axes.x.stop, num: 2 }, y: { start: d.axes.y.start, stop: d.axes.y.stop, num: 2 } } }, parameters: FIX.pgaParameters, ranges: { [Object.keys(FIX.pgaParameters)[0]]: { type: 'NdArray', dataType: 'float', axisNames: ['y', 'x'], shape: [2, 2], values: [-0.65, -0.65, -0.65, -0.65] } } }) };
    }
    if (!body) throw new Error('unstubbed fetch: ' + url);
    return { ok: true, json: async () => body };
  };
  new Function('window', SRC)(win);
  return win.IntMapModules.shakeMap({ lang: 'en' });
}

/* ── ① the product USGS itself prefers, not the first one in the array ──────
   The feed happens to be sorted today; `preferredWeight` is the statement. */
test('R546 ① the preferred ShakeMap product is chosen by preferredWeight, not by position', () => {
  const rec = {}, M = load(rec);
  assert.ok(FIX.products.length >= 2, 'fixture must carry more than one product to make this measurable');
  const shuffled = FIX.products.slice().reverse();
  const best = M._preferred(shuffled);
  const top = FIX.products.reduce((b, p) => (!b || +p.preferredWeight > +b.preferredWeight) ? p : b, null);
  assert.equal(best.code, top.code);
  assert.equal(+best.preferredWeight, +top.preferredWeight);
  assert.notEqual(shuffled[0].preferredWeight, best.preferredWeight, 'a reversed array must not still hand back [0]');
});

/* ── ② the roster is DISCOVERED, and the byte-identical alias collapses ─────
   `cont_mi.json` and `cont_mmi.json` are the same bytes and only one of them has
   a grid. Two identical entries in a picker is the defect this guards. */
test('R546 ② the metric roster comes out of the product, drops the gridless byte-identical alias, and opens on intensity', () => {
  const rec = {}, M = load(rec);
  const keys = M._roster(PROD).map(m => m.key);
  const files = Object.keys(PROD.contents).filter(k => /^download\/cont_[a-z0-9]+\.json$/.test(k));
  assert.ok(files.length > keys.length, 'the product must contain an alias for this to measure anything');
  assert.ok(keys.includes('mmi'), 'the intensity metric must survive');
  assert.ok(!keys.includes('mi'), 'the alias with no coverage grid must not appear twice in the picker');
  assert.equal(keys[0], 'mmi', 'the measure the product lists first, and the only one that can be painted and sampled, opens first');
  keys.forEach(k => assert.ok(PROD.contents['download/cont_' + k + '.json'], 'every rostered metric is a file the product really has: ' + k));
});

/* ── ③ ⚠ THE UNIT TRAP. The grid is ln(g); the contours are %g. ─────────────*/
test('R546 ③ a grid value is converted by the symbol the product declares, and an unknown symbol is refused rather than guessed', () => {
  const rec = {}, M = load(rec);
  const sym = FIX.pgaParameters[Object.keys(FIX.pgaParameters)[0]].unit.symbol.value;
  assert.match(sym, /^ln\(/, 'the fixture must still be the logarithmic case');
  const c = M._toContourUnit(sym);
  assert.equal(c.ok, true);
  assert.ok(Math.abs(c.f(-0.65) - Math.exp(-0.65) * 100) < 1e-9, 'ln(g) → %g');
  assert.ok(c.f(-0.65) > 0, 'the reported number may never be the negative logarithm');
  const mmi = M._toContourUnit(undefined);
  assert.equal(mmi.ok, true);
  assert.equal(mmi.f(7.2), 7.2, 'MMI is a scale and must pass through untouched');
  assert.equal(M._toContourUnit('furlongs per fortnight').ok, false, 'an unrecognised symbol is refused, not applied');
});

/* ── ④ the grid answers for real places, and refuses outside its footprint ──*/
test('R546 ④ the intensity grid samples the real Napa field, and a point outside the footprint is null rather than zero', () => {
  const rec = {}, M = load(rec);
  const g = M._readCoverage(FIX.covMmi);
  assert.equal(g.param, 'MMI');
  const napa = g.at(-122.2869, 38.2975), sf = g.at(-122.4194, 37.7749), sac = g.at(-121.4944, 38.5816);
  [napa, sf, sac].forEach(v => assert.ok(typeof v === 'number' && isFinite(v)));
  assert.ok(napa > 6.5, 'Napa itself was severely shaken (measured 7.2)');
  assert.ok(sf < 5 && sac < 5, 'the cities an hour away were not');
  assert.ok(napa - sf > 2, 'the whole point of a field is that these two are different numbers');
  assert.equal(g.at(0, 0), null, 'outside the footprint there is no value — and 0 would read as "no shaking"');
  assert.equal(g.at(-140, 38), null);
});

/* ── ⑤ the surface is resampled into Mercator, not handed over lat-linear ───
   Measured on the PIXELS: a step in the field must appear in the row Mercator
   puts it in. The lat-linear row is computed too, and the two must differ —
   otherwise this test could not tell the bug from the fix. */
test('R546 ⑤ the painted field is placed in Mercator rows, and the lat-linear placement it replaces is measurably different', () => {
  const rec = {}, M = load(rec);
  const south = 20, north = 60, stepLat = 40 + (10 / 3);   /* an asymmetric latitude inside the box */
  const ny = 401, nx = 4;
  const vals = [];
  for (let j = 0; j < ny; j++) { const lat = south + (north - south) * j / (ny - 1); for (let i = 0; i < nx; i++) vals.push(lat <= stepLat ? 9 : 0); }
  const grid = M._readCoverage({
    domain: { domainType: 'Grid', axes: { x: { start: 0, stop: 4, num: nx }, y: { start: south, stop: north, num: ny } } },
    parameters: { MMI: { description: { en: ['t'] }, preferredPalette: { colors: ['rgb(255,255,255)', 'rgb(255,0,0)'], extent: [0, 10], interpolation: 'linear' } } },
    ranges: { MMI: { type: 'NdArray', values: vals } }
  });
  const pal = M._parsePalette(grid.palette);
  const out = M._render(grid, pal, 4, 4.0001);
  assert.ok(out && rec.image, 'the renderer must have produced pixels');
  const W = rec.image.width, H = rec.image.height, px = rec.image.data;
  let firstOpaque = -1;
  for (let r = 0; r < H && firstOpaque < 0; r++) if (px[(r * W) * 4 + 3] > 128) firstOpaque = r;
  assert.ok(firstOpaque > 0, 'the step must be visible in the image');
  const yN = M._mercY(north), yS = M._mercY(south);
  const rowMerc = (M._mercY(stepLat) - yN) / (yS - yN) * H;
  const rowLinear = (north - stepLat) / (north - south) * H;
  assert.ok(Math.abs(rowMerc - rowLinear) > 4, 'the two placements must differ, or this check proves nothing');
  assert.ok(Math.abs(firstOpaque - rowMerc) <= 2, 'the step lands where Mercator puts it (got ' + firstOpaque + ', mercator ' + rowMerc.toFixed(1) + ', lat-linear ' + rowLinear.toFixed(1) + ')');
  const c = out.coords;
  assert.deepEqual(c, [[0, north], [4, north], [4, south], [0, south]], 'the four corners are the grid\'s own box');
});

/* ── ⑥ the alpha ends where USGS's own lowest contour ends ──────────────────*/
test('R546 ⑥ nothing is painted below the lowest level USGS chose to draw', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711');
  const levels = M.state().levels;
  assert.ok(levels.length > 3);
  const lowest = levels[0];
  assert.equal(lowest, Math.min.apply(null, levels));
  const g = M._readCoverage(FIX.covMmi);
  /* the footprint reaches out into far field that is BELOW the lowest drawn
     contour — that ground is left unpainted, which is why the surface is not a
     coloured rectangle with corners */
  let lo = Infinity; for (let i = 0; i < g.v.length; i++) if (g.v[i] != null && g.v[i] < lo) lo = g.v[i];
  assert.ok(lo < lowest, 'the grid must reach below the lowest contour (min ' + lo + ' vs ' + lowest + ')');
  /* and the paint really stops there: the rendered surface has both fully
     transparent and fully opaque pixels, i.e. it is NOT the coloured rectangle
     USGS's own JPEG draws */
  const pal = M._parsePalette(g.palette);
  const step = levels[1] - levels[0];
  const out = M._render(g, pal, lowest - step, lowest);
  assert.ok(out && rec.image, 'the renderer must have produced pixels');
  const px = rec.image.data;
  let faded = 0, solid = 0;
  for (let i = 3; i < px.length; i += 4) { if (px[i] > 0 && px[i] < 255) faded++; else if (px[i] === 255) solid++; }
  assert.ok(solid > 0, 'the shaken ground is painted');
  assert.ok(faded > 0, 'and the far field fades out instead of ending in a hard rectangle edge');
  /* the rule itself: ground BELOW the fade point carries no paint at all. Napa's
     own grid is clipped close to its lowest contour (minimum 2.2 against a lowest
     drawn level of 2.5, and only 0.2 % of its cells below that line), so the ZERO
     end of the ramp is measured on a grid that reaches further down. Same palette,
     same fade points, same arithmetic. */
  const wide = M._readCoverage({
    domain: { domainType: 'Grid', axes: { x: { start: 0, stop: 1, num: 2 }, y: { start: 0, stop: 1, num: 2 } } },
    parameters: { MMI: { description: { en: ['t'] }, preferredPalette: g.palette } },
    ranges: { MMI: { type: 'NdArray', values: [0, 0, 0, 0] } }
  });
  M._render(wide, pal, lowest - step, lowest);
  const zp = rec.image.data;
  let clear = 0; for (let i = 3; i < zp.length; i += 4) if (zp[i] === 0) clear++;
  assert.equal(clear, zp.length / 4, 'every pixel below the lowest drawn contour is fully transparent');
});

/* ── ⑦ a metric USGS ships no palette for gets LINES AND NO SURFACE ─────────
   The rule is upstream's, so it has to be measured against a metric that really
   lacks `preferredPalette` rather than against a name written here. */
test('R546 ⑦ the field is painted only where the product ships a colour scale, and the contours are drawn either way', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  let st = M.state();
  assert.equal(st.open, true);
  assert.equal(st.metric, 'mmi');
  assert.equal(st.painted, true, 'MMI ships preferredPalette, so the surface is painted');
  assert.ok(rec.layers.styles['shk-cont'], 'the contour lines are drawn');
  assert.ok(rec.layers.styles['shk-field'], 'the surface layer exists');
  assert.equal(rec.layers.sources['shk-cont-src'].data.features.length, FIX.contMmi.features.length);
  assert.equal(rec.layers.sources['shk-cont-src'].attribution, 'USGS ShakeMap');

  await M.open('nc72282711', 'pga');
  st = M.state();
  assert.equal(st.metric, 'pga');
  assert.equal(st.painted, false, 'PGA ships no palette — lines only, and `painted` must say so');
  assert.ok(!rec.layers.styles['shk-field'], 'the previous metric\'s surface must not be left lying under the new lines');
  assert.ok(rec.layers.styles['shk-cont'], 'the contours are still drawn for a metric with no palette');
  /* ⚠ and the number it reports is %g, not the ln the grid holds */
  const v = M.valueAt(-122.2869, 38.2975);
  assert.ok(v > 0, 'a reported PGA may never be negative (got ' + v + ')');
  assert.ok(Math.abs(v - Math.exp(-0.65) * 100) < 1e-6);

  M.close();
  assert.equal(M.state().open, false);
  assert.ok(!rec.layers.styles['shk-cont'] && !rec.layers.styles['shk-field'], 'close leaves nothing on the map');
  assert.ok(!rec.layers.sources['shk-cont-src'] && !rec.layers.sources['shk-field-src']);
});

/* ── ⑧ the colours on the map are USGS's, per level ─────────────────────────*/
test('R546 ⑧ every contour level carries its own colour from the product, and the legend hands them through unchanged', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  const leg = M.legend();
  assert.ok(leg.length >= 5);
  const fromFile = {};
  FIX.contMmi.features.forEach(f => { fromFile[+f.properties.value] = f.properties.color; });
  leg.forEach(r => {
    assert.equal(r.color, fromFile[r.value], 'level ' + r.value + ' must wear the colour the file gives it');
    assert.match(r.color, /^#[0-9a-fA-F]{6}$/);
  });
  const asc = leg.map(r => r.value);
  assert.deepEqual(asc, asc.slice().sort((a, b) => a - b));
});

/* ── ⑨ exposure counts by SAMPLING, and says what its number is made of ─────*/
test('R546 ⑨ exposure counts the cities the intensity grid puts above the cut, and nothing outside the footprint', async () => {
  const rec = {}, M = load(rec);
  const win = globalThis.window;
  /* [type, terms, lng, lat, en, ja, pop, iso2] — the gazetteer's own row shape */
  win.IntMapGazetteer = {
    warm: async () => true,
    world: () => [
      ['c', '', -122.2869, 38.2975, 'Napa', 'ナパ', 79000, 'US'],           /* MMI ≈ 7.2 */
      ['c', '', -122.4194, 37.7749, 'San Francisco', 'サンフランシスコ', 864000, 'US'], /* ≈ 3.5 */
      ['c', '', 139.6917, 35.6895, 'Tokyo', '東京', 13500000, 'JP']          /* outside the footprint */
    ]
  };
  await M.open('nc72282711', 'mmi');
  const hi = await M.exposure(6);
  assert.equal(hi.ok, true);
  assert.equal(hi.cities, 1, 'only the city the grid puts at or above VI');
  assert.equal(hi.population, 79000);
  assert.equal(hi.top[0].name, 'Napa');
  assert.ok(hi.top[0].mmi >= 6);

  const lo = await M.exposure(3);
  assert.equal(lo.cities, 2, 'lowering the cut lets the second city in');
  assert.equal(lo.population, 79000 + 864000);
  assert.ok(!lo.top.some(c => c.name === 'Tokyo'), 'a city outside the ShakeMap footprint is never counted');
  assert.ok(lo.top[0].mmi >= lo.top[1].mmi, 'strongest shaking first');

  /* ⚠ the number must arrive with what it is made of, in words */
  assert.match(hi.basis, /cities/i);
  assert.match(hi.basis, /not a population raster/i);
  assert.ok(M.basisNote().length > 40, 'and a sentence the UI can print');
});

/* ── ⑫ ⚠ the image source is handed ONLY what an image source takes ─────────
   Measured in a real browser this round: an `attribution` key alongside `url` and
   `coordinates` makes maplibre's source validation reject the call, and because
   the draw path is defensive the failure is SILENT — contours drawn, legend up,
   `open:true`, and no intensity surface at all. The stub renderer here accepts
   anything, so the guard has to be the shape of the definition itself. */
test('R546 ⑫ the image source definition carries only the properties an image source has', async () => {
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  const def = rec.layers.sources['shk-field-src'];
  assert.ok(def, 'the surface source must have been created');
  assert.deepEqual(Object.keys(def).sort(), ['coordinates', 'type', 'url']);
  assert.equal(def.type, 'image');
  assert.equal(def.coordinates.length, 4);
  /* the credit still reaches the map — through the source that can carry it */
  assert.equal(rec.layers.sources['shk-cont-src'].attribution, 'USGS ShakeMap');
});

/* ── ⑩ the module is load-on-demand, and nothing eager pulls it in ──────────*/
test('R546 ⑩ ShakeMap is lazy: the shell does not carry it', () => {
  /* ⚠ src/main.js CARRIES BOTH LISTS, and only one of them is the boot cost.
     `MODULE_FACTORIES` is what the shell instantiates at boot — `check:perf` pins
     its size to the module — while `LAZY_FACTORIES` is the ledger of names the
     loader may be asked for later, and #R209/#R304/#R400/#R408 each fail if a
     lazy module is missing from it. An earlier form of this check simply looked
     for the name anywhere in the file, which would have called the correct
     registration a defect. */
  const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
  const listOf = n => { const m = new RegExp('const ' + n + '\\s*=\\s*\\[([^\\]]*)\\]').exec(main); return m ? m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')) : null; };
  const eager = listOf('MODULE_FACTORIES'), lazy = listOf('LAZY_FACTORIES');
  assert.ok(eager && eager.length > 10 && lazy && lazy.length > 10, 'both lists must be readable');
  assert.ok(!eager.includes('shakeMap'), 'js/shakemap.js must not join the eager module list (check:perf counts it)');
  assert.ok(lazy.includes('shakeMap'), 'and it must be in the lazy ledger the loader is checked against');
  const loader = fs.readFileSync(path.join(ROOT, 'js/lazy-modules.js'), 'utf8');
  assert.ok(loader.includes('./shakemap.js'), 'it has to be reachable through IntMapLazy, or nothing can open it');
});

/* ── ⑪ the capability is declared everywhere the audits look ────────────────
   The two Atlas gates check their own halves; this checks the half that binds
   the capability to THIS module — the lazy name and the drawn source. */
test('R546 ⑪ the capability points at the module that exists and at the source it really draws', async () => {
  const caps = fs.readFileSync(path.join(ROOT, 'js/atlas-capabilities.js'), 'utf8');
  const row = caps.split('\n').filter(l => l.includes("'map.shakemap'"))[0];
  assert.ok(row, 'the registry must carry the capability');
  assert.ok(row.includes("'shakeMap'"), 'its lazy column must name the module lazy-modules.js can load');
  const rec = {}, M = load(rec);
  await M.open('nc72282711', 'mmi');
  const drawn = Object.keys(rec.layers.sources);
  assert.ok(caps.includes("sourceFeatureCount('shk-cont-src')"), 'the paint observer must count a source the module really creates');
  assert.ok(drawn.includes('shk-cont-src'), 'and the module really creates it');
  assert.deepEqual(M.layerIds().slice().sort(), ['shk-cont', 'shk-cont-lbl', 'shk-field'].sort());
});
