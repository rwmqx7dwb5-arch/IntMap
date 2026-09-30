/* ============================================================================
 *  GIS · LAYERS AS DATA — 供給元・完全性・取得契約・標本
 * ----------------------------------------------------------------------------
 *  js/gis-sources.js and js/gis-layers.js: a map layer read as data states how complete the read is,
 *  executes the conditions it claims to, pages without gaps, samples the same values whether it is
 *  drawn or not, and reaches what it declares — the aircraft feed included.
 *
 *  ⚠ ONE BLOCK PER ROUND, AND EACH BLOCK IS ISOLATED. The rounds below used to be files of their own,
 *  each in its own process; `isolate()` (tests/helpers/geo-shared.mjs) gives every block back the
 *  globalThis a fresh process had, so no block reads a `window` another one left behind. Test titles
 *  carry the round that wrote them (#R<N>), and each block keeps that round's own account of WHY.
 * ==========================================================================*/

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installWindow, isolate, read } from './helpers/geo-shared.mjs';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R749 · suppliers and completeness   (was tests/r749-gis-sources-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
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
describe('§ #R749 · suppliers and completeness', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

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

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R756 · the supplier executes what it claims   (was tests/r756-gis-supply-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R756 · 地図が本当に持っているものを、供給元として訊けるようにした
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  「supply() が呼ばれている」 is a sentence about an implementation and it passes over a wrong one.
 *  What was measured in the shipped code before this round, and what the reader LOST by it:
 *
 *    ① js/gis-sources.js supply() had ZERO call sites in the repository, and prepare() refuses
 *       `where` unless a registered implementation claims it — so 「M6 以上だけ渡せ」 came back
 *       `where-not-supported` FOR EVERY ID IN THE APP. Not for the rows that cannot filter: for all
 *       of them, always, because nothing could be asked. The same wall stood in front of `cursor`.
 *    ② a paged read was therefore impossible, so 「続きを」 had no answer that was not a refusal
 *    ③ `completeness:'all'` is reachable only from a declaration, and declare()'s only caller in the
 *       shipped app is the upload path — so a BUILT-IN layer could not reach it whatever it held.
 *       js/map-ui.js state() assembles six fields for a reader and a claim about what a source
 *       CONTAINS is not one of them, so the statement died at the registry door.
 *    ④ a capability is a claim, and a claim that is not executed is worse than a refusal: a supplier
 *       saying `where:true` and handing back every row answers a question nobody asked, with real
 *       data. So the executor is measured against js/gis-ops.js's own filter, operator by operator.
 *    ⑤ 「どのレイヤーが全件を持っているか」 written down anywhere is a photograph
 *       ([[intmap-discovered-list-is-a-photograph]]): the row registered next would be missing from
 *       it, silently. So a layer registered DURING this test must become suppliable by saying what
 *       it holds, with no list touched.
 *
 *  ⚠ THE REGISTRY HERE IS THE SHIPPED ONE. js/map-ui.js's layerRegistry is evaluated with a window
 *  shim and a renderer that holds features, so `heritage`, `aircraft` and `ships` are the rows the
 *  app registers, with the bodies the app registers them with — a stub registry would have measured
 *  this file's idea of the contract instead ([[intmap-r671-lessons]]: a stub that outdoes the thing
 *  it stands for repairs the bug on the way past).
 * ==========================================================================*/
describe('§ #R756 · the supplier executes what it claims', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

  /* ── the app, with a renderer that holds what we put in it ────────────────────────────────────── */

  let FACTORY = null;

  async function boot() {
    const w = {};
    globalThis.window = w;
    /* the two globals js/map-ui.js's registry touches while it is being built */
    w.IntMapLang = { pick: () => ((en) => en), t: (l, en) => en, locale: () => 'en' };
    w.addEventListener = () => { };
    globalThis.document = {
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute() { }, appendChild() { }, querySelector() { return null; } }),
    };
    w.document = globalThis.document;
    new Function('window', read('js/geodesy.js'))(w);

    /* the renderer: GeoJSON sources by id, and a camera. _srcFeatsIn reads exactly these two. */
    const sources = new Map();
    let camera = { w: -180, s: -90, e: 180, n: 90 };
    w.IntMapGeoEngine = {
      scene: { getStyle: () => ({ sources: {} }) },
      layers: {
        sourceData: (sid) => (sources.has(String(sid)) ? { type: 'FeatureCollection', features: sources.get(String(sid)) } : null),
        has: () => false, getLayout: () => 'none',
      },
      camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
      ready: () => false,
    };

    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const { makeGisSources } = await import('../js/gis-sources.js');
    w.IntMapData = makeGisDatasets();
    w.IntMapGisOps = makeGisOps();

    /* ⚠ THE MODULE PUBLISHES ITS FACTORIES ONCE PER PROCESS, onto whatever `window` existed at import
       time; a second boot gets a fresh window and would find nothing there. The factory itself is
       re-run per boot, which is what builds a fresh registry. */
    if (!FACTORY) { await import('../js/map-ui.js'); FACTORY = w.IntMapModules.layerRegistry; }
    FACTORY({
      lang: 'en', mapType: 'flat', proj: 'mercator', globalData: null, toolMode: null,
      canDraw: () => false, demElevAt: () => null,
    });

    const layers = makeGisLayers();
    const sourcesApi = makeGisSources();
    return {
      w, layers, sources: sourcesApi, data: w.IntMapData, ops: w.IntMapGisOps, registry: w.IntMapLayers,
      put: (sid, fs) => sources.set(sid, fs),
    };
  }

  /* The shipped World-Heritage row reads `whs-src`, and it is the row this file uses as 「全件を持って
     いるもの」 because that is what it says about itself — not because this file decided so. */
  const HERITAGE_SRC = 'whs-src';

  function quakeSet() {
    const out = [];
    for (let i = 0; i < 12; i++) out.push(pt(i * 0.5, 10 + i * 0.25, { id: 'q' + i, mag: 3 + i * 0.5, place: (i % 2 ? 'Honshu' : 'Kyushu') }));
    return out;
  }

  /* ══ ① 属性条件は、どのレイヤーに出しても断られていた ═══════════════════════════════════════ */

  test('R756 ① a condition on a layer that holds everything is executed, and only matching rows come back', async () => {
    const { layers, sources, put } = await boot();
    put(HERITAGE_SRC, quakeSet());

    const all = await sources.acquire('heritage', {});
    assert.equal(all.ok, true, JSON.stringify(all));
    assert.equal(all.features.length, 12);

    const got = await sources.acquire('heritage', { where: [{ field: 'mag', op: '>=', value: 6 }] });
    /* THE DEFECT ITSELF: this was `where-not-supported` for every id in the app. */
    assert.notEqual(got.ok === false && got.why, 'where-not-supported', 'the condition was refused, as it always was');
    assert.equal(got.ok, true, JSON.stringify(got));
    assert.ok(got.features.length > 0 && got.features.length < 12, 'nothing was narrowed: ' + got.features.length);
    for (const f of got.features) {
      assert.ok(f.properties.mag >= 6, 'a row that does not meet the condition came back: ' + JSON.stringify(f.properties));
    }
    /* every row that DOES meet it is there — a filter that drops matches is as wrong as one that keeps
       non-matches, and only one of the two is visible from the answer alone */
    const expected = quakeSet().filter((f) => f.properties.mag >= 6).length;
    assert.equal(got.features.length, expected);
    /* and the record says what the answer is the answer to */
    assert.equal(got.coverage.filteredBy, 'supplier');
    assert.deepEqual(got.coverage.requested.where, [{ field: 'mag', op: '>=', value: 6 }]);

    /* ⚠ AND THE SYNCHRONOUS DOOR IS STILL SYNCHRONOUS. js/gis-panel.js and js/gis-atlas.js call
       toDataset() from a click handler without an await, and js/gis-sources.js refuses a supplier that
       answers with a promise — so an implementation that awaited anything would have turned every one
       of those clicks into `supplier-is-async`, for the rows this round supplies. */
    const made = layers.toDataset('heritage', { where: [{ field: 'mag', op: '>=', value: 6 }] });
    assert.ok(made && typeof made.then !== 'function', 'toDataset stopped answering synchronously');
    assert.equal(made.ok, true, JSON.stringify(made));
    assert.equal(made.dataset.count, expected);
    assert.equal(made.dataset.provenance.coverage.completeness, 'all');
  });

  /* ══ ② ページ送りは頼めず、頼めても継ぎ目で失われうる ═══════════════════════════════════════ */

  test('R756 ② two pages joined are the one read — no duplicate, no gap', async () => {
    const { sources, put } = await boot();
    put(HERITAGE_SRC, quakeSet());

    const whole = await sources.acquire('heritage', {});
    assert.equal(whole.ok, true);
    const ids = whole.features.map((f) => f.properties.id);

    const p1 = await sources.acquire('heritage', { limit: 5 });
    assert.notEqual(p1.ok === false && p1.why, 'cursor-not-supported');
    assert.equal(p1.ok, true, JSON.stringify(p1));
    assert.equal(p1.features.length, 5);
    assert.ok(p1.next != null, 'the supplier said nothing about continuation while 7 rows remained');
    /* ⚠ 「まだある」 は供給元が述べたときだけ。三値の真ん中を使っている */
    assert.equal(p1.coverage.continues, true);

    const p2 = await sources.acquire('heritage', { cursor: p1.next });
    assert.equal(p2.ok, true, JSON.stringify(p2));
    assert.equal(p2.coverage.continues, false, 'the last page did not say it was the last');

    const joined = p1.features.concat(p2.features).map((f) => f.properties.id);
    assert.deepEqual(joined, ids, 'the pages are not the list: ' + joined.length + ' vs ' + ids.length);
    assert.equal(new Set(joined).size, joined.length, 'a row arrived twice');

    /* a cursor belonging to another layer is refused rather than read as an offset into this one */
    const alien = await sources.acquire('heritage', { cursor: 'volcanoes@3' });
    assert.equal(alien.ok, false);
    assert.equal(alien.why, 'bad-param');
  });

  /* ══ ③ 内蔵レイヤーは `all` に原理的に到達できなかった ═══════════════════════════════════════ */

  test('R756 ③ the layer that holds everything reaches all, and the camera-bound one does not', async () => {
    const { sources, registry, put, w } = await boot();
    put(HERITAGE_SRC, quakeSet());
    /* (remove-synthetic-planes) the aircraft on the map are js/aviation-live.js's GPU cloud, read
       through the surface that module publishes (snapshotFor reads the buffers the renderer draws);
       the `src-planes` GeoJSON this used to fill belonged to the removed airplanes.live sweep. The
       module is lazy and needs WebGL, so its published surface stands in for it here. */
    w.IntMapAviation = {
      isOn: () => true,
      snapshotFor: () => quakeSet().map((f, i) => ({ hex: 'a0000' + i, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], altFt: 30000, track: 90 })),
      stats: () => ({ attribution: 'adsb.lol — ODbL 1.0', provider: 'adsblol' }),
    };

    const held = await sources.acquire('heritage', {});
    assert.equal(held.ok, true);
    assert.equal(held.coverage.completeness, 'all', 'reason: ' + held.coverage.reason);

    /* ⚠ BOTH DIRECTIONS. A rule that answers `all` for everything is not a measurement, and it is the
       answer a 「とりあえず complete:true」 would give. The aircraft row holds what the CAMERA'S
       rectangle brought in from the feed, says so, and must not be able to reach it. */
    const camBound = await sources.acquire('aircraft', {});
    assert.equal(camBound.ok, true, JSON.stringify(camBound));
    assert.notEqual(camBound.coverage.completeness, 'all');
    assert.equal(camBound.coverage.reason, 'supplier-view-bound');

    /* and the two verdicts come from what the rows SAY, which is the thing that had no road here */
    assert.equal(registry.declarationOf('heritage').complete, true);
    assert.equal(registry.declarationOf('aircraft').viewBound, true);
    assert.notEqual(registry.declarationOf('aircraft').complete, true);
    assert.equal(registry.declarationOf('ships').viewBound, true);
    /* a row that says nothing about its holdings still says nothing — an absent statement is not a
       `false` one ([[intmap-data-must-not-claim-an-author-it-lacks]]) */
    assert.equal(registry.declarationOf('temp'), null);
  });

  /* ══ ④ 申告した能力は、実際に効く ═══════════════════════════════════════════════════════════ */

  test('R756 ④ what the supplier claims it executes, it executes — measured against js/gis-ops.js', async () => {
    const { sources, data, ops, put } = await boot();

    /* rows with the three shapes a comparison has to survive: numbers, text, and an empty cell */
    const rows = [
      pt(0, 0, { id: 'a', mag: 4, place: 'Kyushu', depth: '12 km' }),
      pt(1, 0, { id: 'b', mag: 6.5, place: 'honshu', depth: '30 km' }),
      pt(2, 0, { id: 'c', mag: 6.5, place: 'Hokkaido', depth: '' }),
      pt(3, 0, { id: 'd', mag: 9, place: '', depth: '5 km' }),
    ];
    put(HERITAGE_SRC, rows);

    const claim = sources.supplierOf('heritage');
    assert.ok(claim, 'no supplier was adopted for a row that says it holds everything');
    assert.equal(claim.can.where, true, 'the supplier does not claim `where`, so ④ measures nothing');

    const ds = data.add({ title: 'rows', provenance: { kind: 'import', file: 'x' }, features: rows });

    /* ⚠ EVERY OPERATOR THE APP PUBLISHES, through both executors, with the same rows. The vocabulary
       is asked for rather than typed: an operator added to js/gis-ops.js appears here by existing. */
    const vocab = sources.conditionOps();
    assert.ok(Array.isArray(vocab) && vocab.length >= 9, 'the condition vocabulary was not readable');
    const VALUE = {
      '>=': { field: 'mag', value: 6.5 }, '>': { field: 'mag', value: 6.5 },
      '<=': { field: 'mag', value: 6.5 }, '<': { field: 'mag', value: 6.5 },
      '==': { field: 'place', value: 'Kyushu' }, '!=': { field: 'place', value: 'Kyushu' },
      'contains': { field: 'place', value: 'HON' },
      'in': { field: 'mag', value: [4, 9] },
      'between': { field: 'mag', value: [5, 7] },
      /* and the empty cell, which is where the two could most easily disagree */
      'empty': { field: 'depth', value: '' },
    };
    for (const op of vocab) {
      const spec = VALUE[op];
      assert.ok(spec, 'js/gis-ops.js publishes an operator this check has no case for: ' + op);
      const where = [{ field: spec.field, op: op, value: spec.value }];

      const mine = await sources.acquire('heritage', { where: where });
      const theirs = await ops.run({ op: 'filter', inputs: [ds.id], params: { where: where } });
      assert.equal(theirs.ok, true, op + ': the kernel refused — ' + JSON.stringify(theirs));

      const kernelIds = theirs.dataset.features().map((f) => f.properties.id).sort();
      /* ⚠ 0 件は答えであって拒否ではない — js/gis-ops.js says so about its own filter, and a supplier
         that refused an empty result would make 「該当なし」 unchainable. */
      assert.equal(mine.ok, true, op + ': ' + JSON.stringify(mine));
      assert.deepEqual(mine.features.map((f) => f.properties.id).sort(), kernelIds,
        op + ': the two executors disagree — ' + JSON.stringify(mine.features.map((f) => f.properties.id)) + ' vs ' + JSON.stringify(kernelIds));
    }

    /* ⚠ AND AN OPERATOR NAME IT DOES NOT EXECUTE IS REFUSED BY NAME. Answering false for a condition
       nobody ran hands back rows as if the question had been asked. */
    const bogus = await sources.acquire('heritage', { where: [{ field: 'mag', op: 'starts-with', value: 'x' }] });
    assert.equal(bogus.ok, false);
    assert.ok(bogus.why === 'bad-param' || bogus.why === 'where-not-supported', 'got ' + bogus.why);
  });

  /* ══ ⑤ 供給元の一覧は、書かれた瞬間から古い ═══════════════════════════════════════════════ */

  test('R756 ⑤ a layer registered now is suppliable by saying what it holds — no list is touched', async () => {
    const { sources, layers, registry } = await boot();

    const fs = [pt(0, 0, { id: 'n1', v: 1 }), pt(1, 1, { id: 'n2', v: 9 })];
    const inBox = (f, b) => {
      const c = f.geometry.coordinates;
      return !b || (c[0] >= b[0][0] && c[0] <= b[1][0] && c[1] >= b[0][1] && c[1] <= b[1][1]);
    };
    registry.register('r754-new-row', {
      label: () => 'A row registered after every list was written',
      on: () => true,
      featuresIn: (b) => fs.filter((f) => inBox(f, b)),
      holds: () => ({ extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false }),
    });

    assert.ok(layers.supplierFor('r754-new-row'), 'a row that declares what it holds got no supplier');
    const got = await sources.acquire('r754-new-row', { where: [{ field: 'v', op: '>=', value: 5 }] });
    assert.equal(got.ok, true, JSON.stringify(got));
    assert.deepEqual(got.features.map((f) => f.properties.id), ['n2']);
    assert.equal(got.coverage.completeness, 'all');

    /* ⚠ AND THE DISCRIMINATION IS THE STATEMENT, NOT THE ID. The same body, saying it keeps only what
       the camera needs, gets no supplier — otherwise 「全部です」 would be answered out of whatever the
       renderer happened to be holding. */
    registry.register('r754-view-row', {
      label: () => 'A row that only keeps the camera\'s rectangle',
      on: () => true,
      featuresIn: (b) => fs.filter((f) => inBox(f, b)),
      holds: () => ({ complete: false, viewBound: true, live: true }),
    });
    assert.equal(layers.supplierFor('r754-view-row'), null);
    const refused = await sources.acquire('r754-view-row', { where: [{ field: 'v', op: '>=', value: 5 }] });
    assert.equal(refused.ok, false);
    assert.equal(refused.why, 'where-not-supported', 'a view-bound row executed a condition it cannot answer');
  });

  /* ══ ⑥ 宣言は state() の6欄を越えて届く ═════════════════════════════════════════════════════ */

  test('R756 ⑥ the declaration reaches js/gis-sources.js without anybody calling declare()', async () => {
    const { sources, put, registry } = await boot();
    put(HERITAGE_SRC, quakeSet());

    /* nothing in this test declared anything; the statement comes from the registration itself */
    const d = sources.declarationOf('heritage');
    assert.ok(d, 'the row\'s own statement did not reach the supply layer');
    assert.equal(d.complete, true);
    assert.equal(d.viewBound, false);
    assert.ok(d.extent && d.extent.w === -180 && d.extent.e === 180);

    /* ⚠ AND IT IS NOT state()'s SIX FIELDS WEARING A NEW NAME. The state a reader is shown says
       nothing about what the source contains, which is why the claim could not travel. */
    const st = registry.state('heritage');
    /* ⚠ (#729) THE CLAIM IS WHAT state() DOES NOT SAY, NOT HOW MANY KEYS IT HAS. This was a
       deepEqual against six names, which froze the row's width: #729 added `rights` — what the
       upstream's TERMS are, which is not a statement about contents either — and the frozen list
       called it a regression ([[intmap-ceiling-guards-are-not-policies]]). What must stay true is that
       the reader's row carries none of the supply layer's own vocabulary, because that is why the
       claim could not travel before #R756. */
    for (const k of ['extent', 'complete', 'viewBound', 'live', 'resolution']) {
      assert.ok(!(k in st), `registry.state() now carries the supply declaration's «${k}» — the two are one thing again`);
    }
    for (const k of ['id', 'label', 'legend', 'on', 'source', 'time']) {
      assert.ok(k in st, `registry.state() lost «${k}»`);
    }

    /* an explicit declare() still wins — it is about the id as the caller just filled it */
    sources.declare('heritage', { extent: { w: 0, s: 0, e: 1, n: 1 }, complete: false, viewBound: false });
    assert.equal(sources.declarationOf('heritage').complete, false);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R763 · numbers, not sentences   (was tests/r763-gis-raw-data-contract-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R763 · 表示用の値ではなく、原データが解析へ流れる
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]). What was wrong
 *  was NOT that a field called `number` was missing. What was wrong is this, measured on the shipped
 *  code before this round:
 *
 *      OF THE 18 REGISTRATIONS THAT IMPLEMENT A POINT SAMPLER, ZERO RETURNED A NUMBER.
 *
 *  Every one of them rounded its value and concatenated a unit onto it — 「12.3°C」, 「0.2 mm/h」,
 *  「1240 m」 — and js/gis-datasets.js asNumber refuses a cell that is not a number all the way
 *  through, correctly. So every numeric field on this map — temperature, precipitation, elevation,
 *  NO₂, sea-surface temperature, snow, annual precipitation, the five GIBS scales — answered
 *  `layer-values-not-numeric` to zonal statistics, and the ONE layer that got through (`aod`) got
 *  through because its unit string happens to be empty. 「区域統計の関数がある」 and 「内蔵の気温
 *  レイヤーで区域統計を実行できる」 were different facts, and only the first was true.
 *
 *  Three more, of the same shape — a capability implemented one level down with nothing able to
 *  reach it ([[intmap-wiring-complete-is-not-wiring-live]]):
 *
 *    · js/gis-raster.js counts `failed` apart from `empty` so 「取得に失敗した」 and 「値が無い」 stay
 *      different — and js/gis-sources.js caught the throw one level up and returned null, so `failed`
 *      was STRUCTURALLY ALWAYS 0 and the reader was told their data was text when the upstream fell over
 *    · js/gis-sources.js region() takes `time` and `band`, and js/gis-layers.js's ACQUIRE — the list a
 *      planner is validated against — did not name them, so 「2020 年と 2025 年のこの範囲」 was unsayable
 *    · js/gis-sources.js acquire() — the door that WAITS — had zero callers anywhere in js/, so a
 *      supplier that has to fetch (which is what an undrawn layer must do) could not be reached at all
 *
 *  So the invariants are about the CLAIMS, not about the fields:
 *    ① a row that measured hands over the number AND the unit, not a sentence containing both
 *    ② region() reads that number — a layer whose text is 「12.3°C」 becomes a grid of 12.3
 *    ③ 「失敗した」「全部欠損だった」「文字列だった」 are three answers, not one code
 *    ④ one pixel does not decide for the whole window
 *    ⑤ the raster vocabulary carries `time` and `band`, and toRaster hands them down
 *    ⑥ a row that states a loader is readable while it is switched off and never drawn
 *    ⑦ the loader road and the drawn road narrow with ONE predicate
 *    ⑧ the async door has a caller, and the sync door still refuses an async supplier by name
 *    ⑨ every refusal this round added is declared, and has a sentence a reader can act on
 *
 *  ⚠ THE STUBS ARE NOT MORE CAPABLE THAN THE REAL REGISTRY ([[intmap-r671-lessons]]). The fake
 *  registry below answers exactly what js/map-ui.js publishes, and its `sampleAt` composes the row
 *  the real one composes — including that a row WITHOUT `measure` gets no `number`, which is what
 *  makes ② a measurement rather than a restatement.
 * ==========================================================================*/
describe('§ #R763 · numbers, not sentences', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });

  /* ── a registry no more able than js/map-ui.js's ──────────────────────────────────────────────── */

  function makeFakeMap(w) {
    const rows = new Map();
    let camera = { w: -180, s: -90, e: 180, n: 90 };
    const inBox = (f, b) => {
      const c = f && f.geometry && f.geometry.coordinates;
      return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
    };
    const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

    w.IntMapLayers = {
      list: () => Array.from(rows.keys()),
      state: (id) => {
        const r = rows.get(String(id));
        return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
      },
      featuresIn: (id, bounds) => {
        const r = rows.get(String(id));
        /* ⚠ 「まだ描かれていない」 is null, exactly as _srcFeatsIn answers for a source that does not
           exist yet. A row with a loader and no drawn features is the case ⑥ is about. */
        if (!r || !r.features) return null;
        const b = asBox(bounds);
        return r.features.filter((f) => inBox(f, b));
      },
      featuresInSource: () => null,
      /* THE SHAPE js/map-ui.js BUILDS: a row for every registration that was ASKED (#R774), text
         always when there was one, number/unit only when the row measured. ⚠ A REGISTRATION THAT
         ANSWERS null STILL PRODUCES A ROW — that is the fact 「訊いたが、そこには値が無い」, and
         collapsing it into silence here is exactly the defect this stub must not hide. */
      sampleAt: async (lng, lat, ids) => {
        const out = [];
        for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
          const r = rows.get(String(id));
          if (!r || (!r.measure && !r.sample)) continue;
          const row = { id: String(id), label: r.label, asked: true };
          try {
            if (r.measure) {
              const q = await Promise.resolve(r.measure(lng, lat));
              if (q) {
                if (q.text != null && q.text !== '') row.value = q.text;
                if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
                if (q.code != null) row.code = q.code;
              }
            } else {
              const v = await Promise.resolve(r.sample(lng, lat));
              if (v != null && v !== '') row.value = v;
            }
          } catch (_) { row.failed = true; }
          out.push(row);
        }
        return out;
      },
      loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
      /* ⚠ THE ONE PREDICATE. ⑦ measures that js/gis-layers.js asks THIS rather than keeping its own. */
      narrow: (features, bounds) => {
        if (!Array.isArray(features)) return null;
        if (!bounds) return features.slice();
        const b = asBox(bounds);
        return features.filter((f) => inBox(f, b));
      },
      declarationOf: (id) => { const r = rows.get(String(id)); return (r && r.holds) ? r.holds : null; },
      active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
      context: () => [],
      register: (id, impl) => rows.set(String(id), impl),
    };
    w.IntMapGeoEngine = {
      scene: { getStyle: () => ({ sources: {} }) },
      layers: { sourceData: () => null },
      camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
    };
    return { rows, setCamera: (b) => { camera = b; } };
  }

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisSources } = await import('../js/gis-sources.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const map = makeFakeMap(w);
    w.IntMapData = makeGisDatasets();
    w.IntMapGisRaster = makeGisRaster();
    w.IntMapGisSources = makeGisSources();
    w.IntMapGisLayers = makeGisLayers();
    return { w, map, sources: w.IntMapGisSources, layers: w.IntMapGisLayers, data: w.IntMapData };
  }

  const WORLD = { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false };

  /* ══ ① 数と単位は、文の中ではなく別々に渡る ═══════════════════════════════════════════════════ */

  test('#R763 ① 数量を述べた行は、読者に見せる文と、その文を作った数の両方を渡す', async () => {
    const { w, map } = await boot();
    map.rows.set('temp', { label: 'Air temperature', on: true, measure: () => ({ value: 12.34, unit: '°C', text: '12.3°C' }) });
    const rows = await w.IntMapLayers.sampleAt(0, 0, ['temp']);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].value, '12.3°C', '読者に見える文は変わっていない');
    assert.equal(rows[0].number, 12.34, '丸める前の数が運ばれていない');
    assert.equal(rows[0].unit, '°C', '単位が値として運ばれていない');
  });

  test('#R763 ① js/map-ui.js の数値レイヤーは、単位を文へ畳まず measure で述べる', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（登録は js/map-ui.js の layerRegistry の中）。 */
    const src = read('js/map-ui.js');
    /* ⚠ 測っているのは「その行が measure を持つこと」であって綴りではない。単位付きの文字列を
       sampleAt から返す数値レイヤーが 1 行でも残っていれば、その行は region() から読めない。 */
    for (const id of ['temp', 'sst', 'precip', 'snow', 'aod', 'no2', 'co', 'wind', 'elevation', 'climate']) {
      const at = src.indexOf("register('" + id + "'");
      assert.ok(at > 0, id + ' の登録が見つからない');
      const body = src.slice(at, at + 1400);
      assert.ok(/measure\s*:/.test(body), id + ' はまだ表示用の文だけを返している（measure が無い）');
    }
  });

  test('#R763 ① _om は数と単位を分けて返し、文はその数から作られる', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（_om は js/map-ui.js の Open-Meteo 読み取り closure）。 */
    const src = read('js/map-ui.js');
    const at = src.indexOf('async function _om(');
    const body = src.slice(at, src.indexOf('(#R732)', at));
    assert.ok(/value\s*:\s*x/.test(body), '_om が value を返していない');
    assert.ok(/unit\s*:\s*\(/.test(body), '_om が unit を値として返していない');
    /* 文と数が 1 か所から出ていること: text は x から組み立てられる */
    assert.ok(/text\s*:\s*\(x\s*==\s*null\)/.test(body), '表示用の文が、返している数から作られていない');
  });

  /* ══ ② region() はその数を読む ═══════════════════════════════════════════════════════════════ */

  test('#R763 ② 「12.3°C」と見せる行は、12.3 の格子になる — 文字列は解析の入口ではない', async () => {
    const { map, sources } = await boot();
    map.rows.set('temp', { label: 'T', on: true, measure: (lng) => ({ value: 10 + lng, unit: '°C', text: (10 + lng).toFixed(1) + '°C' }) });
    const r = await sources.region('temp', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, true, r.why);
    const cells = Array.from(r.grid.read(0));
    assert.equal(cells.length, 4);
    for (const v of cells) assert.ok(Number.isFinite(v), '数値でないセルがある: ' + v);
    assert.equal(r.filled, 4);
  });

  test('#R763 ② 単位は帯に載る — 述べられた単位は運ばれ、発明はされない', async () => {
    const { map, sources } = await boot();
    map.rows.set('no2', { label: 'NO2', on: true, measure: () => ({ value: 12.4, unit: 'µg/m³', text: '12.4 µg/m³' }) });
    const r = await sources.region('no2', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1 });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.grid.bands[0].unit, 'µg/m³', 'レイヤーが述べた単位が帯に載っていない');

    /* 呼び手が述べた単位のほうが具体的な主張なので、そちらが勝つ */
    const r2 = await sources.region('no2', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1, band: { unit: 'ppb' } });
    assert.equal(r2.grid.bands[0].unit, 'ppb');
  });

  test('#R763 ② 数を述べない行は、今までどおり文字列として断られる（緩めてはいない）', async () => {
    const { map, sources } = await boot();
    map.rows.set('thermal', { label: 'Fires', on: true, sample: () => '37 fire pixels within ~15 km' });
    const r = await sources.region('thermal', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-values-not-numeric');
    assert.equal(r.detail.sample, '37 fire pixels within ~15 km', '何と答えたのかが読者に渡っていない');
  });

  /* ══ ③ 失敗・欠損・文字列は 3 つの答え ═══════════════════════════════════════════════════════ */

  test('#R763 ③ 全部が欠損の窓は「文字列を返す」ではなく「値がどこにも無い」と言う', async () => {
    const { map, sources } = await boot();
    /* 陸のデータを海の窓に訊いたときの形: 答えてはいるが、値はどこにも無い */
    map.rows.set('land', { label: 'Land only', on: true, measure: () => null });
    const r = await sources.region('land', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-values-all-missing', '海の窓が「このレイヤーは文字列を返す」と説明されている');
    assert.equal(r.detail.empty, 4);
  });

  test('#R763 ③ 上流が落ちた窓は「取得に失敗した」と言う — 欠損ではない', async () => {
    const { map, sources } = await boot();
    map.rows.set('down', { label: 'Upstream', on: true, measure: () => { throw new Error('502'); } });
    const r = await sources.region('down', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-sample-failed', '取得失敗が欠損か文字列に潰れている');
    assert.ok(r.detail.failed > 0, '失敗件数が数えられていない');
  });

  test('#R763 ③ js/gis-raster.js の failed と empty は重ならない（片方から他方を引けなければ差は読めない）', async () => {
    const { w } = await boot();
    const RS = w.IntMapGisRaster;
    let n = 0;
    const baked = await RS.fromSamplerAsync({
      bounds: [0, 0, 2, 2], width: 2, height: 2,
      band: { name: 'v', unit: null, nodata: null },
      /* 4 画素のうち 1 つが投げ、1 つが欠損、2 つが数 */
      sample: () => { n++; if (n === 1) throw new Error('x'); if (n === 2) return null; return 5; },
    });
    assert.equal(baked.ok, true);
    assert.equal(baked.failed, 1, '投げた画素が数えられていない');
    assert.equal(baked.empty, 1, '投げた画素が欠損にも数えられている（重複）');
    assert.equal(baked.filled, 2);
  });

  /* ══ ④ 1 点で全体を断じない ═════════════════════════════════════════════════════════════════ */

  test('#R763 ④ 中央が欠損でも、周辺に値があれば領域全体を拒まない', async () => {
    const { map, sources } = await boot();
    /* 表示がオフで、窓の中央だけが欠損 — 出荷前はこれだけで窓全体が layer-not-visible だった */
    map.rows.set('patchy', {
      label: 'Patchy', on: false,
      measure: (lng, lat) => ((Math.abs(lng - 1) < 0.01 && Math.abs(lat - 1) < 0.01) ? null : { value: 7, unit: 'm', text: '7 m' }),
    });
    const r = await sources.region('patchy', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, true, '中央 1 点の欠損で窓全体が拒まれた: ' + r.why);
  });

  /* ⚠⚠⚠ (#R774) この検査が測っていた事実は変わった。以前の実装は「5 点のどこかに値があるか」で
     窓全体を断じていたので、値を 1 つも返さないオフの行は `layer-not-visible`（＝訊けなかった）と
     呼ばれていた。いまは「訊いたか」と「値があったか」が別の観測なので、答えはした行は窓まで読まれ、
     どこにも値が無ければ `layer-values-all-missing`——「そこには無い」という別の事実になる。
     ⚠ 通すために緩めたのではない。断られることは変わっておらず、断り方の主語が
     「レイヤーの表示」から「データ」へ移った。本当に答えない行は下の検査が測る。 */
  test('#R763 ④ 答えはするが値を持たないオフのレイヤーは「そこに値が無い」と断られる（「見えていない」ではない）', async () => {
    const { map, sources } = await boot();
    map.rows.set('off', { label: 'Off', on: false, measure: () => null });
    const r = await sources.region('off', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-values-all-missing', '訊けた行が「訊けなかった」と説明されている');
    assert.equal(r.detail.empty, 4, 'どれだけ空だったのかが読者に渡っていない');
  });

  test('#R763 ④ 本当に答えない行は、今までどおり名前を付けて断られる', async () => {
    const { map, sources } = await boot();
    /* 標本を取る扉が 1 つも無い登録＝ sampleAt が行を返さない＝「訊けなかった」 */
    map.rows.set('mute', { label: 'Mute', on: false });
    const r = await sources.region('mute', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-not-visible');
    assert.ok(r.detail.probes > 1, 'いくつ試したのかが述べられていない');
  });

  /* ══ ⑤ 取得語彙が time と band を運ぶ ═════════════════════════════════════════════════════════ */

  test('#R763 ⑤ ラスタの取得語彙に time と band が在る — 下で実装されていたものが名乗れる', async () => {
    const { layers } = await boot();
    const f = layers.acquireFields('raster');
    assert.ok(f.indexOf('time') >= 0, 'raster の取得語彙に time が無い');
    assert.ok(f.indexOf('band') >= 0, 'raster の取得語彙に band が無い');
    /* ⚠ 一覧は 1 つ。ここで綴りを並べ直さず、vector 側が失っていないことだけを測る。 */
    for (const k of ['bounds', 'width', 'height', 'where', 'unit']) assert.ok(f.indexOf(k) >= 0, k + ' が語彙から消えた');
  });

  test('#R763 ⑤ toRaster は time を region へ渡す — 語彙に在ることと届くことは別', async () => {
    const { map, layers } = await boot();
    map.rows.set('t', { label: 'T', on: true, time: '2020', measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
    const r = await layers.toRaster('t', { bounds: { w: 0, s: 0, e: 1, n: 1 }, width: 1, height: 1, time: '2020' });
    assert.equal(r.ok, true, r.why);
    const cov = r.dataset.provenance.coverage;
    assert.equal(cov.requested.time, '2020', '求めた時点が coverage に届いていない');
  });

  test('#R763 ⑤ 1 地点 1 値の供給元に帯を指定したら、黙って 0 番を返さず名前を付けて断る', async () => {
    const { map, sources } = await boot();
    map.rows.set('t', { label: 'T', on: true, measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
    const r = await sources.region('t', { w: 0, s: 0, e: 1, n: 1 }, { width: 1, height: 1, band: { index: 2 } });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'band-not-selectable');
  });

  /* ══ ⑥ 表示していないレイヤーから取得できる ═══════════════════════════════════════════════════ */

  test('#R763 ⑥ 一度も描かれていない行でも、loader を述べていれば読める', async () => {
    const { map, layers } = await boot();
    let drew = 0;
    map.rows.set('heritage', {
      label: 'WHS', on: false, holds: WORLD,
      /* features は無い = レンダラのソースがまだ無い。出荷前はこれで供給元になれなかった。 */
      load: async () => { drew++; return [pt(1, 1, { n: 'A' }), pt(50, 50, { n: 'B' })]; },
    });
    const r = await layers.acquireDataset('heritage', {});
    assert.equal(r.ok, true, '未表示のレイヤーが読めない: ' + r.why);
    assert.equal(r.dataset.features().length, 2);
    assert.equal(drew, 1, 'loader が呼ばれていない');
  });

  test('#R763 ⑥ loader が失敗したら「表示をオンにしろ」ではなく「読み込めなかった」と言う', async () => {
    const { map, layers } = await boot();
    map.rows.set('heritage', { label: 'WHS', on: false, holds: WORLD, load: async () => { throw new Error('offline'); } });
    const r = await layers.acquireDataset('heritage', {});
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-load-failed', '読み込み失敗が表示の話にされている');
  });

  test('#R763 ⑥ js/map-ui.js の 3 行が、描かずに渡す扉を実際に述べている', () => {
    /* 綴りのまま: 対象は描画エンジンか DOM の上で組み立てられる closure の中にあり、Node で呼べる扉が無い（登録は js/map-ui.js の layerRegistry の中）。 */
    const src = read('js/map-ui.js');
    for (const id of ['volcanoes', 'heritage', 'pharma']) {
      const at = src.indexOf("register('" + id + "'");
      assert.ok(at > 0, id + ' の登録が無い');
      assert.ok(/load\s*:/.test(src.slice(at, at + 2600)), id + ' は complete と述べているのに、描かずに渡す扉が無い');
    }
    /* その扉の実体が在ること — 宣言だけして実装が無いのは #R759 が記録した形そのもの */
    assert.ok(/function featuresOf\(/.test(read('js/beta-overlays.js')), 'js/beta-overlays.js に featuresOf が無い');
  });

  /* ══ ⑦ 範囲の判定は 1 つ ═════════════════════════════════════════════════════════════════════ */

  test('#R763 ⑦ loader 経路の絞り込みは、描画経路と同じ predicate を通る', async () => {
    const { map, layers } = await boot();
    map.rows.set('heritage', {
      label: 'WHS', on: false, holds: WORLD,
      load: async () => [pt(1, 1), pt(50, 50)],
    });
    const r = await layers.acquireDataset('heritage', { bounds: { w: 0, s: 0, e: 10, n: 10 } });
    assert.equal(r.ok, true, r.why);
    assert.equal(r.dataset.features().length, 1, '範囲の外の地物が混ざっている');

    /* ⚠ そしてそれは、この file が自分で書いた判定ではない: レジストリが narrow を持たなければ
       範囲つきの依頼は答えられないと述べる（黙って自前の判定に落ちない）。 */
    const src = read('js/gis-layers.js');
    const at = src.indexOf('async function loadedFetch(');
    const body = src.slice(at, at + 1400);
    assert.ok(/R\.narrow\(/.test(body), 'loader 経路が自前の範囲判定を持っている');
    assert.ok(/IntMapLayers\.narrow/.test(body), 'narrow が無いときに、それを名指して断っていない');
  });

  /* ══ ⑧ 非同期の扉に呼び手が居る ═══════════════════════════════════════════════════════════════ */

  test('#R763 ⑧ 同期の扉は、待つ必要のある供給元を今までどおり名前を付けて断る', async () => {
    const { map, sources } = await boot();
    map.rows.set('heritage', { label: 'WHS', on: false, holds: WORLD, load: async () => [pt(1, 1)] });
    const r = sources.features('heritage', {});
    assert.equal(r.ok, false);
    assert.equal(r.why, 'supplier-is-async', '非同期の供給元が同期の扉で呼ばれて捨てられている');
    assert.equal(r.detail.use, 'acquire');
  });

  test('#R763 ⑧ js/gis-atlas.js は待つほうの扉を使う — 実装済みで呼び手が 0 だったのが欠陥だった', async () => {
    /* ⚠ 評価で測る（以前は js/gis-atlas.js を読み、`await layers.acquireDataset(` の綴りを探していた）。
       綴りは「その行が実行される」ことを言わない——欠陥は「実装済みで呼び手が 0」だったのだから、
       測るべきは呼ばれるかどうかである。planner に両方の扉を持つ層を渡し、地図のレイヤーから
       始まる 1 手を実行して、どちらの扉が叩かれたかを数える。待つほうの扉は約束を返し、その約束を
       待たなければ dataset は得られない——同期の扉へ落ちれば、その呼び出しがここに残る。 */
    const w = installWindow();
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisGeometry } = await import('../js/gis-geometry.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisAtlas } = await import('../js/gis-atlas.js');
    const data = makeGisDatasets(), geometry = makeGisGeometry(), ops = makeGisOps();
    w.IntMapData = data; w.IntMapGisGeometry = geometry; w.IntMapGisOps = ops;
    await geometry.ready();
    const knocked = [];
    const answer = (door) => { knocked.push(door); return { ok: true, dataset: data.add({ title: 'volcanoes', features: [pt(1, 1, { v: 1 }), pt(2, 2, { v: 2 })] }) }; };
    const layers = {
      acquireFields: () => ['bounds', 'where', 'fields', 'limit', 'cursor', 'time'],
      sources: () => [{ id: 'volcanoes', label: 'Volcanoes', geometryType: 'Point', count: 2 }],
      canSample: () => false,
      toDataset: () => answer('toDataset'),
      acquireDataset: () => new Promise((res) => setTimeout(() => res(answer('acquireDataset')), 5)),
      toRaster: async () => ({ ok: false, why: 'layer-not-sampling' }),
    };
    w.IntMapGisLayers = layers;
    const atlas = makeGisAtlas({ data, ops, layers, draw: () => ({ ok: true, sid: 'ugj-1' }) });
    const r = await atlas.run({ op: 'buffer', inputs: ['layer:volcanoes'], params: { radiusKm: 5 } });
    assert.equal(r.ok, true, 'a step from a map layer did not run: ' + r.why + ' ' + JSON.stringify(r.detail));
    assert.deepEqual(knocked, ['acquireDataset'], 'planner がまだ同期の扉しか使っていない（叩かれた扉: ' + knocked.join(', ') + '）');
  });

  test('#R763 ⑧ 両方の扉が同じ要求を組み立てる（2 つ目の綴りを作らない）', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない。 */
    const src = read('js/gis-layers.js');
    assert.ok(/function acquireReq\(o\)/.test(src), '要求の組み立てが 1 か所になっていない');
    /* ⚠ (#R819) 測るのは**綴りではなく不変条件**である。ここは長く `(features|acquire)` という
       2 語を固定していて、非同期の扉が `acquirePlanned` になった瞬間に落ちた——保たれていたのは
       「要求の組み立ては acquireReq 1 か所」という不変条件のほうで、落ちたのは検査が知っていた
       名前のほう。⇒ どの method 名であれ、SRC() の扉へ渡る要求が acquireReq から来ていることを数える
       （.agents/rules/no-ad-hoc-hardcoding.md: 規則は関数ではなく事実に付ける）。 */
    const calls = src.match(/SRC\(\)\.\w+\(id, acquireReq\(o\)\)/g) || [];
    assert.equal(calls.length, 2, '片方の扉が自前で要求を組み立てている: ' + calls.length);
  });

  /* ══ ⑨ 足した拒否は、宣言され、読者に文がある ═══════════════════════════════════════════════ */

  /* ⚠ 文は「パネルの綴りに在る」ではなく「パネルを評価すると出てくる」で測る（以前は下の 2 つの
     検査とも js/gis-panel.js を文字列として探していた）。綴りは、fallback の return より下に置かれた
     行や、届かない分岐の中の行でも「在る」と答える。だからパネルを組み立てて en と jp で訊く。
     fallback はコードをそのまま運ぶので、答えにコードが混ざっていれば、それは誰も文を書かなかった
     コードである。 */
  const NEW_CODES = ['layer-sample-failed', 'layer-values-all-missing', 'band-not-selectable', 'layer-load-failed', 'layer-is-a-field'];
  async function sentencesFor(codes) {
    const said = [];
    window.IntMapLang = { t: (which, en, jp) => { said.push([which, en, jp]); return which === 'jp' ? jp : en; }, locale: () => 'en-US' };
    const { makeGisPanel } = await import('../js/gis-panel.js');
    const out = { en: {}, jp: {} };
    for (const which of ['en', 'jp']) {
      const panel = makeGisPanel({ lang: which });
      assert.ok(panel.reasonText('r763-not-a-real-code').includes('r763-not-a-real-code'), 'the fallback no longer carries the code — a sentence cannot be told from it');
      for (const code of codes) { said.length = 0; out[which][code] = { text: panel.reasonText(code, {}), said: said.slice() }; }
    }
    return out;
  }
  const worded = (s, code) => typeof s.text === 'string' && s.text.length > 0 && s.text.indexOf(code) < 0;

  test('#R763 ⑨ この回が足した拒否コードは、どれも宣言され、読者への文を持つ', async () => {
    const { sources } = await boot();
    const declared = sources.refusalCodes();
    const S = await sentencesFor(NEW_CODES);
    for (const code of ['layer-sample-failed', 'layer-values-all-missing', 'band-not-selectable']) {
      assert.ok(declared.indexOf(code) >= 0, code + ' が js/gis-sources.js の REFUSALS に無い');
      assert.ok(worded(S.en[code], code), code + ' に読者への文が無い: ' + S.en[code].text);
    }
    /* js/gis-layers.js が返すほうの 2 つ（供給元の一覧ではないので REFUSALS には無い） */
    for (const code of ['layer-load-failed', 'layer-is-a-field']) {
      assert.ok(worded(S.en[code], code), code + ' に読者への文が無い: ' + S.en[code].text);
    }
  });

  test('#R763 ⑨ 新しい文は英語と日本語の両方を持つ（CONSTITUTION §7）', async () => {
    installWindow();
    const S = await sentencesFor(NEW_CODES);
    for (const code of NEW_CODES) {
      assert.ok(worded(S.en[code], code), code + ' の行が無い（英語で fallback に落ちた）');
      assert.ok(worded(S.jp[code], code), code + ' の行が無い（日本語で fallback に落ちた）');
      /* 行が t() に渡した引数そのもの: jp の位置が空なら、日本語の読者には undefined が出る */
      assert.ok(S.jp[code].said.length > 0 && S.jp[code].said.every(([, , jp]) => typeof jp === 'string' && jp.length > 0),
        code + ' に en と jp が揃っていない');
      assert.notEqual(S.jp[code].text, S.en[code].text, code + ' の日本語が英語と同じ文である');
    }
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R774 · sampling does not depend on visibility   (was tests/r774-gis-probe-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R774 · 表示状態は、取得の答えを変えない
 * ----------------------------------------------------------------------------
 *  ⚠ THE DEFECT, RESTATED AS THE DEFECT ([[intmap-restate-the-defect-not-the-fix]]). What was wrong
 *  was NOT that the probe had too few points. What was wrong is this, reproduced by an outside audit
 *  on the shipped code:
 *
 *      ONE WINDOW, ONE SUPPLIER, ONE QUESTION — AND TWO ANSWERS, DECIDED BY A CHECKBOX.
 *
 *  A field over [0,0]–[1,1] holding a value in its north-east pixel and nothing anywhere else was
 *  read normally while its layer was switched on (100 positions asked, one value returned), and
 *  refused `layer-not-visible` while it was switched off — because the off road asked five fractions
 *  of the window for a NUMBER and called their silence 「この供給元には訊けなかった」.
 *
 *  That is a proxy predicate ([[intmap-proxy-predicate-freezes-the-wrong-diagnosis]]): the probe
 *  wants to know 「この供給元は答えるか」 and was measuring 「この 5 座標に値があるか」. Adding points
 *  would move the corner it gets wrong and leave the shape intact
 *  (.agents/rules/no-ad-hoc-hardcoding.md §1) — so what is separated is the two facts, at the door
 *  they were merged at: js/map-ui.js's sampleAt returned NO ROW for a registration it had asked and
 *  got null from, which is the same silence as 「訊ける登録が無い」.
 *
 *  So the invariants here are about the ANSWER, never about the probe:
 *    ① the same window, the same supplier, the same answer — with the layer on and with it off
 *    ② a supplier that answers nothing at all is still refused as 「訊けなかった」, on or off
 *    ③ a supplier that answers everywhere with no value is 「そこに値が無い」, which is a different
 *       refusal with its own sentence
 *    ④ a supplier that throws at every probe is still 「取得に失敗した」
 *    ⑤ the door itself: js/map-ui.js's sampleAt hands back a row for every registration it asked
 *
 *  ⚠ NOTHING BELOW MEASURES HOW MANY POINTS ARE PROBED OR WHERE THEY ARE. That is implementation;
 *  a check on it would be the ceiling-guard-as-policy this repository has recorded
 *  ([[intmap-ceiling-guards-are-not-policies]]).
 *  ⚠ AND ⑤ EVALUATES THE SHIPPED FUNCTION rather than reading its source
 *  ([[intmap-edge-function-must-be-evaluated]]): the fix lives in js/map-ui.js, and a regex over it
 *  would pass on code that never runs.
 * ==========================================================================*/
describe('§ #R774 · sampling does not depend on visibility', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  /* ── a registry no more able than js/map-ui.js's (⑤ measures that this is true) ───────────────── */

  function makeFakeMap(w) {
    const rows = new Map();
    w.IntMapLayers = {
      list: () => Array.from(rows.keys()),
      state: (id) => {
        const r = rows.get(String(id));
        return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
      },
      featuresIn: () => null,
      featuresInSource: () => null,
      /* THE SHAPE js/map-ui.js BUILDS (#R774): a row for every registration that was ASKED, with a
         `value` only when there was one. */
      sampleAt: async (lng, lat, ids) => {
        const out = [];
        for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
          const r = rows.get(String(id));
          if (!r || !r.measure) continue;
          const row = { id: String(id), label: r.label, asked: true };
          try {
            const q = await Promise.resolve(r.measure(lng, lat));
            if (q) {
              if (q.text != null && q.text !== '') row.value = q.text;
              if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
            }
          } catch (_) { row.failed = true; }
          out.push(row);
        }
        return out;
      },
      declarationOf: () => null,
      active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
      context: () => [],
      register: (id, impl) => rows.set(String(id), impl),
    };
    w.IntMapGeoEngine = {
      scene: { getStyle: () => ({ sources: {} }) },
      layers: { sourceData: () => null },
      camera: { getBounds: () => ({ getWest: () => -180, getSouth: () => -90, getEast: () => 180, getNorth: () => 90 }) },
    };
    return { rows };
  }

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisSources } = await import('../js/gis-sources.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const map = makeFakeMap(w);
    w.IntMapData = makeGisDatasets();
    w.IntMapGisRaster = makeGisRaster();
    w.IntMapGisSources = makeGisSources();
    w.IntMapGisLayers = makeGisLayers();
    return { w, map, sources: w.IntMapGisSources };
  }

  /* The window the audit used, and a field whose ONLY value sits in its north-east pixel. ⚠ The value
     is placed by COORDINATE, not by pixel index: the read must find it through the geometry it builds
     itself, and a fixture that counted calls would be measuring the loop instead of the answer. */
  const BOX = { w: 0, s: 0, e: 1, n: 1 };
  const SIZE = { width: 10, height: 10 };
  const cornerOnly = (lng, lat) => ((lng > 0.9 && lat > 0.9) ? { value: 42, unit: 'm', text: '42 m' } : null);

  /* ══ ① 同じ窓・同じ供給元・同じ答え ═══════════════════════════════════════════════════════════ */

  test('#R774 ① 北東の 1 画素だけが値を持つ場は、表示が ON でも OFF でも同じ答えを返す', async () => {
    const ask = async (on) => {
      const { map, sources } = await boot();
      map.rows.set('patchy', { label: 'Patchy field', on: on, measure: cornerOnly });
      const r = await sources.region('patchy', BOX, SIZE);
      return r;
    };
    const on = await ask(true);
    const off = await ask(false);

    assert.equal(on.ok, true, '表示 ON でも読めていない: ' + on.why);
    assert.equal(off.ok, true, '表示 OFF のとき、供給元が答えた窓が拒まれている: ' + off.why);
    /* ⚠ THE INVARIANT IS THE EQUALITY, not either side's number. */
    assert.equal(off.filled, on.filled, '表示状態で有効セル数が変わっている');
    assert.equal(off.empty, on.empty, '表示状態で欠損セル数が変わっている');
    assert.equal(off.failed, on.failed);
    assert.deepEqual(Array.from(off.grid.read(0)), Array.from(on.grid.read(0)), '表示状態で格子の中身が変わっている');
    /* そして、答えは実際にその 1 画素である（等しいが両方とも空、では測っていない） */
    assert.equal(on.filled, 1);
    assert.ok(Array.from(on.grid.read(0)).some((v) => v === 42), '北東の値 42 が格子に入っていない');
  });

  /* ══ ② 本当に答えない供給元は、表示状態によらず「訊けなかった」 ═══════════════════════════════ */

  test('#R774 ② 標本を取る扉を持たない行は、ON でも OFF でも layer-not-visible で断られる', async () => {
    const ask = async (on) => {
      const { map, sources } = await boot();
      map.rows.set('mute', { label: 'Mute', on: on });
      return sources.region('mute', BOX, SIZE);
    };
    for (const on of [true, false]) {
      const r = await ask(on);
      assert.equal(r.ok, false, '答えない行が成功を返した (on=' + on + ')');
      assert.equal(r.why, 'layer-not-visible', '「訊けなかった」が別の名前で呼ばれた (on=' + on + '): ' + r.why);
    }
  });

  /* ══ ③ 答えたが値が無いのは、別の事実 ═══════════════════════════════════════════════════════ */

  test('#R774 ③ どこでも答えるが値をどこにも持たない場は layer-values-all-missing（layer-not-visible ではない）', async () => {
    for (const on of [true, false]) {
      const { map, sources } = await boot();
      map.rows.set('ocean', { label: 'Land only', on: on, measure: () => null });
      const r = await sources.region('ocean', BOX, SIZE);
      assert.equal(r.ok, false);
      assert.equal(r.why, 'layer-values-all-missing', '訊けた行が「訊けなかった」と説明されている (on=' + on + ')');
      assert.equal(r.detail.empty, 100, 'どれだけ空だったのかが読者に渡っていない');
    }
  });

  /* ══ ④ 全部投げたら、それは取得の失敗 ═══════════════════════════════════════════════════════ */

  test('#R774 ④ 供給元が投げ続ける場は、表示が OFF でも layer-sample-failed', async () => {
    const { map, sources } = await boot();
    map.rows.set('down', { label: 'Upstream', on: false, measure: () => { throw new Error('502'); } });
    const r = await sources.region('down', BOX, SIZE);
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-sample-failed', '取得失敗が欠損か不可視に潰れている: ' + r.why);
  });

  /* ══ ⑤ 根を実際に評価する — js/map-ui.js の sampleAt ═══════════════════════════════════════ */

  /* ⚠ THE SHIPPED FUNCTION, RUN. js/map-ui.js needs a DOM to load whole, so the one function the fix
     lives in is lifted out and evaluated against the two collaborators it closes over (`REG`, `state`).
     Those are the registry's own, and nothing here is more capable than they are. */
  function shippedSampleAt(REG) {
    const src = read('js/map-ui.js');
    const a = src.indexOf('async function sampleAt(lng,lat,ids){');
    assert.ok(a > 0, 'js/map-ui.js の sampleAt が見つからない（名前が変わったなら、この検査も変える）');
    const b = src.indexOf('function featuresIn(', a);
    assert.ok(b > a, 'sampleAt の終端が見つからない');
    const body = src.slice(a, b);
    const state = (id) => ({ id: id, on: !!(REG[id] && REG[id].on), label: (REG[id] && REG[id].label) || id });
    const activeIds = () => Object.keys(REG);
    return new Function('REG', 'state', 'activeIds', body + '\nreturn sampleAt;')(REG, state, activeIds);
  }

  test('#R774 ⑤ 訊いた登録は必ず 1 行返る — 値が無いことは、行が無いことではない', async () => {
    const REG = {
      hasValue: { label: 'Has', measure: () => ({ value: 7, unit: 'm', text: '7 m' }) },
      noValue: { label: 'None', measure: () => null },
      threw: { label: 'Threw', measure: () => { throw new Error('x'); } },
      silent: { label: 'Silent' },                 /* 扉が無い＝訊いていない */
    };
    const sampleAt = shippedSampleAt(REG);
    const rows = await sampleAt(0, 0, ['hasValue', 'noValue', 'threw', 'silent']);
    const by = (id) => rows.find((r) => r.id === id);

    assert.equal(rows.length, 3, '訊いた登録の数と行の数が合わない: ' + JSON.stringify(rows));
    assert.equal(by('silent'), undefined, '訊いていない登録が行を持っている');

    assert.equal(by('hasValue').value, '7 m', '読者に見える文が変わっている');
    assert.equal(by('hasValue').number, 7, '数が運ばれていない');
    assert.equal(by('hasValue').unit, 'm');

    /* ⚠ THE ROW THAT IS THE WHOLE POINT: asked, and there was nothing there. */
    assert.ok(by('noValue'), '値の無い地点で、訊いた登録の行が消えている');
    assert.equal(by('noValue').asked, true, '行が「訊いた」と述べていない');
    assert.equal(by('noValue').value, undefined, '値が無いのに値の欄がある');
    assert.equal(by('noValue').failed, undefined, '値が無いことが失敗として報告されている');

    assert.equal(by('threw').failed, true, '投げた登録が失敗として報告されていない');
    assert.equal(by('threw').value, undefined);
  });

  ISOLATED.built();
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   § #R783 · the fetch contract   (was tests/r783-gis-fetch-contract-checks.test.mjs)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/* ============================================================================
 *  #R783 · 取得は、宣言したとおりに実行される（表示状態とは無関係に）
 * ----------------------------------------------------------------------------
 *  ⚠ THE INVARIANTS ARE THE DEFECT, NOT THE FIX ([[intmap-restate-the-defect-not-the-fix]]).
 *  What was MEASURED on the shipped code, with one row holding three features v=1,2,3 reachable only
 *  through its loader (never drawn) — the road #R763 added for 「表示していないレイヤーから取得する」:
 *
 *      where v>=2              → 1, 2, 3     (the condition was never applied)
 *      limit 1                 → 1, 2, 3     with next:null — 「これで全部」 about a page of one
 *      limit 1, cursor "doc@1" → 1, 2, 3     the position was never read
 *      coverage.filteredBy     → "supplier"  over every one of those answers
 *
 *  js/gis-layers.js supplierFor() DECLARES `where:true, cursor:true, limit:true` for that road, and
 *  js/gis-sources.js prepare() lets a condition through precisely because a supplier claimed it can
 *  execute one — a declaration is a claimant, which is the whole argument `completeness:'all'` is
 *  built on, and here the claim was simply false. So a reader (or Atlas) asking 「M6 以上を 1 件ずつ」
 *  of an undrawn layer was handed every row it held, in a record saying the supplier had filtered.
 *
 *  Two more of the same family:
 *
 *    ② canSample() answered `state(id).on` — 「いま表示されているか」 — and js/gis-atlas.js publishes
 *       that answer to the planner as `samplable`, which is a word about the LAYER'S ABILITY.
 *       MEASURED: a numeric row switched off reported 「値を訊けない」 (the data did not change; a
 *       checkbox did), and a row with NO sampler at all, switched on, reported 「訊ける」. It is the
 *       assumption #R774 removed one level down (js/gis-sources.js region() probes rather than
 *       reading 「off ⇒ no values」) still standing at the door above it.
 *    ③ the cursor was `<layer>@<offset>` — a position in WHICHEVER list that layer hands over next.
 *       MEASURED: page 1 of the drawn row answered v=1 and handed back `drawn@1`; the same cursor
 *       returned WITH AN ATTRIBUTE CONDITION ADDED answered v=3 — position 1 of a different,
 *       filtered set — `ok:true`, and nothing in the coverage said so. A reader paging to the end of
 *       that sequence has skipped a row and been told the window was exhausted.
 *
 *  ⚠ THE ONE CONDITION THE AUDIT NAMED, AND ① IS IT: the same request answered from the document and
 *  answered from the renderer must return the same ids, the same count and the same continuation —
 *  because only then is the acquisition independent of what is on screen, which is the entire reason
 *  js/gis-sources.js and the supply contract exist.
 *
 *  ⚠ THE STUB REGISTRY IS NO MORE CAPABLE THAN js/map-ui.js's ([[intmap-r671-lessons]]): `featuresIn`
 *  answers null for a row the renderer has not drawn (exactly as _srcFeatsIn does for a source that
 *  does not exist yet), `loaderOf` hands back a row's own `load`, `narrow` is the one box predicate,
 *  and `sampleAt` hands back a ROW for every registration it asked and a value only when there was
 *  one (#R774) — including a row with no value at all, which is what ② measures against.
 * ==========================================================================*/
describe('§ #R783 · the fetch contract', () => {
  const ISOLATED = isolate();
  before(ISOLATED.enter);
  after(ISOLATED.leave);

  const pt = (lng, lat, p) => ({ type: 'Feature', properties: p || {}, geometry: { type: 'Point', coordinates: [lng, lat] } });
  const WORLD = { extent: { w: -180, s: -90, e: 180, n: 90 }, complete: true, viewBound: false, live: false };

  /* ── a registry that answers what js/map-ui.js's answers ──────────────────────────────────────── */

  function makeFakeMap(w) {
    const rows = new Map();
    let camera = { w: -180, s: -90, e: 180, n: 90 };
    const inBox = (f, b) => {
      const c = f && f.geometry && f.geometry.coordinates;
      return !!c && c[0] >= b.w && c[0] <= b.e && c[1] >= b.s && c[1] <= b.n;
    };
    const asBox = (bounds) => (bounds ? { w: bounds[0][0], s: bounds[0][1], e: bounds[1][0], n: bounds[1][1] } : { ...camera });

    w.IntMapLayers = {
      list: () => Array.from(rows.keys()),
      state: (id) => {
        const r = rows.get(String(id));
        return r ? { id: String(id), on: !!r.on, label: r.label, time: r.time || null, source: null, legend: null } : null;
      },
      /* ⚠ null IS 「まだ描かれていない」, which is what makes the loader road reachable at all. */
      featuresIn: (id, bounds) => {
        const r = rows.get(String(id));
        if (!r || !r.features) return null;
        const b = asBox(bounds);
        return r.features.filter((f) => inBox(f, b));
      },
      featuresInSource: () => null,
      sampleAt: async (lng, lat, ids) => {
        const out = [];
        for (const id of (ids && ids.length ? ids : Array.from(rows.keys()))) {
          const r = rows.get(String(id));
          if (!r || !r.measure) continue;                 /* no sampler registered: no row, ever */
          const row = { id: String(id), label: r.label, asked: true };
          try {
            const q = await Promise.resolve(r.measure(lng, lat));
            if (q && typeof q === 'object') {
              if (q.text != null) row.value = q.text;
              if (typeof q.value === 'number') { row.number = q.value; if (q.unit != null) row.unit = q.unit; }
            }
          } catch (_) { row.failed = true; }
          out.push(row);
        }
        return out;
      },
      loaderOf: (id) => { const r = rows.get(String(id)); return (r && typeof r.load === 'function') ? (() => r.load()) : null; },
      narrow: (features, bounds) => {
        if (!Array.isArray(features)) return null;
        if (!bounds) return features.slice();
        const b = asBox(bounds);
        return features.filter((f) => inBox(f, b));
      },
      declarationOf: (id) => { const r = rows.get(String(id)); return (r && r.holds) ? r.holds : null; },
      active: () => Array.from(rows.keys()).filter((id) => rows.get(id).on),
      context: () => [],
    };
    w.IntMapGeoEngine = {
      scene: { getStyle: () => ({ sources: {} }) },
      layers: { sourceData: () => null },
      camera: { getBounds: () => ({ getWest: () => camera.w, getSouth: () => camera.s, getEast: () => camera.e, getNorth: () => camera.n }) },
    };
    return { rows, setCamera: (b) => { camera = b; } };
  }

  async function boot() {
    const w = {};
    globalThis.window = w;
    new Function('window', read('js/geodesy.js'))(w);
    const { makeGisDatasets } = await import('../js/gis-datasets.js');
    const { makeGisOps } = await import('../js/gis-ops.js');
    const { makeGisRaster } = await import('../js/gis-raster.js');
    const { makeGisSources } = await import('../js/gis-sources.js');
    const { makeGisLayers } = await import('../js/gis-layers.js');
    const map = makeFakeMap(w);
    w.IntMapData = makeGisDatasets();
    w.IntMapGisOps = makeGisOps();
    w.IntMapGisRaster = makeGisRaster();
    w.IntMapGisSources = makeGisSources();
    w.IntMapGisLayers = makeGisLayers();
    return { w, map, sources: w.IntMapGisSources, layers: w.IntMapGisLayers };
  }

  /* THE THREE ROWS, AND THE TWO ROADS TO THEM. ⚠ THE SAME ID BOTH TIMES — that is the point: a cursor
     and a page must not depend on which road answered, and comparing two different ids would compare
     two different answers instead. `drawn` puts them in the renderer (featuresIn answers);
     `doc` hands them over through the row's own loader and leaves the renderer empty. */
  const TRIPLE = () => [pt(1, 1, { v: 1, nm: 'a' }), pt(2, 2, { v: 2, nm: 'b' }), pt(3, 3, { v: 3, nm: 'c' })];

  function put(map, sources, road, extra) {
    const row = Object.assign({ label: 'Row', on: true, holds: WORLD }, extra || {});
    if (road === 'drawn') row.features = TRIPLE();
    else row.load = async () => TRIPLE();
    map.rows.set('row', row);
    /* ⚠ THE SUPPLIER IS ADOPTED ONCE PER ID (js/gis-sources.js sup()), so switching roads for the same
       id goes through the published door rather than by reaching into the map. */
    sources.supply('row', null);
  }

  const vs = (r) => (r.ok ? r.features.map((f) => f.properties.v) : ('REFUSED:' + r.why));

  /* ══ ① 同じ要求が、未ロードでもロード済みでも同じ答えを返す ══════════════════════════════════ */

  test('R783 ① 属性条件は、描かれていないレイヤーでも実行される（宣言だけで済んでいた）', async () => {
    const { map, sources } = await boot();
    const ask = { where: [{ field: 'v', op: '>=', value: 2 }] };

    put(map, sources, 'doc');
    const doc = await sources.acquire('row', ask);
    /* MEASURED BEFORE THIS ROUND: [1,2,3] — every row it held, after being asked for v>=2. */
    assert.equal(doc.ok, true, JSON.stringify(doc));
    assert.deepEqual(vs(doc), [2, 3], '条件が実行されていない（loader 経路）');

    put(map, sources, 'drawn');
    const drawn = await sources.acquire('row', ask);
    assert.deepEqual(vs(drawn), vs(doc), '同じ要求が経路によって別の答えを返している');
    assert.equal(drawn.coverage.count, doc.coverage.count);
  });

  test('R783 ① 件数制限と続きも、両方の経路で同じ 1 件・同じ続きを返す', async () => {
    const { map, sources } = await boot();

    put(map, sources, 'doc');
    const d1 = await sources.acquire('row', { limit: 1 });
    /* MEASURED BEFORE THIS ROUND: [1,2,3] and next:null — 「これで全部」 about a page of one. */
    assert.deepEqual(vs(d1), [1], '件数制限が実行されていない（loader 経路）');
    assert.ok(d1.next, '続きが述べられていない');

    put(map, sources, 'drawn');
    const r1 = await sources.acquire('row', { limit: 1 });
    assert.deepEqual(vs(r1), [1]);
    /* ⚠ THE CURSOR ITSELF, BYTE FOR BYTE. It is bound to the question and to the ordered answer, and
       both roads answer the same question with the same rows — so a reader that took page 1 from the
       document can take page 2 from the renderer. Anything else would make the continuation a
       statement about the camera. */
    assert.equal(r1.next, d1.next, '続きの位置が、どちらの経路で答えたかに依存している');

    const d2 = await sources.acquire('row', { limit: 1, cursor: d1.next });
    assert.deepEqual(vs(d2), [2], '続きの位置が読まれていない');
    put(map, sources, 'doc');
    const l2 = await sources.acquire('row', { limit: 1, cursor: d1.next });
    assert.deepEqual(vs(l2), [2], 'loader 経路がカーソルを無視している');
    /* to the end, by the route the reader actually takes */
    const l3 = await sources.acquire('row', { limit: 1, cursor: l2.next });
    assert.deepEqual(vs(l3), [3]);
    assert.equal(l3.next, null, '最後のページが「まだ続きがある」と述べている');
    assert.equal(l3.coverage.continues, false, '終わりが供給元の言葉として述べられていない');
  });

  test('R783 ① 表示していてもいなくても、同じ要求は同じ ID 集合を返す', async () => {
    const { map, sources } = await boot();
    const ask = { where: [{ field: 'v', op: '>=', value: 2 }], limit: 1 };
    const answers = [];
    for (const road of ['doc', 'drawn']) {
      for (const on of [true, false]) {
        put(map, sources, road, { on });
        const r = await sources.acquire('row', ask);
        assert.equal(r.ok, true, road + '/on=' + on + ': ' + r.why);
        answers.push({ road, on, ids: r.features.map((f) => f.properties.nm), count: r.coverage.available, next: r.next });
      }
    }
    const first = JSON.stringify(answers[0]).replace(/"road":"[a-z]+"/, '').replace(/"on":(true|false)/, '');
    for (const a of answers) {
      assert.equal(JSON.stringify(a).replace(/"road":"[a-z]+"/, '').replace(/"on":(true|false)/, ''), first,
        '答えが経路か表示状態で変わっている: ' + JSON.stringify(a));
    }
  });

  /* ══ ② 宣言したことは、実行される ═════════════════════════════════════════════════════════════ */

  test('R783 ② supplierFor が宣言した 3 つの能力は、どちらの供給元でも本当に効く', async () => {
    const { map, sources, layers } = await boot();
    for (const road of ['doc', 'drawn']) {
      put(map, sources, road);
      const impl = layers.supplierFor('row');
      assert.ok(impl, road + ': 供給元が組めていない');
      /* the declaration, read off the implementation rather than written here */
      for (const cap of ['where', 'cursor', 'limit']) assert.equal(impl[cap], true, road + ': ' + cap + ' を宣言していない');

      /* and each declared capability CHANGES THE ANSWER — a claim nobody executes is worse than a
         refusal, because it comes back looking like an answer */
      const all = await sources.acquire('row', {});
      assert.equal(all.features.length, 3, road);
      const narrowed = await sources.acquire('row', { where: [{ field: 'v', op: '<=', value: 1 }] });
      assert.equal(narrowed.features.length, 1, road + ': where が答えを変えていない');
      const capped = await sources.acquire('row', { limit: 2 });
      assert.equal(capped.features.length, 2, road + ': limit が答えを変えていない');
      const resumed = await sources.acquire('row', { cursor: capped.next });
      assert.deepEqual(vs(resumed), [3], road + ': cursor が答えを変えていない');
    }
  });

  test('R783 ② 条件を実行した側がそう述べる — 絞っていない答えは「絞った」と記録しない', async () => {
    const { map, sources } = await boot();
    put(map, sources, 'doc');
    const plain = await sources.acquire('row', {});
    assert.equal(plain.coverage.filteredBy, null, '条件が無いのに絞ったと記録されている');
    const got = await sources.acquire('row', { where: [{ field: 'v', op: '>=', value: 2 }] });
    /* MEASURED BEFORE THIS ROUND: 'supplier' next to [1,2,3] — the record of a request, not of work. */
    assert.equal(got.coverage.filteredBy, 'supplier');
    assert.equal(got.features.length, 2, '「絞った」と述べている答えが絞られていない');
    /* and the conditions travel with the answer, so 「この平均は何の平均か」 has an answer in the record */
    assert.deepEqual(got.coverage.requested.where, [{ field: 'v', op: '>=', value: 2 }]);
  });

  /* ══ ③ カーソルは 1 つの並びの位置であって、どの並びの位置でもない ═══════════════════════════ */

  test('R783 ③ 検索条件が変わったカーソルは、別集合の位置として黙って使われない', async () => {
    const { map, sources } = await boot();
    put(map, sources, 'drawn');
    const p1 = await sources.acquire('row', { limit: 1 });
    assert.deepEqual(vs(p1), [1]);

    /* MEASURED BEFORE THIS ROUND: ok:true and v=3 — position 1 of the FILTERED set, handed over as if
       it were the continuation of the unfiltered one. */
    const other = await sources.acquire('row', { limit: 1, cursor: p1.next, where: [{ field: 'v', op: '>=', value: 2 }] });
    assert.equal(other.ok, false, '条件を変えたのに同じカーソルが受け付けられた: ' + JSON.stringify(other.features && vs(other)));
    assert.equal(other.why, 'bad-param');
    assert.equal(other.detail.param, 'cursor');
    assert.equal(other.detail.reason, 'query-or-data-changed', '断る理由が読者に渡っていない');

    /* the same window and the same conditions still resume — the refusal is about the question having
       changed, not about paging being unavailable */
    const q = { limit: 1, where: [{ field: 'v', op: '>=', value: 2 }] };
    const f1 = await sources.acquire('row', q);
    const f2 = await sources.acquire('row', Object.assign({}, q, { cursor: f1.next }));
    assert.deepEqual(vs(f2), [3]);
  });

  test('R783 ③ 範囲が変わったカーソルも、データが変わったカーソルも断られる', async () => {
    const { map, sources } = await boot();
    put(map, sources, 'drawn');
    const win = { limit: 1, bbox: { w: 0, s: 0, e: 10, n: 10 } };
    const p1 = await sources.acquire('row', win);
    assert.equal(p1.ok, true, p1.why);

    const wider = await sources.acquire('row', { limit: 1, cursor: p1.next, bbox: { w: -10, s: -10, e: 10, n: 10 } });
    assert.equal(wider.ok, false, '別の窓の位置として使われた');
    assert.equal(wider.detail.reason, 'query-or-data-changed');

    /* the holding itself moved: a live row rolled over between two pages, and the offset it handed out
       is a position in a list that no longer exists */
    map.rows.get('row').features = [pt(9, 9, { v: 9, nm: 'z' })].concat(TRIPLE());
    const moved = await sources.acquire('row', Object.assign({}, win, { cursor: p1.next }));
    assert.equal(moved.ok, false, '保持が変わったのに同じ位置から続けられた');
    assert.equal(moved.detail.reason, 'query-or-data-changed');
  });

  test('R783 ③ 別のレイヤーのカーソルと、読めないカーソルは別の理由で断られる', async () => {
    const { map, sources } = await boot();
    put(map, sources, 'drawn');
    const wrong = await sources.acquire('row', { limit: 1, cursor: 'somewhere-else@abc@1' });
    assert.equal(wrong.ok, false);
    assert.equal(wrong.detail.reason, 'cursor-of-another-layer');
    /* the shape the app handed out BEFORE this round is not read as a position either — it names no
       question, and reading it as one is the defect */
    const old = await sources.acquire('row', { limit: 1, cursor: 'row@1' });
    assert.equal(old.ok, false, '問いを名乗らないカーソルが位置として読まれた');
  });

  /* ══ ④ 能力・準備・可用・表示 ═════════════════════════════════════════════════════════════════ */

  test('R783 ④ レイヤーを消しても、その行の「値を訊けるか」は変わらない', async () => {
    const { map, layers } = await boot();
    map.rows.set('field', { label: 'Field', on: true, measure: () => ({ value: 5, unit: 'm', text: '5 m' }) });
    const on = layers.canSample('field');
    map.rows.get('field').on = false;
    const off = layers.canSample('field');
    /* MEASURED BEFORE THIS ROUND: true then false — the data did not change, a checkbox did. */
    assert.equal(on, off, '能力の答えが表示状態で変わっている');
    assert.equal(on, true);
  });

  test('R783 ④ 4 つの事実が別々に読める（1 つの真偽値が全部を名乗っていた）', async () => {
    const { map, layers, sources } = await boot();
    map.rows.set('field', { label: 'Field', on: false, measure: () => ({ value: 5, unit: 'm', text: '5 m' }) });
    const said = layers.samplingOf('field');
    assert.equal(said.visible, false, '表示状態が別の事実として読めない');
    assert.equal(said.door, true, '訊く扉が在ることが別の事実として読めない');
    /* ⚠ null IS 「まだ誰も訊いていない」 AND IS NOT false: the registry's only door is asynchronous, so
       a synchronous answer here cannot be a measurement, and guessing would hide a readable field. */
    assert.equal(said.capable, null, '測っていないことが false に潰されている');

    /* ⚠ AND 「データが準備されているか」 IS THIS FILE'S NEIGHBOUR'S TO ANSWER (js/gis-sources.js
       needsVisible), so it is read where it is composed — on the list row — and it is THREE-VALUED
       there, exactly as needsVisible is: flattening its null would undo the distinction it exists for.
       A field candidate that says nothing about what it holds needs its layer on (false); one that
       declared an extent cannot be asked the question without switching it off behind the reader
       (null). */
    map.rows.set('world', { label: 'World field', on: false, holds: WORLD, measure: () => ({ value: 1, unit: 'm', text: '1 m' }) });
    const rows = sources.list();
    const row = rows.find((e) => e.id === 'field');
    const world = rows.find((e) => e.id === 'world');
    assert.ok(row && row.sampling, '一覧の行が 4 つの事実を運んでいない');
    assert.equal(row.sampling.visible, false);
    assert.equal(row.sampling.prepared, false, '表示が要る行が「準備されている」と述べられている');
    assert.equal(world.sampling.prepared, null, '「訊けない」が false に潰されている');
    assert.equal(row.sampling.available, false, '表示も準備もされていない行が「いま訊ける」と述べられている');
    /* and they are FOUR values, not one wearing four names */
    assert.deepEqual(Object.keys(row.sampling).sort(), ['available', 'capable', 'prepared', 'visible']);
  });

  test('R783 ④ 訊いて行が返らなかった行は、以後「訊ける」と言われない（表示を点けても）', async () => {
    const { map, layers, sources } = await boot();
    /* a row with NO sampler at all — js/map-ui.js hands back no row for it, ever */
    map.rows.set('mute', { label: 'Mute', on: true, features: [pt(1, 1, {})] });
    /* MEASURED BEFORE THIS ROUND: true, because the row was switched on. */
    const r = await sources.region('mute', { w: 0, s: 0, e: 2, n: 2 }, { width: 2, height: 2 });
    assert.equal(r.ok, false);
    assert.equal(r.why, 'layer-not-visible');
    assert.equal(layers.canSample('mute'), false, '訊いて誰も答えなかった行が、まだ候補として出されている');
    assert.equal(layers.samplingOf('mute').capable, false, '測った結果が保たれていない');
    map.rows.get('mute').on = true;
    assert.equal(layers.canSample('mute'), false, '表示を点けたら能力が戻ったことになっている');
  });

  /* ══ ⑤ 判断は 1 か所 ═════════════════════════════════════════════════════════════════════════ */

  test('R783 ⑤ 2 つの経路は同じ narrowing 実装を通る（3 つの if を足したのではない）', () => {
    /* 綴りのまま: 主張が「2 つ目が無い／1 か所だけ」という構造の不在で、実行した答えからは不在を観測できない（同じ答えを返すことは ①〜④ が評価で測る）。 */
    const src = read('js/gis-layers.js');
    assert.equal((src.match(/function pageOf\(/g) || []).length, 1, '共有された narrowing が 1 つでない');
    const calls = (src.match(/pageOf\(/g) || []).length - 1;      /* minus its own declaration */
    assert.equal(calls, 2, '両方の経路が同じ実装を通っていない: ' + calls);
    /* the condition executor and the cursor exist once */
    assert.equal((src.match(/function selectWhere\(/g) || []).length, 1);
    assert.equal((src.match(/function cursorOffset\(/g) || []).length, 1);
    /* and the old 「レイヤー名＋位置」 cursor is not handed out anywhere any more */
    assert.ok(!/key \+ '@' \+ end/.test(src), 'まだ問いを名乗らないカーソルを作っている');
  });

  ISOLATED.built();
});
