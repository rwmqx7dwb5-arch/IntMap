/* ============================================================================
 *  #R749 · 描画と分析が同じ供給元を読む — そして、どこまでを見た答えかを述べる
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED AS THE DEFECT (memory: intmap-restate-the-defect-not-the-fix). What was
 *  wrong was NOT that a field called `coverage` was absent. What was wrong is this, in the shipped
 *  file's own words until this round:
 *
 *      「A layer that has answered for [[-180,-90],[180,90]] has answered for all of its content.」
 *
 *  It has not. What a layer answers for the world box is what the RENDERER IS HOLDING — a source a
 *  module refreshed for the current view, a list an upstream capped, a field loaded only while its
 *  layer is on — and every mean, every count and every zonal statistic computed downstream inherited
 *  that difference with nothing anywhere saying so. 「この範囲の平均」 and 「いま画面に載っていたもの
 *  の平均」 arrived as the same sentence. This project has recorded that shape twice
 *  ([[intmap-coverage-counted-is-not-coverage-seen]], [[intmap-is-this-a-world-ask-the-record-next-door]]).
 *
 *  So the invariants below are about the CLAIM, not about the field:
 *    ① an answer cut by a limit does not call itself complete
 *    ② a supplier that keeps only what the camera needs does not call itself complete
 *    ③ asking for the world does not make the answer the world — the case the layer exists for
 *    ④ `all` is reachable, and only from a supplier that said so (a word nothing can reach is not a
 *       measurement, and a word everything reaches is not one either)
 *    ⑤ the coverage travels with the data, into the record an op reads
 *    ⑥ a region read and a bare sampleAt loop are the same numbers — the region path is a rewrite of
 *       the walk, and a rewrite that changes the answer is a new bug, not a faster one
 *    ⑦ a switched-off supplier is refused by name, not answered with an empty success
 *    ⑧ the list is discovered: a source added to the renderer appears in it
 *    ⑨ 「このセルは欠損か」 is asked of one function, and it is the one that knows about ±Infinity
 *
 *  ⚠ THE STUBS ARE NOT MORE CAPABLE THAN THE REAL REGISTRY ([[intmap-r671-lessons]]: a stub that
 *  outdoes the thing it stands for repairs the bug on the way past). `IntMapLayers` here answers
 *  exactly the eight calls js/map-ui.js publishes, `featuresIn` filters by a box the way _srcFeatsIn
 *  does, and `sampleAt` takes one position and returns the array of {id,label,value} rows.
 *  ⚠ AND ⑥'S REFERENCE SITS OUTSIDE THE THING MEASURED: the pixel centres are derived here from the
 *  window and the size, not read from js/gis-raster.js's own rowCentreLat/colCentreLng.
 * ==========================================================================*/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

/* ── a renderer, no more able than the one js/map-ui.js publishes ─────────────────────────────── */

function makeFakeMap(w) {
  const rows = new Map();          /* id → { label, on, time, features?, sample? } */
  let camera = { w: -180, s: -90, e: 180, n: 90 };

  /* The same question _srcFeatsIn asks, for the geometry these fixtures use. */
  const inBox = (f, b) => {
    const c = f && f.geometry && f.geometry.coordinates;
    return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
  };
  const asBox = (bounds) => {
    if (!bounds) return { ...camera };
    return { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] };
  };

  w.IntMapLayers = {
    list: () => Array.from(rows.keys()),
    state: (id) => {
      const r = rows.get(String(id));
      if (!r) return null;
      return { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null };
    },
    featuresIn: (id, bounds) => {
      const r = rows.get(String(id));
      if (!r || !r.features) return null;
      const b = asBox(bounds);
      /* ⚠ A VIEW-BOUND SUPPLIER IS MODELLED BY HOLDING LESS, never by knowing more: `held` is what the
         renderer has, and for a view-bound row that is only what the camera covers. */
      const held = r.viewBound ? r.features.filter((f) => inBox(f, camera)) : r.features;
      return held.filter((f) => inBox(f, b));
    },
    featuresInSource: () => null,
    /* ⚠ (#R774) A ROW FOR EVERY REGISTRATION THAT WAS ASKED, exactly as js/map-ui.js now builds it:
       `value` only when there was one, so 「訊いた」 and 「値があった」 stay two observations. */
    sampleAt: async (lng, lat, ids) => {
      const out = [];
      for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
        const r = rows.get(String(id));
        if (!r || !r.sample) continue;
        const row = { id: String(id), label: r.label, asked: true };
        try {
          const v = await Promise.resolve(r.sample(lng, lat));
          if (v != null && v !== '') row.value = v;
        } catch (_) { row.failed = true; }
        out.push(row);
      }
      return out;
    },
    active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
    context: () => [],
    register: (id, impl) => rows.set(String(id), impl),
  };
  w.IntMapGeoEngine = {
    scene: { getStyle: () => ({ sources: {} }) },
    layers: { sourceData: () => null },
    camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
  };
  return {
    rows,
    setCamera: (b) => { camera = b; },
  };
}

async function boot() {
  const w = {};
  globalThis.window = w;
  new Function('window', read('js/geodesy.js'))(w);
  const { makeGisDatasets } = await import('../js/gis-datasets.js');
  const { makeGisGeometry } = await import('../js/gis-geometry.js');
  const { makeGisRaster } = await import('../js/gis-raster.js');
  const { makeGisLayers } = await import('../js/gis-layers.js');
  const { makeGisSources } = await import('../js/gis-sources.js');
  const map = makeFakeMap(w);
  w.IntMapData = makeGisDatasets();
  w.IntMapGisGeometry = makeGisGeometry();
  w.IntMapGisRaster = makeGisRaster();
  const layers = makeGisLayers();
  const sources = makeGisSources();
  return { w, map, layers, sources, data: w.IntMapData, raster: w.IntMapGisRaster };
}

/* ══ ① 上限で切った取得は、全部だと名乗らない ═══════════════════════════════════════════════ */

test('R749 ① a read the caller\'s own limit cut does not call itself complete', async () => {
  const { map, sources } = await boot();
  const fs = [];
  for (let i = 0; i < 20; i++) fs.push(pt(i * 0.1, 0, { i }));
  map.rows.set('quakes', { label: 'Earthquakes', on: true, features: fs });

  const got = await sources.acquire('quakes', { limit: 5 });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.features.length, 5);
  assert.notEqual(got.coverage.completeness, 'all', 'a truncated answer called itself complete');
  assert.equal(got.coverage.completeness, 'sample');
  assert.equal(got.coverage.reason, 'limit-truncated');
  /* ⚠ THE COUNT ALONE CANNOT SHOW 「一部だけ」 — what makes it visible is the count NEXT TO what was
     there. That is the recorded shape (memory: coverage counted is not coverage seen). */
  assert.equal(got.coverage.count, 5);
  assert.equal(got.coverage.available, 20);
  assert.equal(got.coverage.requested.limit, 5);
});

/* ══ ② 画面外を捨てている供給元は、全部だと名乗らない ═══════════════════════════════════════ */

test('R749 ② a supplier that keeps only what the camera needs never reads as complete', async () => {
  const { map, sources } = await boot();
  map.rows.set('ships', { label: 'Live ships', on: true, features: [pt(0, 0), pt(1, 1)] });
  /* The supplier itself says what it is. This is the only route to a verdict about its holdings —
     and the verdict it produces here is a REFUSAL of completeness, not a grant of it. */
  assert.equal(sources.declare('ships', { viewBound: true, live: true }).ok, true);

  const got = await sources.acquire('ships', {});
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.notEqual(got.coverage.completeness, 'all');
  assert.equal(got.coverage.reason, 'supplier-view-bound');
  /* …and a window does not rescue it: the supplier keeps the view, whatever box is asked for. */
  const inBox = await sources.acquire('ships', { bbox: { w: -1, s: -1, e: 2, n: 2 } });
  assert.equal(inBox.coverage.completeness, 'partial');
  assert.equal(inBox.coverage.reason, 'supplier-view-bound');

  const row = sources.list().find((s) => s.id === 'ships');
  assert.equal(row.needsVisible, true, 'the list does not carry what the supplier declared');
  assert.equal(row.live, true);
});

/* ══ ③ 世界の箱を渡しても、供給元がタイルしか持っていなければ全部にはならない ═══════════════ */

test('R749 ③ asking for the world does not make the answer the world — the reason this layer exists', async () => {
  const { map, sources } = await boot();
  /* Ten features exist; the renderer is holding the three the camera covers, which is what a source
     refreshed for the current view looks like from outside. NOTHING DECLARES ANYTHING here — this is
     the state every supplier in the app is in today. */
  const fs = [];
  for (let i = 0; i < 10; i++) fs.push(pt(i * 10, 0, { i }));
  map.rows.set('planes', { label: 'Live aircraft', on: true, features: fs, viewBound: true });
  map.setCamera({ w: -5, s: -5, e: 25, n: 5 });

  const got = await sources.acquire('planes', {});     /* no bbox = 「everything」 */
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.features.length, 3, 'the fixture is not modelling a view-bound holder');
  assert.notEqual(got.coverage.completeness, 'all',
    'a world box over a supplier holding one viewport was reported as a complete answer');
  assert.equal(got.coverage.completeness, 'partial');
  /* ⚠ AND THE REASON IS A MEASUREMENT REPORTED AS WHAT IT IS. Everything it holds is on screen; that
     is what a view-bound supplier looks like AND what a small dataset under a wide camera looks like,
     so the word is 「見分けがつかない」 rather than a verdict nothing here could support. */
  assert.equal(got.coverage.reason, 'indistinguishable-from-view');
  assert.deepEqual(got.coverage.requested.bbox, null);
  assert.deepEqual(got.coverage.served, { w: -180, s: -90, e: 180, n: 90 });

  /* With no camera narrower than the world there is nothing to measure, and the silence is named as
     silence rather than filled in. */
  map.setCamera({ w: -180, s: -90, e: 180, n: 90 });
  const wide = await sources.acquire('planes', {});
  assert.equal(wide.coverage.completeness, 'partial');
  assert.equal(wide.coverage.reason, 'extent-undeclared');
});

/* ══ ④ `all` は届く語である — ただし述べた供給元からだけ ════════════════════════════════════ */

test('R749 ④ `all` is reachable, and only from a supplier that stated it', async () => {
  const { map, sources } = await boot();
  map.rows.set('heritage', { label: 'World Heritage', on: true, features: [pt(10, 10), pt(-30, 40)] });

  /* An extent alone is not completeness: 「どこを覆うか」 and 「その中を漏れなく持っているか」 are two
     statements, and only the second is the one `all` makes. */
  sources.declare('heritage', { extent: { w: -180, s: -90, e: 180, n: 90 } });
  assert.equal((await sources.acquire('heritage', {})).coverage.reason, 'completeness-undeclared');

  sources.declare('heritage', { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, live: false });
  const all = await sources.acquire('heritage', {});
  assert.equal(all.coverage.completeness, 'all');
  assert.equal(all.coverage.reason, null);

  /* A declared extent narrower than the window is not an `all` over that window. */
  sources.declare('heritage', { extent: { w: 0, s: 0, e: 20, n: 20 }, complete: true });
  const world = await sources.acquire('heritage', {});
  assert.equal(world.coverage.completeness, 'partial');
  assert.equal(world.coverage.reason, 'extent-narrower-than-request');
  const inside = await sources.acquire('heritage', { bbox: { w: 5, s: 5, e: 15, n: 15 } });
  assert.equal(inside.coverage.completeness, 'all');

  /* A time that was asked for and that nothing establishes is not an `all` either — 「誰も述べて
     いない主張が欄に入っている」 is the defect .agents/rules/historical-verification.md §2-3 names. */
  sources.declare('heritage', { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true });
  const dated = await sources.acquire('heritage', { time: '1889' });
  assert.equal(dated.coverage.completeness, 'partial');
  assert.equal(dated.coverage.reason, 'time-not-established');

  /* Every word either function can produce is in the declared vocabulary — a reason spelt only at
     one call site is a reason no reader can be given a sentence for. */
  const words = new Set(sources.coverageReasons());
  for (const c of [all, world, inside, dated]) if (c.coverage.reason) assert.ok(words.has(c.coverage.reason), c.coverage.reason);
  assert.ok(sources.completenessValues().includes(all.coverage.completeness));
});

/* ══ ⑤ 被覆はデータに付いて回る ════════════════════════════════════════════════════════════ */

test('R749 ⑤ the coverage travels into the record the ops read', async () => {
  const { map, layers, data } = await boot();
  map.rows.set('demo', { label: 'demo', on: true, features: [pt(0, 0, { a: 1 }), pt(1, 1, { a: 2 })] });
  map.setCamera({ w: -1, s: -1, e: 2, n: 2 });

  const ds = layers.toDataset('demo', {});
  assert.equal(ds.ok, true, JSON.stringify(ds));
  const prov = data.describe(ds.dataset.id).provenance;
  assert.equal(prov.kind, 'layer');
  assert.ok(prov.coverage, 'the dataset does not say how much of what it claims it actually saw');
  assert.ok(['all', 'partial', 'sample'].includes(prov.coverage.completeness));
  assert.equal(prov.coverage.count, 2);
  /* The recipe still says 「いつ・どのレイヤーの・どの範囲を」 — the coverage is added to it, and the
     three fields #R732 put there are not replaced by it. */
  assert.equal(prov.layer, 'demo');
  assert.ok(prov.at > 0);
});

/* ══ ⑥ 領域の読みは、素の sampleAt ループと同じ数を返す ══════════════════════════════════════ */

test('R749 ⑥ region() returns the same numbers as a bare sampleAt loop over the same window', async () => {
  const { w, map, sources } = await boot();
  /* A field with a different number at every position, so an off-by-half-a-pixel is visible rather
     than hidden inside a constant. */
  const field = (lng, lat) => Math.round((lng * 1000 + lat) * 100) / 100;
  map.rows.set('elev', { label: 'Elevation', on: true, sample: field });

  const box = { w: 10, s: 20, e: 14, n: 23 };
  const width = 7, height = 5;
  const got = await sources.region('elev', box, { width, height });
  assert.equal(got.ok, true, JSON.stringify(got));
  assert.equal(got.coverage.completeness, 'sample', 'a field burnt at a chosen resolution is a sample');
  assert.equal(got.coverage.reason, 'grid-is-a-sample');
  assert.deepEqual(got.coverage.resolution, { pixelLng: (box.e - box.w) / width, pixelLat: (box.n - box.s) / height, width, height });

  /* ⚠ THE REFERENCE IS OUTSIDE THE THING MEASURED. These centres are derived here from the window and
     the size — the arithmetic the old js/gis-layers.js loop did — and the values come through the
     registry's own door, with no grid code between. */
  const cells = got.grid.read(0);
  const pxLng = (box.e - box.w) / width, pxLat = (box.n - box.s) / height;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const lng = box.w + (col + 0.5) * pxLng;
      const lat = box.n - (row + 0.5) * pxLat;
      const rowsBack = await w.IntMapLayers.sampleAt(lng, lat, ['elev']);
      const want = rowsBack.find((x) => x.id === 'elev').value;
      assert.equal(cells[row * width + col], want, 'pixel ' + row + ',' + col + ' disagrees with sampleAt');
    }
  }

  /* ⚠ AND THE SYNCHRONOUS DOOR STILL ANSWERS THE SAME GRID. `fromSampler` and `fromSamplerAsync` now
     share one grid builder, and a shared builder that changed either one would be a refactor that
     moved a number — the two are compared against each other over the same window, which is the only
     comparison that can see it (there was no check on fromSampler at all before this one). */
  const RS = w.IntMapGisRaster;
  const spec = { bounds: [box.w, box.s, box.e, box.n], width, height, band: { name: 'b', unit: 'm', nodata: -9999 } };
  const syncBake = RS.fromSampler(Object.assign({ sample: field }, spec));
  const asyncBake = await RS.fromSamplerAsync(Object.assign({ sample: async (x, y) => field(x, y) }, spec));
  assert.equal(syncBake.ok, true, JSON.stringify(syncBake));
  assert.equal(asyncBake.ok, true, JSON.stringify(asyncBake));
  assert.deepEqual(syncBake.raster.grid, asyncBake.raster.grid);
  assert.deepEqual(syncBake.raster.bands, asyncBake.raster.bands);
  assert.equal(syncBake.filled, asyncBake.filled);
  assert.deepEqual(Array.from(syncBake.raster.read(0)), Array.from(asyncBake.raster.read(0)));
  /* …and both refuse the same unusable spec by the same name. */
  assert.equal(RS.fromSampler({ bounds: [1, 2, 3], width: 2, height: 2, sample: field }).why, 'sampler-bounds-invalid');
  assert.equal((await RS.fromSamplerAsync({ bounds: [1, 2, 3], width: 2, height: 2, sample: field })).why, 'sampler-bounds-invalid');
  assert.equal((await RS.fromSamplerAsync(Object.assign({}, spec, { sample: null }))).why, 'sampler-not-a-function');

  /* ⚠ AND IT STOPS WHEN IT IS TOLD TO. A synchronous loop cannot be cancelled; this one reads the
     signal between pixels, so a signal raised before the first one is seen. */
  const ac = new AbortController();
  ac.abort();
  const stopped = await sources.region('elev', box, { width: 40, height: 40, signal: ac.signal });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.why, 'cancelled');
});

/* ══ ⑦ 消えている供給元は、空の成功ではなく名前で断られる ═══════════════════════════════════ */

test('R749 ⑦ a switched-off supplier is refused by name — and one that still answers is read', async () => {
  const { map, sources, layers } = await boot();

  /* A row with no sampler at all: nothing to ask, so the window is not a window of holes — it is a
     question that was never put to anybody, and it is refused as that. ⚠ (#R774) 「訊けなかった」 is
     now measured as 「行が返らなかった」 rather than as 「値が無かった」; a field that ANSWERS while
     it is off with nothing in this particular window is `layer-values-all-missing`, below. */
  map.rows.set('koppen', { label: 'Köppen climate', on: false });
  const off = await sources.region('koppen', { w: 0, s: 0, e: 1, n: 1 }, { width: 4, height: 4 });
  assert.equal(off.ok, false);
  assert.equal(off.why, 'layer-not-visible', JSON.stringify(off));
  /* The door a reader reaches speaks the vocabulary js/gis-panel.js already has nine languages for. */
  const spoken = await layers.toRaster('koppen', { bounds: { w: 0, s: 0, e: 1, n: 1 }, width: 4, height: 4 });
  assert.equal(spoken.why, 'layer-not-sampling');

  /* ⚠ (#R774) AND THE ROW THAT ANSWERS NULL EVERYWHERE IS A DIFFERENT REFUSAL, with its own
     sentence: the supplier was reached, and the data is not there. */
  map.rows.set('empty', { label: 'Answers, holds nothing', on: false, sample: () => null });
  const hollow = await sources.region('empty', { w: 0, s: 0, e: 1, n: 1 }, { width: 4, height: 4 });
  assert.equal(hollow.ok, false);
  assert.equal(hollow.why, 'layer-values-all-missing', JSON.stringify(hollow));

  /* ⚠ AND 「off」 IS NOT ASSUMED TO MEAN 「no values」. It is probed: a field that answers while its
     layer is off is read, where the old path refused it on a rule that was true of most rows and
     stated as if it were true of all. */
  map.rows.set('cached', { label: 'cached field', on: false, sample: (lng, lat) => lng + lat });
  const cached = await sources.region('cached', { w: 0, s: 0, e: 1, n: 1 }, { width: 3, height: 3 });
  assert.equal(cached.ok, true, JSON.stringify(cached));
  assert.equal(cached.filled, 9);

  /* A features row that is off and hands nothing over is the same distinction: 「訊けなかった」 is not
     「0 件だった」 (docs/GIS-CORE.md §2.5.1). */
  map.rows.set('news', { label: 'News points', on: false, features: [] });
  const none = await sources.acquire('news', {});
  assert.equal(none.ok, false);
  assert.equal(none.why, 'layer-not-visible');

  /* …and a row that IS on with nothing in the window keeps saying so, because that is a real 0. */
  map.rows.set('vol', { label: 'Volcanoes', on: true, features: [pt(100, 40)] });
  const empty = await sources.acquire('vol', { bbox: { w: 0, s: 0, e: 1, n: 1 } });
  assert.equal(empty.ok, false);
  assert.equal(empty.why, 'no-features');
});

/* ══ ⑧ 一覧は数え上げであって、手で並べたものではない ═══════════════════════════════════════ */

test('R749 ⑧ list() is discovered — a supplier added to the renderer appears in it', async () => {
  const { map, sources } = await boot();
  assert.deepEqual(sources.list(), [], 'an empty map is an empty list, not a list of names kept here');

  map.rows.set('quakes', { label: 'Earthquakes', on: true, features: [pt(0, 0)] });
  map.rows.set('precip', { label: 'Precipitation', on: true, sample: () => 3 });
  const seen = sources.list();
  assert.deepEqual(seen.map((s) => s.id).sort(), ['precip', 'quakes']);
  assert.equal(seen.find((s) => s.id === 'quakes').kind, 'features');
  assert.equal(seen.find((s) => s.id === 'precip').kind, 'grid');

  /* ⚠ THE ONE THAT MATTERS: a module this file has never heard of, registering after the fact. A
     hand-written list is a photograph of a directory ([[intmap-discovered-list-is-a-photograph]]);
     this one is taken again every time it is asked. */
  map.rows.set('brand-new', { label: 'Something nobody wrote down', on: true, features: [pt(5, 5)] });
  assert.ok(sources.list().some((s) => s.id === 'brand-new'), 'a new supplier did not appear: ' + JSON.stringify(sources.list()));

  /* And an id nothing registered is refused rather than answered with an empty success. */
  const ghost = await sources.acquire('not-a-layer', {});
  assert.equal(ghost.ok, false);
  assert.equal(ghost.why, 'layer-unknown');

  /* ⚠ AND NO LIST OF SUPPLIERS IS WRITTEN IN THE SOURCE EITHER — the population is counted from the
     registry and js/gis-layers.js's own count-up, so the file holds no id at all. */
  const src = read('js/gis-sources.js');
  const body = src.slice(src.indexOf('function list()'), src.indexOf('function entry('));
  assert.ok(/\.list\s*\(\)/.test(body) && /sources\s*\(\)/.test(body), 'list() stopped asking the registries');
  assert.ok(!/\[\s*'[a-z]+'\s*,\s*'[a-z]+'/.test(body), 'a hand-written array of ids appeared in list()');
});

/* ══ ⑨ 「このセルは欠損か」は 1 つの関数に訊く ═════════════════════════════════════════════ */

test('R749 ⑨ the missing-cell rule is published, and it knows that ±Infinity is not a measurement', async () => {
  const { raster } = await boot();
  assert.equal(typeof raster.missing, 'function', 'js/map-ui.js would have to spell the rule a second time');
  assert.equal(typeof raster.values, 'function');

  assert.equal(raster.missing(NaN, null), true);
  assert.equal(raster.missing(Infinity, null), true);
  assert.equal(raster.missing(-Infinity, null), true);
  assert.equal(raster.missing(-9999, -9999), true, 'a declared sentinel is missing');
  /* ⚠ 0 IS A MEASUREMENT: it is an elevation of exactly sea level and a rainfall of exactly none.
     The void-as-zero mistake is the one js/map-readout.js measured at −7,800 m. */
  assert.equal(raster.missing(0, null), false);
  assert.equal(raster.missing(0, -9999), false);
  assert.equal(raster.missing(-9999, null), false, 'an undeclared sentinel is a number nobody declared');

  const grid = {
    width: 2, height: 1, bands: [{ name: 'b', unit: null, nodata: -9999 }],
    grid: { west: 0, north: 1, pixelLng: 1, pixelLat: 1 },
    read: () => [1, -9999],
  };
  const V = raster.values(grid, 0);
  assert.equal(V.ok, true, JSON.stringify(V));
  assert.equal(V.nodata, -9999);
  assert.equal(raster.missing(V.values[1], V.nodata), true);
  assert.equal(raster.missing(V.values[0], V.nodata), false);
});
