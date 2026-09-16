/* ============================================================================
 *  #R749 · 格子は計算できたが、見ることができなかった — the raster pipeline, end to end
 * ----------------------------------------------------------------------------
 *  What this round claimed, and therefore what has to stay true:
 *
 *    ① a grid goes on the map through the engine's OWN dynamic image — not a second addSource
 *    ② the rows are looked up from the engine, never stepped linearly through latitude
 *    ③ a band with no scale in it is refused BY NAME, not painted with an invented one
 *    ④ the legend the list prints is the one the picture was painted from, with measured counts
 *    ⑤ removing a drawn grid takes the picture off the map
 *    ⑥ colouring a grid by an attribute is refused by name, and does not clear its legend
 *    ⑦ every refusal classifyRaster can return has a sentence
 *    ⑧ 「描けた」 is what the renderer reported — a refusing renderer is not a success
 *    ⑨ a kernel whose bytes moved without its version moving is caught
 *    ⑩ a GeoTIFF leaves the import path as a GRID, before the feature machinery it has no use for
 *    ⑪ every refusal the two new grid readers can return has a sentence for the reader
 *    ⑫ a file read by js/gis-geotiff.js is accepted by js/gis-warp.js — the two shapes MEET
 *    ⑬ …and the warped grid reaches the map: read → reproject → paint, with no translation between
 *
 *  ⚠ ① ③ ⑧ ARE DEFECTS THIS REPOSITORY HAS MEASURED IN OTHER CLOTHES. #R739 measured draw()
 *  answering ok:true on the Globe renderer with nothing on the map. #R195 measured an image placed
 *  by four corners drifting 895 km in the middle of its box because its rows were stepped through
 *  latitude while the texture was interpolated in Mercator Y — ② is that defect asked about THIS
 *  painter. And ③ is 「誰も述べていない主張」: a colour ramp over a band whose values are all one
 *  number is a scale the data does not have.
 *
 *  ⚠ WHAT ② COMPARES AGAINST. Not the painter's own arithmetic — the reference is a renderer stub
 *  that answers imageRowLatitudes() with latitudes NO linear walk would produce, so a painter that
 *  ignored the call cannot accidentally agree with it. A check that fed it the linear answer would
 *  be measuring nothing, which is the shape [[intmap-prefilter-erred-inward-under-a-comment-saying-outward]]
 *  records: two readers of one wrong rule agree.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/* ══ the stub world ═══════════════════════════════════════════════════════════════════════════
   Same shape as tests/r738-gis-style-checks: the SHIPPED closure is evaluated against a renderer
   that records. ⚠ THE STUB IS NOT MORE CAPABLE THAN THE REAL ONE — it refuses what the real engine
   refuses and answers only what the real engine answers, because a stub that quietly fixes things
   repairs the bug on the way past ([[intmap-r671-lessons]]). */
function stubEl() {
  return { style: {}, value: '', innerHTML: '', type: '', multiple: false, textContent: '',
    addEventListener() { }, appendChild() { }, querySelector: () => null, querySelectorAll: () => [] };
}

/* A 2-D context that keeps the pixels, so what was painted can be read back. */
function stubCanvasCtx(W, H) {
  const store = { data: null };
  return {
    store,
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img) => { store.data = img; },
  };
}

function stubRenderer(opts) {
  const o = opts || {};
  const R = { sources: new Map(), layers: new Map(), images: new Map(), removedImages: [], fits: [], rowCalls: [] };
  R.api = {
    hasRenderer: () => true,
    camera: { fitBounds: (b) => { R.fits.push(b); } },
    events: { on() { }, once() { } },
    ready: () => true,
    layers: {
      addSource: (id, d) => { R.sources.set(id, d); },
      hasSource: (id) => R.sources.has(id),
      removeSource: (id) => { R.sources.delete(id); },
      has: (id) => R.layers.has(id),
      add: (d) => { R.layers.set(d.id, d); },
      remove: (id) => { R.layers.delete(id); },
      setPaint: () => { },
      /* ⚠ THE ROWS THIS STUB REPORTS ARE NOT A LINEAR WALK OF LATITUDE. See the header: a painter
         that ignores this call cannot land on these answers by chance. */
      imageRowLatitudes: (coords, height) => {
        R.rowCalls.push({ coords, height });
        if (o.noRows) return null;
        let n = -90, s = 90;
        for (const c of coords) { if (c[1] > n) n = c[1]; if (c[1] < s) s = c[1]; }
        const out = new Array(height);
        /* a deliberately non-linear parameterisation: the real one is Mercator, this one only has to
           be something no linear stepping produces */
        for (let r = 0; r < height; r++) { const t = Math.pow((r + 0.5) / height, 2); out[r] = n + (s - n) * t; }
        return out;
      },
      addDynamicImage: (id, spec) => {
        if (o.refuseImage) return false;
        R.images.set(id, spec);
        const ctx = stubCanvasCtx(spec.width, spec.height);
        spec.draw(ctx, spec.width, spec.height);
        R.images.get(id).painted = ctx.store.data;
        return true;
      },
      removeDynamicImage: (id) => { R.removedImages.push(id); R.images.delete(id); return true; },
    },
  };
  return R;
}

let FACTORY = null;

async function bootUpload(opts) {
  const toasts = [];
  const R = stubRenderer(opts);
  const w = {};
  w.IntMapGeoEngine = R.api;
  w.IntMapLang = { t: (lang, ...args) => (lang === 'jp' ? (args[1] || args[0]) : args[0]), locale: () => 'en' };
  globalThis.window = w;
  globalThis.document = { createElement: () => stubEl(), body: { appendChild() { } }, getElementById: () => null, addEventListener() { } };
  const { makeGisRaster } = await import('../js/gis-raster.js');
  w.IntMapGisRaster = makeGisRaster();
  const origWarn = console.warn; console.warn = () => { };
  /* ⚠ THE MODULE PUBLISHES ITS FACTORY ONCE PER PROCESS. js/map-ui.js writes onto whatever `window`
     existed at its first evaluation, and a second import is a cache hit that writes nothing. Each
     test wants its own renderer, so the factory is captured once and MOUNTED again on each fresh
     window — which is also the closer reproduction of the app, where one module is mounted once
     against one live renderer. */
  if (!FACTORY) { await import('../js/map-ui.js'); FACTORY = w.IntMapModules.geojsonUpload; }
  w.IntMapModules = { geojsonUpload: FACTORY };
  FACTORY({ lang: 'en', imToast: (m) => toasts.push(m) });
  console.warn = origWarn;
  return { w, R, toasts, UP: w.GeoJSONUpload, raster: w.IntMapGisRaster };
}

/* A grid whose value IS its row, so where a pixel came from can be read straight off the colour
   class it landed in. 20° tall so the non-linear row lookup separates visibly from a linear walk. */
function rowGrid(height, opts) {
  const o = opts || {};
  const width = o.width || 4;
  const vals = new Float64Array(width * height);
  for (let r = 0; r < height; r++) for (let c = 0; c < width; c++) vals[r * width + c] = (o.constant != null) ? o.constant : r;
  if (o.allMissing) vals.fill(NaN);
  return {
    id: o.id || 'ds-r', title: o.title || 'grid', kind: 'raster',
    width, height,
    grid: { west: 0, north: 20, pixelLng: 1, pixelLat: 20 / height },
    bands: o.bands || [{ name: 'v', unit: o.unit || null, nodata: null }],
    read: (i) => (i === 0 ? vals : null),
  };
}

/* ══ ① 格子はエンジン自身の動的画像に載る ═══════════════════════════════════════════════════ */

test('R749 ① a grid is drawn through the engine dynamic image, not a second source of its own', async () => {
  const { R, UP, raster } = await bootUpload();
  const ds = rowGrid(8);
  const st = raster.describeBands(ds);
  assert.equal(st.ok, true, 'the band must be measurable: ' + st.why);
  const put = UP.addRaster(ds, 'grid.tif', { band: 0, stats: st.bands });
  assert.ok(put && put.sid, 'addRaster must report what it made');
  assert.equal(R.images.size, 1, 'exactly one dynamic image');
  assert.equal(R.sources.size, 0, 'a grid must NOT add a geojson source — that is the vector path');
  assert.equal(R.layers.size, 0, 'and it must not add the three vector layers either');
  const img = R.images.get(put.sid);
  assert.deepEqual(img.coordinates[0], [0, 20], 'the image is placed by the grid corners');
  assert.deepEqual(img.coordinates[2], [ds.width * 1, 20 - 8 * (20 / 8)], 'south-east corner comes from the spacing');
});

/* ══ ② 行はエンジンに訊く（緯度を等間隔に歩かない）═══════════════════════════════════════════ */

test('R749 ② the painter looks its rows up from the engine rather than stepping through latitude', async () => {
  const { R, UP, raster } = await bootUpload();
  const ds = rowGrid(16);
  const st = raster.describeBands(ds);
  const put = UP.addRaster(ds, 'grid.tif', { band: 0, stats: st.bands });
  assert.ok(put, 'the grid must be drawn');
  assert.ok(R.rowCalls.length >= 1, 'imageRowLatitudes was never called — the painter is stepping latitude itself');
  const call = R.rowCalls[R.rowCalls.length - 1];
  assert.equal(call.height, R.images.get(put.sid).height, 'the rows are asked for at the height actually painted');

  /* Now the arithmetic. The stub answers a squared parameterisation, so the source row a given
     output row must carry is computable here WITHOUT the painter: north=20, pixelLat=20/16. */
  const img = R.images.get(put.sid), H = img.height, W = img.width;
  const px = img.painted.data;
  const lats = R.api.layers.imageRowLatitudes(img.coordinates, H);
  /* The legend the picture was painted from tells us which class each value belongs to; comparing
     CLASSES rather than colours keeps this independent of the palette. */
  const lg = put.legend;
  const classOf = (v) => { let i = 0; const cuts = lg.cuts || []; while (i < cuts.length && v >= cuts[i]) i++; return i; };
  const colourAt = (r, c) => { const o = (r * W + c) * 4; return [px[o], px[o + 1], px[o + 2], px[o + 3]]; };
  const classColour = lg.classes.map((cl) => { const m = /^#(..)(..)(..)$/.exec(cl.color); return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; });

  let checked = 0;
  for (let r = 0; r < H; r++) {
    const srcRow = Math.floor((20 - lats[r]) / (20 / 16));
    if (!(srcRow >= 0 && srcRow < 16)) continue;
    const want = classColour[classOf(srcRow)];
    const got = colourAt(r, 0);
    assert.deepEqual([got[0], got[1], got[2]], want,
      'output row ' + r + ' (lat ' + lats[r].toFixed(3) + ') does not carry source row ' + srcRow);
    checked++;
  }
  assert.ok(checked >= 8, 'too few rows compared to be evidence of anything');
});

/* ══ ③ 尺度の無いバンドは、発明した尺度で塗らずに名前で断る ════════════════════════════════ */

test('R749 ③ a band with no scale in it is refused by name rather than painted', async () => {
  const { UP } = await bootUpload();
  const flat = UP.classifyRaster({ name: 'v', unit: null, nodata: null, min: 7, max: 7, count: 100, nodataCount: 0 }, {});
  assert.equal(flat.ok, false, 'a band whose every cell holds one value has no ramp to draw');
  assert.equal(flat.why, 'raster-band-constant');
  const empty = UP.classifyRaster({ name: 'v', unit: null, nodata: null, min: null, max: null, count: 0, nodataCount: 100 }, {});
  assert.equal(empty.ok, false);
  assert.equal(empty.why, 'raster-band-empty');
  /* ⚠ and the two are DIFFERENT answers: 「全部欠損」 and 「全部同じ値」 send the reader to different
     places, and folding them into one code is the shape #R743 removed from the geometry kernel. */
  assert.notEqual(flat.why, empty.why);
  /* a category colouring must be TOLD its categories — integers are not evidence of a classification */
  const guess = UP.classifyRaster({ name: 'v', unit: null, nodata: null, min: 1, max: 5, count: 9, nodataCount: 0 }, { mode: 'categorical' });
  assert.equal(guess.ok, false);
  assert.equal(guess.why, 'raster-categories-not-stated');
});

/* ══ ④ 凡例は、絵を塗ったその 1 つの snapshot ══════════════════════════════════════════════ */

test('R749 ④ the legend carries counts measured from the picture, and the missing cells are counted', async () => {
  const { R, UP, raster } = await bootUpload();
  const width = 4, height = 8;
  const vals = new Float64Array(width * height);
  for (let i = 0; i < vals.length; i++) vals[i] = i;
  /* one declared nodata and one NaN: both are missing, and the count has to see both */
  vals[0] = -9999; vals[1] = NaN;
  const ds = { id: 'ds-m', title: 'g', kind: 'raster', width, height,
    grid: { west: 0, north: 20, pixelLng: 1, pixelLat: 2.5 },
    bands: [{ name: 'v', unit: 'm', nodata: -9999 }], read: (i) => (i === 0 ? vals : null) };
  const st = raster.describeBands(ds);
  const put = UP.addRaster(ds, 'g.tif', { band: 0, stats: st.bands });
  assert.ok(put, 'the grid must be drawn');
  const lg = put.legend;
  assert.equal(lg.unit, 'm', 'the band unit reaches the legend — a ladder of bare numbers is not readable');
  const painted = lg.classes.reduce((s, c) => s + c.count, 0);
  assert.ok(painted > 0, 'the legend classes must carry the counts the painter measured');
  assert.equal(painted, lg.painted, 'the per-class counts must add up to what was painted');
  assert.ok(lg.missing.count > 0, 'the missing cells must be counted from the PICTURE, not left at the band total');
  /* ⚠ THE TWO KINDS OF MISSING ARE ONE FACT. A declared nodata and a NaN are both 「値がない」, and a
     painter that honoured only one of them would paint −9999 as the darkest step of the ramp. */
  assert.ok(lg.min > -9999, 'a declared nodata must not become the bottom of the scale');
});

/* ══ ⑤ 消したら絵も消える ═════════════════════════════════════════════════════════════════ */

test('R749 ⑤ removing a drawn grid takes the picture off the map', async () => {
  const { R, UP, raster } = await bootUpload();
  const ds = rowGrid(8);
  const put = UP.addRaster(ds, 'g.tif', { band: 0, stats: raster.describeBands(ds).bands });
  assert.equal(R.images.size, 1);
  UP.remove(put.n);
  assert.equal(R.images.size, 0, 'the canvas source is still on the map after the row was removed');
  assert.deepEqual(R.removedImages, [put.sid]);
  assert.equal(UP._items.length, 0);
});

/* ══ ⑥ 属性着色は名前で断り、凡例を消さない ═══════════════════════════════════════════════ */

test('R749 ⑥ colouring a grid by an attribute is refused by name and leaves its legend alone', async () => {
  const { UP, raster } = await bootUpload();
  const ds = rowGrid(8);
  const put = UP.addRaster(ds, 'g.tif', { band: 0, stats: raster.describeBands(ds).bands });
  const before = UP.styleOf ? UP.styleOf(put.n) : null;
  const res = await UP.style(put.n, { field: 'v', mode: 'graduated' });
  assert.equal(res.ok, false);
  assert.equal(res.why, 'raster-not-attribute-coloured', 'a grid has no attribute table; 「no-features」 would name the wrong thing');
  /* ⚠ AND THE CLEAR PATH IS REFUSED TOO. style(ref, null) wipes the legend on the vector path; the
     raster legend is what the PICTURE was painted from, so wiping it would leave the map and the
     list disagreeing. */
  const clear = await UP.style(put.n, null);
  assert.equal(clear.ok, false);
  const item = UP._items.find((x) => x.n === put.n);
  assert.ok(item && item.legend && item.legend.classes.length, 'the raster legend must survive a refused style() call');
  void before;
});

/* ══ ⑦ classifyRaster が返しうる拒否は、全部が文を持つ ═══════════════════════════════════════ */

test('R749 ⑦ every refusal classifyRaster can return has a sentence in the same file', () => {
  const src = read('js/map-ui.js');
  const start = src.indexOf('function classifyRaster(');
  const end = src.indexOf('function rasterClassOf(');
  assert.ok(start > 0 && end > start, 'classifyRaster must still be findable for this to measure anything');
  const body = src.slice(start, end);
  /* ⚠ THE SET IS READ OUT OF THE CODE, NOT WRITTEN HERE. A hand-kept list would go quiet the day a
     refusal was added — the failure shape .agents/rules/no-ad-hoc-hardcoding.md §2-4 names. */
  const codes = new Set();
  for (const m of body.matchAll(/why:\s*'([a-z0-9-]+)'/g)) codes.add(m[1]);
  assert.ok(codes.size >= 4, 'classifyRaster should have several named refusals, found ' + codes.size);
  const reasons = src.slice(src.indexOf('function rasterReason('));
  const said = reasons.slice(0, reasons.indexOf('\n    }'));
  for (const c of codes) {
    assert.ok(said.includes("'" + c + "'"), 'refusal with no sentence for the reader: ' + c);
  }
});

/* ══ ⑧ 「描けた」は描画器が報告した事実 ═══════════════════════════════════════════════════ */

test('R749 ⑧ a renderer that refuses the image is not reported as a success', async () => {
  const { UP, raster, toasts } = await bootUpload({ refuseImage: true });
  const ds = rowGrid(8);
  const put = UP.addRaster(ds, 'g.tif', { band: 0, stats: raster.describeBands(ds).bands });
  assert.equal(put, null, 'addRaster must answer null when the engine took nothing');
  assert.equal(UP._items.length, 0, 'and it must leave no row behind for a picture that is not there');
  assert.ok(toasts.some((t) => /cannot draw grids/i.test(t)), 'the reader has to be told, not left looking at an empty map');
});

/* ══ ⑨ バイトが動いて版が動いていないカーネルは捕まる ═════════════════════════════════════ */

test('R749 ⑨ a kernel whose code moved without its version moving is caught', async () => {
  const { KERNELS, kernelHash, declaredVersion } = await import('../scripts/gis-kernel-versions.mjs');
  for (const [rel, rec] of Object.entries(KERNELS)) {
    const src = read(rel);
    const declared = declaredVersion(src);
    assert.ok(declared, rel + ' declares no KERNEL_VERSION — js/gis-project.js would record null for every step it saves');
    assert.equal(declared, rec.version,
      rel + ': the kernel declares ' + declared + ' and this ledger records ' + rec.version + '. Make them agree, then record the hash.');
    assert.ok(rec.sha256, rel + ': no hash recorded yet — run scripts/gis-kernel-versions.mjs recording');
    assert.equal(kernelHash(src), rec.sha256,
      rel + ' changed since version ' + rec.version + ' was recorded. If this edit can change an ANSWER, raise KERNEL_VERSION there and here; if it cannot, record the new hash and leave the version alone.');
  }
  /* the hash must be blind to the checkout's line endings, or this gate says different things on
     different machines ([[intmap-gate-verdict-must-not-depend-on-the-runner]]) */
  assert.equal(kernelHash('a\r\nb'), kernelHash('a\nb'));
});

/* ══ ⑩ GeoTIFF は地物の機械に入る前に、格子として出ていく ═══════════════════════════════════ */

test('R749 ⑩ a GeoTIFF leaves the import path as a grid, before the feature machinery', () => {
  const src = read('js/geo-import.js');
  const at = src.indexOf('gis-geotiff.js');
  assert.ok(at > 0, 'js/geo-import.js does not reach for the GeoTIFF reader at all');
  /* ⚠ THE ORDER IS THE POINT, NOT THE PRESENCE. Everything after the container sniff works on r.fc —
     the coordinate repair, the feature cap, the CRS settlement — and a grid has none of them. */
  const sniffAt = src.indexOf('const sig = ATL_FILE.sniff(');
  assert.ok(at < sniffAt, 'the GeoTIFF branch must come before the container sniff, or the grid falls into decodeBytes');
  const branch = src.slice(at - 1200, sniffAt);
  assert.ok(/return\s*\{\s*ok:\s*true,\s*format:\s*'geotiff'/.test(branch),
    'the GeoTIFF branch must RETURN, not fall through into the feature pipeline');
  /* the reader is fetched only when such a file lands: a session that never drops a raster must not
     pay for a TIFF decoder */
  assert.ok(/await import\('\.\/gis-geotiff\.js'\)/.test(branch), 'the reader must be a dynamic import');
});

/* ══ ⑪ ⑫ ⑬ 二つの新しい読み手は、互いに、そして読者に繋がっているか ═══════════════════════════
   ⚠ THESE THREE EXIST BECAUSE 「配線は描けた」 IS NOT 「通電している」
   ([[intmap-wiring-complete-is-not-wiring-live]]). js/gis-geotiff.js and js/gis-warp.js were written
   in parallel against one written contract, and the contract is not the code: measured while wiring
   this round, the reader published its affine as {x0,y0,dx,dy,rotated} and the warp accepted a
   six-element GeoTransform — both modules green, both test suites green, and a dropped GeoTIFF would
   have been refused at the seam between them. A check that each module passes its own tests cannot
   see that; only one that runs a file THROUGH both can. */

/* The smallest real GeoTIFF: little-endian, one uncompressed strip, uint16, north-up, with a pixel
   scale, a tiepoint and a GeoKey naming the CRS. ⚠ WRITTEN HERE FROM THE FORMAT, not from the
   reader's own tables — a fixture produced by the thing under test measures nothing. */
function tinyGeoTiff(opts) {
  const o = opts || {};
  const W = o.width || 6, H = o.height || 5, epsg = o.epsg || 32654;
  const px = new Uint16Array(W * H);
  for (let i = 0; i < px.length; i++) px[i] = (o.value != null) ? o.value : (i * 3 + 1);
  const scale = [o.sx || 1000, o.sy || 1000, 0];
  const tie = [0, 0, 0, o.x0 != null ? o.x0 : 400000, o.y0 != null ? o.y0 : 4000000, 0];
  const geoKeys = [1, 1, 0, 2, 1024, 0, 1, 1, 3072, 0, 1, epsg];

  /* layout: header(8) | pixels | doubles(scale) | doubles(tie) | shorts(geoKeys) | IFD */
  const pixBytes = px.length * 2;
  const offPix = 8;
  const offScale = offPix + pixBytes;
  const offTie = offScale + scale.length * 8;
  const offKeys = offTie + tie.length * 8;
  const offIFD = offKeys + geoKeys.length * 2;

  const entries = [
    [256, 3, 1, W], [257, 3, 1, H], [258, 3, 1, 16], [259, 3, 1, 1], [262, 3, 1, 1],
    [273, 4, 1, offPix], [277, 3, 1, 1], [278, 3, 1, H], [279, 4, 1, pixBytes],
    [284, 3, 1, 1], [339, 3, 1, 1],
    [33550, 12, scale.length, offScale], [33922, 12, tie.length, offTie], [34735, 3, geoKeys.length, offKeys],
  ].sort((a, b) => a[0] - b[0]);

  const total = offIFD + 2 + entries.length * 12 + 4;
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  u8[0] = 0x49; u8[1] = 0x49; dv.setUint16(2, 42, true); dv.setUint32(4, offIFD, true);
  for (let i = 0; i < px.length; i++) dv.setUint16(offPix + i * 2, px[i], true);
  scale.forEach((v, i) => dv.setFloat64(offScale + i * 8, v, true));
  tie.forEach((v, i) => dv.setFloat64(offTie + i * 8, v, true));
  geoKeys.forEach((v, i) => dv.setUint16(offKeys + i * 2, v, true));
  dv.setUint16(offIFD, entries.length, true);
  entries.forEach((e, i) => {
    const at = offIFD + 2 + i * 12;
    dv.setUint16(at, e[0], true); dv.setUint16(at + 2, e[1], true); dv.setUint32(at + 4, e[2], true);
    /* a SHORT that fits stays in the value field, at its own width */
    if (e[1] === 3 && e[2] === 1) dv.setUint16(at + 8, e[3], true); else dv.setUint32(at + 8, e[3], true);
  });
  return { bytes: u8, width: W, height: H, values: px, epsg };
}

test('R749 ⑪ every refusal the two grid readers can return has a sentence for the reader', async () => {
  const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
  const src = read('js/map-ui.js');
  const said = src.slice(src.indexOf('function reasonText('));
  /* ⚠ THE SET COMES FROM THE MODULES, NOT FROM A LIST HERE. The reader publishes refusals(); the
     warp's are read out of its own refuse() calls. A hand-kept list would go quiet the day either
     added one — the shape .agents/rules/no-ad-hoc-hardcoding.md §2-4 names. */
  const codes = new Set(makeGisGeotiff().refusals());
  assert.ok(codes.size >= 10, 'the GeoTIFF reader should publish its refusals, found ' + codes.size);
  for (const m of read('js/gis-warp.js').matchAll(/refuse\('([a-z0-9-]+)'/g)) codes.add(m[1]);
  const missing = Array.from(codes).filter((c) => !said.includes("'" + c + "'"));
  assert.deepEqual(missing, [], 'refusals with no sentence: ' + missing.join(', '));
});

test('R749 ⑫ a GeoTIFF read by the reader is accepted by the warp — the two shapes meet', async () => {
  const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const w = {}; globalThis.window = w;
  w.IntMapGisRaster = makeGisRaster();
  const { makeGisCrs } = await import('../js/gis-crs.js');
  w.IntMapGisCrs = makeGisCrs();
  await w.IntMapGisCrs.ready();

  const t = tinyGeoTiff({});
  const g = await makeGisGeotiff().read(t.bytes, null);
  assert.equal(g.ok, true, 'the fixture must be readable: ' + g.why + ' ' + JSON.stringify(g.detail || {}));
  assert.equal(g.grid.crs, 'EPSG:' + t.epsg, 'the GeoKey names the CRS');

  const out = await makeGisWarp().to4326(g.grid, { method: 'nearest' });
  assert.equal(out.ok, true, 'the warp refused a grid the reader produced: ' + out.why + ' ' + JSON.stringify(out.detail || {}));
  /* ⚠ AND THE RESULT IS REGISTRY-SHAPED. docs/GIS-CORE.md §1.4 defines what a raster record is, and
     a warp output that needed translating before it could be registered would be a fourth spelling. */
  const r = w.IntMapGisRaster.validate(out.grid);
  assert.equal(r.ok, true, 'the warped grid is not a valid raster record: ' + r.why);
  assert.equal(out.grid.crs, 'EPSG:4326');
  assert.equal(out.grid.sourceCrs, 'EPSG:' + t.epsg, 'the result must say where it came from');
  assert.ok(out.report.filled > 0, 'a warp that filled nothing has not warped anything');
  /* the values that came through are values that were in the file — no invented numbers */
  const vals = out.grid.read(0);
  const source = new Set(Array.from(t.values));
  for (const v of vals) if (!Number.isNaN(v)) assert.ok(source.has(v), 'nearest resampling invented the value ' + v);
});

test('R749 ⑬ and the warped grid can be drawn — read, reproject, paint, with no translation between', async () => {
  const { makeGisGeotiff } = await import('../js/gis-geotiff.js');
  const { makeGisWarp } = await import('../js/gis-warp.js');
  const up = await bootUpload();
  up.w.IntMapGisCrs = (await import('../js/gis-crs.js')).makeGisCrs();
  await up.w.IntMapGisCrs.ready();

  const t = tinyGeoTiff({ width: 8, height: 8 });
  const g = await makeGisGeotiff().read(t.bytes, null);
  const out = await makeGisWarp().to4326(g.grid, { method: 'nearest' });
  assert.equal(out.ok, true, 'warp: ' + out.why);
  const ds = Object.assign({ id: 'ds-1', title: 'tif', kind: 'raster' }, out.grid);
  const st = up.raster.describeBands(ds);
  assert.equal(st.ok, true, 'describeBands: ' + st.why);
  const put = up.UP.addRaster(ds, 'tif', { band: 0, stats: st.bands });
  assert.ok(put && put.sid, 'the warped grid could not be drawn');
  assert.equal(up.R.images.size, 1);
  const painted = up.R.images.get(put.sid).painted;
  assert.ok(painted && painted.data.some((v, i) => (i % 4 === 3) && v > 0), 'the picture is entirely transparent — nothing was painted');
});
