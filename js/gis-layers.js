/* ============================================================================
 *  IntMap · WHAT IS ON THE MAP, AS A DATASET — window.IntMapGisLayers   (#R732)
 * ----------------------------------------------------------------------------
 *  #R729 gave the app one registry of datasets (js/gis-datasets.js) and one set of operations that
 *  read from it and write back into it. Everything the reader DROPPED could enter it. Everything
 *  the app itself had already drawn could not: the earthquakes, the ships, the World Heritage
 *  points, the outbreaks, the file another module put on the map — all of them are real features,
 *  held in a real source, and there was no door from any of them into the registry. 「地図に出て
 *  いるもので分析する」 had no entrance, which is the same shape #R729 removed for imports.
 *
 *  This file is that door, and it is only a door: it decides nothing about geometry, typing or
 *  storage. It finds what can hand over features, hands them over whole, and registers them.
 *
 *  ══ THE LIST IS DISCOVERED, NEVER WRITTEN ═════════════════════════════════════════════════════
 *  Two populations are counted, not enumerated:
 *
 *    · the LAYER REGISTRY (window.IntMapLayers) — every id whose state() answers and whose
 *      featuresIn() returns an array. Today three modules register and exactly one of them
 *      implements featuresIn through its own body; the rest go through js/map-ui.js's shared
 *      window on the renderer's sources. ⚠ WRITING THAT DOWN WOULD FREEZE IT. The fourth module to
 *      implement featuresIn must appear here by existing, not by being added to a list —
 *      .agents/rules/no-ad-hoc-hardcoding.md §2-4.
 *    · the RENDERER'S GEOJSON SOURCES — read off the parsed style, so a source that no layer row
 *      speaks for (an uploaded file, a module that draws without registering) is still reachable.
 *
 *  ⚠ THE SAME FEATURES ARE NOT OFFERED TWICE. A registered layer usually reads one of those very
 *  sources, so the two populations overlap. The overlap is MEASURED by object identity — the
 *  feature objects a layer hands back are the ones the source holds, not copies — rather than by
 *  guessing a source id from a layer id, which no rule connects.
 *
 *  ══ WHAT IS READ IS WHAT IS THERE ═════════════════════════════════════════════════════════════
 *  read() hands back the features as they are: full geometry, full properties. Nothing is reduced
 *  to a bounding box or to a centroid on the way — a line that becomes its midpoint cannot answer
 *  「道路そのものからの距離」 (see js/gis-geometry.js), and a polygon that becomes its box cannot be
 *  clipped. The only thing that can remove a feature is a bounds the caller asked for.
 *
 *  ⚠ 「ALL OF IT」 IS ASKED AS A WORLD BOX, because the layer contract has exactly one door
 *  (featuresIn(bounds)) and no word for 「everything」. A layer that has answered for
 *  [[-180,-90],[180,90]] has answered for all of its content.
 *
 *  ⚠ AND THE BOX TEST ITSELF IS NOT WRITTEN HERE. js/map-ui.js owns the one predicate the whole app
 *  uses and now publishes it as IntMapLayers.featuresInSource; a second one in this file would be
 *  the same judgement kept in two places, and the copy is always the one that keeps yesterday's
 *  mistake (that predicate dropped every line and polygon until this round).
 *
 *  ══ PROVENANCE IS THE RECIPE, AND THE PROJECT STILL SAVES THE BODY ════════════════════════════
 *  {kind:'layer', layer, bounds, at} says 「いつ・どのレイヤーの・どの範囲を読んだか」: it is enough
 *  to run the read again, which is what a recipe is.
 *  ⚠ AND js/gis-project.js WILL STILL SAVE THE FEATURES, because it stores a body for every
 *  provenance whose kind is not 'op'. That is the correct behaviour here and not an oversight: a
 *  live layer's content changes with the hour (the ships moved, the quake list rolled over), so
 *  re-running this recipe tomorrow does not reproduce today's answer. What must survive the tab
 *  closing is 「あのとき読んだもの」, and only the body is that.
 *
 *  ⚠ sourceCrs IS 'EPSG:4326' AS A STATEMENT OF FACT, not a default. These features come out of a
 *  MapLibre GeoJSON source, and the GeoJSON specification (RFC 7946 §4) fixes that coordinate
 *  reference system for every source the renderer accepts; js/geo-import.js has already reprojected
 *  anything that arrived otherwise before it could reach a source. So this is the one origin in the
 *  app where 「what arrived」 is known rather than declared by the file.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) and window.* is read at CALL time, so this
 *  module imports in Node with no DOM: sources() is empty and every entry point refuses by name
 *  instead of throwing.
 * ==========================================================================*/

export function makeGisLayers() {
  return (function () {

    /* Read at call time — never captured. In Node all three are absent and stay absent. */
    function GE() { try { return (typeof window !== 'undefined' && window.IntMapGeoEngine) || null; } catch (_) { return null; } }
    function REG() { try { return (typeof window !== 'undefined' && window.IntMapLayers) || null; } catch (_) { return null; } }
    function DATA() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }

    /* 「everything」, said in the only vocabulary the layer contract has. */
    const WHOLE_WORLD = { w: -180, s: -90, e: 180, n: 90 };

    /* Three shapes reach this module — the renderer's LngLatBounds, the [[w,s],[e,n]] pair the
       layer contract uses, and the {w,s,e,n} object js/atlas-view-subject.js carries — so the one
       normaliser accepts all three rather than each caller being told which one is right. */
    function asBox(b) {
      if (!b) return null;
      try {
        if (typeof b.getWest === 'function') return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
        if (Array.isArray(b) && b.length === 2 && Array.isArray(b[0])) return { w: +b[0][0], s: +b[0][1], e: +b[1][0], n: +b[1][1] };
        if (b.w != null && b.e != null) return { w: +b.w, s: +b.s, e: +b.e, n: +b.n };
      } catch (_) { }
      return null;
    }
    const finiteBox = (x) => !!x && [x.w, x.s, x.e, x.n].every((v) => typeof v === 'number' && isFinite(v));
    const asPair = (x) => [[x.w, x.s], [x.e, x.n]];

    /* ── the two populations ─────────────────────────────────────────────────────────────────── */

    /* Every id the layer registry knows. Its own list; this file never keeps one. */
    function layerIds() {
      const R = REG();
      if (!R || typeof R.list !== 'function') return [];
      try { return R.list().map(String); } catch (_) { return []; }
    }

    /* The features a registered layer will hand over for a box, or null when it cannot hand any
       over at all (no featuresIn, or its own body refused). */
    function layerFeatures(id, box) {
      const R = REG();
      if (!R || typeof R.featuresIn !== 'function') return null;
      try {
        const f = R.featuresIn(id, asPair(box));
        return Array.isArray(f) ? f : null;
      } catch (_) { return null; }
    }

    function layerLabel(id) {
      const R = REG();
      try { const s = R && R.state ? R.state(id) : null; return (s && s.label) || null; } catch (_) { return null; }
    }

    /* What the layer says about WHEN it is (#R735). A sentence for a reader in most rows — see
       toDataset for why that distinction is carried rather than flattened. */
    function layerTime(id) {
      const R = REG();
      try { const s = R && R.state ? R.state(id) : null; const t = s && s.time; return (t == null || t === '') ? null : String(t); } catch (_) { return null; }
    }

    /* Whether a layer answers 「その地点の値は」 at all — the contract js/map-ui.js documents as
       `sampleAt(lng,lat) → the REAL value at a point`. It is the entrance toRaster() uses, and the
       reason a numeric layer can become a dataset without anybody writing a reader for it. */
    function canSample(id) {
      const R = REG();
      if (!R || typeof R.sampleAt !== 'function') return false;
      try { const s = R.state ? R.state(id) : null; return !!(s && s.on); } catch (_) { return false; }
    }

    /* The renderer's GeoJSON sources, off the parsed style. ⚠ The style is the renderer's own
       inventory, so a source added by a module this file has never heard of is in it. */
    function geojsonSourceIds() {
      const E = GE();
      try {
        const st = E && E.scene && E.scene.getStyle ? E.scene.getStyle() : null;
        const src = st && st.sources;
        if (!src) return [];
        return Object.keys(src).filter((k) => { try { return src[k] && src[k].type === 'geojson'; } catch (_) { return false; } });
      } catch (_) { return []; }
    }

    function sourceFeatures(sid) {
      const E = GE();
      try {
        const d = E && E.layers && E.layers.sourceData ? E.layers.sourceData(sid) : null;
        return (d && Array.isArray(d.features)) ? d.features : null;
      } catch (_) { return null; }
    }

    /* The name a reader gave a file they dropped. js/map-ui.js's upload list is the only holder of
       it, so it is asked; when nothing holds a name the source id is the honest label. ⚠ This is
       asking the registry that knows, not a table of ids written here. */
    function sourceLabel(sid) {
      try {
        const items = (window.GeoJSONUpload && window.GeoJSONUpload._items) || null;
        if (!Array.isArray(items)) return null;
        const hit = items.find((it) => it && String(it.sid) === String(sid));
        return (hit && hit.name) ? String(hit.name) : null;
      } catch (_) { return null; }
    }

    /* One typing rule for the whole app — the dataset registry's. When it is not loaded the type is
       unstated rather than computed a second way here (two rules drift; #R729 §geometryKind). */
    function geometryKind(features) {
      const D = DATA();
      try { return (D && D.geometryKind) ? D.geometryKind(features) : null; } catch (_) { return null; }
    }

    /* ── sources() ───────────────────────────────────────────────────────────────────────────── */

    /* ⚠ COUNTS ARE FOR THE WHOLE LAYER, not for the current view: this list answers 「何を渡せるか」,
       and a count that shrank as the reader panned would be a different question wearing the same
       word. read() is where a view is asked for. */
    function sources() {
      const out = [];
      const claimedIds = new Set();
      /* identity of the first and last feature of each layer's answer — enough to recognise the
         source those features live in, and constant-size no matter how many features there are */
      const edges = new Set();

      for (const id of layerIds()) {
        const label = layerLabel(id);
        if (label == null) continue;                  /* state() did not answer: not a readable row */
        const f = layerFeatures(id, WHOLE_WORLD);
        if (!f) continue;                             /* no featuresIn, or it refused */
        out.push({ id, label: String(label), from: 'layer', geometryType: geometryKind(f), count: f.length });
        claimedIds.add(id);
        if (f.length) { edges.add(f[0]); edges.add(f[f.length - 1]); }
      }

      for (const sid of geojsonSourceIds()) {
        if (claimedIds.has(sid)) continue;
        const fs = sourceFeatures(sid);
        if (!fs) continue;
        if (fs.length && (edges.has(fs[0]) || edges.has(fs[fs.length - 1]))) continue;   /* already offered under a layer's label */
        out.push({ id: sid, label: sourceLabel(sid) || sid, from: 'source', geometryType: geometryKind(fs), count: fs.length });
      }
      return out;
    }

    /* ── read() ──────────────────────────────────────────────────────────────────────────────── */

    /* {ok:true, features, from, bounds} — `bounds` is what the CALLER asked for (null when they
       asked for everything), because that is what makes the read repeatable. */
    function read(id, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const R = REG(), E = GE();
      if (!R && !E) return { ok: false, why: 'map-unavailable' };

      let box = null;
      if (o.bounds != null) {
        box = asBox(o.bounds);
        /* ⚠ A BOUNDS THAT CANNOT BE READ IS NOT 「no bounds」. Treating it as 「everything」 would
           answer a different question than the one that was asked, silently and with real data.
           `bad-param` is the code js/gis-ops.js already returns for a parameter it cannot use. */
        if (!finiteBox(box)) return { ok: false, why: 'bad-param', detail: { param: 'bounds', value: o.bounds } };
      }
      const win = box || WHOLE_WORLD;

      if (layerIds().indexOf(key) >= 0) {
        const f = layerFeatures(key, win);
        if (!f || !f.length) return { ok: false, why: 'no-features', detail: { id: key, from: 'layer' } };
        return { ok: true, features: f.slice(), from: 'layer', bounds: box };
      }

      const fs = sourceFeatures(key);
      if (!fs) return { ok: false, why: 'layer-unknown', detail: { id: key } };
      if (!fs.length) return { ok: false, why: 'no-features', detail: { id: key, from: 'source' } };
      if (!box) return { ok: true, features: fs.slice(), from: 'source', bounds: null };
      /* The box test is js/map-ui.js's, by name — see the header. When it is not there the app's
         one predicate is not loaded, and dropping or keeping features on a rule this file cannot
         evaluate would both be inventions. */
      const kept = (R && typeof R.featuresInSource === 'function') ? R.featuresInSource(key, asPair(win)) : null;
      if (!Array.isArray(kept)) return { ok: false, why: 'map-unavailable', detail: { id: key, needs: 'featuresInSource' } };
      if (!kept.length) return { ok: false, why: 'no-features', detail: { id: key, from: 'source' } };
      return { ok: true, features: kept, from: 'source', bounds: box };
    }

    /* ── toDataset() ─────────────────────────────────────────────────────────────────────────── */

    function toDataset(id, opts) {
      const o = opts || {};
      const r = read(id, o);
      if (!r.ok) return r;
      const D = DATA();
      if (!D || typeof D.add !== 'function') return { ok: false, why: 'registry-missing' };
      const wanted = (o.id == null || o.id === '') ? null : String(o.id);
      if (wanted && D.has && D.has(wanted)) return { ok: false, why: 'id-in-use', detail: { id: wanted } };
      const title = o.title ? String(o.title) : (layerLabel(String(id)) || sourceLabel(String(id)) || String(id));
      /* ⚠ (#R735) THE LAYER'S OWN TIME USED TO STOP AT THE DOOR. Every readable row can say when it
         is — window.IntMapLayers.state(id).time — and this function recorded only `at: Date.now()`,
         the moment the copy was taken. So a dataset made from 「2020 年の選挙」 arrived saying it was
         made today and nothing else, and the analysis built on it could not be filtered by, grouped
         by, or even labelled with the time of the thing it describes.
         ⚠ WHAT THAT FIELD HOLDS IS A SENTENCE, NOT A TIMESTAMP. The layers write it for a reader:
         「直近 24 h」, 「2020-06-15 12:00 UTC」, 「1889」. So it is carried two ways, and the split is
         the point: the string goes into the provenance verbatim, because the layer said it and
         throwing away a statement loses information; and a `time` declaration is made ONLY when the
         string actually reads as a moment. Declaring 「直近 24 h」 as an instant would be this
         project's recorded 「誰も述べていないことを地図が述べる」 defect, in a new place. */
      const stated = layerTime(String(id));
      const moment = (stated && D.momentOf) ? D.momentOf(stated) : null;
      const spec = {
        title,
        features: r.features,
        sourceCrs: 'EPSG:4326',
        time: moment ? { kind: 'constant', start: stated, end: stated } : (o.time || null),
        provenance: { kind: 'layer', layer: String(id), bounds: r.bounds, at: Date.now(), statedTime: stated || null },
      };
      if (wanted) spec.id = wanted;
      try {
        return { ok: true, dataset: D.add(spec) };
      } catch (e) {
        /* add() throws on exactly one thing: an id already in the namespace. */
        return { ok: false, why: 'id-in-use', detail: { id: wanted, message: e && e.message } };
      }
    }

    /* ── toRaster() ───────────────────────────────────────────────────────────────────────────
       ⚠ (#R735) THE NUMERIC LAYERS WERE THE ONES NOTHING COULD ANALYSE. read() hands over features,
       and half of what is on this map is not features: precipitation, temperature, elevation, land
       cover and the rest are FIELDS, read one point at a time through the contract js/map-ui.js
       states as `sampleAt(lng,lat) → the REAL value at a point`. There was no way to point an op at
       one, so 「この区域の平均標高」 and 「区分ごとの面積」 each had to be built as a separate feature
       of the app — the thing js/gis-raster.js exists to stop.

       This bakes one such layer over one window into a grid dataset. ⚠ IT IS A SAMPLE OF A LAYER AND
       IT SAYS SO: the grid, the window and the layer id go into the provenance, so the record cannot
       be mistaken for the upstream's own raster, and a reader who wants it finer runs it again.
       ⚠ ONE await PER PIXEL, ON THE MAIN THREAD — that is what the contract offers, so there is no
       pretending otherwise: instead the work is interruptible (`signal`) and it reports where it is
       (`onProgress`), and it yields between rows so the map keeps drawing while it runs. A ceiling
       written here would be a number with no measurement behind it, on a cost that depends entirely
       on which layer is being asked. */
    async function toRaster(id, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const R = REG(), D = DATA();
      if (!R || typeof R.sampleAt !== 'function') return { ok: false, why: 'map-unavailable', detail: { needs: 'sampleAt' } };
      if (!D || typeof D.add !== 'function') return { ok: false, why: 'registry-missing' };
      if (layerIds().indexOf(key) < 0) return { ok: false, why: 'layer-unknown', detail: { id: key } };
      /* ⚠ A LAYER THAT IS SWITCHED OFF HAS NO VALUES TO GIVE, and this is the one refusal a reader
         can act on immediately. The layers load their grids when they are turned on (js/map-ui.js),
         so sampling one that is off answers null for every pixel — a grid of holes that looks like a
         measurement of nothing. 「見つからなかった」と「訊けなかった」を同じ答えにしない. */
      if (!canSample(key)) return { ok: false, why: 'layer-not-sampling', detail: { id: key } };

      const box = (o.bounds == null) ? WHOLE_WORLD : asBox(o.bounds);
      if (!finiteBox(box)) return { ok: false, why: 'bad-param', detail: { param: 'bounds', value: o.bounds } };
      const int = (v) => (typeof v === 'number' && isFinite(v) && Number.isInteger(v) && v > 0);
      if (!int(o.width) || !int(o.height)) return { ok: false, why: 'bad-param', detail: { param: int(o.width) ? 'height' : 'width', value: int(o.width) ? o.height : o.width } };

      const w = o.width, h = o.height;
      const pixelLng = (box.e - box.w) / w, pixelLat = (box.n - box.s) / h;
      if (!(pixelLng > 0) || !(pixelLat > 0)) return { ok: false, why: 'bad-param', detail: { param: 'bounds', value: [box.w, box.s, box.e, box.n] } };

      const asNum = (D.asNumber) ? D.asNumber : ((v) => (typeof v === 'number' && isFinite(v) ? v : null));
      const cells = new Float64Array(w * h);
      let read = 0, textSeen = null;
      for (let row = 0; row < h; row++) {
        if (o.signal && o.signal.aborted) return { ok: false, why: 'cancelled', detail: { rows: row, of: h } };
        const lat = box.n - (row + 0.5) * pixelLat;
        for (let col = 0; col < w; col++) {
          const lng = box.w + (col + 0.5) * pixelLng;
          let v = null;
          try {
            const got = await R.sampleAt(lng, lat, [key]);
            const hit = Array.isArray(got) ? got.find((x) => x && String(x.id) === key) : null;
            if (hit) { v = asNum(hit.value); if (v == null && textSeen == null) textSeen = String(hit.value); }
          } catch (_) { v = null; }
          /* ⚠ NaN, NOT ZERO. A missing sample written as 0 is an elevation of exactly sea level and a
             rainfall of exactly none; js/gis-raster.js treats NaN as absent in every statistic. */
          cells[row * w + col] = (v == null) ? NaN : v;
          if (v != null) read++;
        }
        if (typeof o.onProgress === 'function') { try { o.onProgress({ rows: row + 1, of: h, read: read }); } catch (_) { } }
        /* one turn of the event loop per row: the camera, the renderer and the cancel button all
           live on this thread */
        await new Promise((res) => setTimeout(res, 0));
      }
      /* ⚠ A GRID WITH NO NUMBERS IN IT IS NOT A GRID, and the sentence the layer answered with is
         what the reader needs to see: a layer whose sampleAt returns 「12 °C」 has values, it just
         does not have them as numbers, and that is a different thing to fix. */
      if (!read) return { ok: false, why: 'layer-values-not-numeric', detail: { id: key, sample: textSeen } };

      const stated = layerTime(key);
      const moment = (stated && D.momentOf) ? D.momentOf(stated) : null;
      const spec = {
        kind: 'raster',
        title: o.title ? String(o.title) : (layerLabel(key) || key),
        sourceCrs: 'EPSG:4326',
        width: w, height: h,
        grid: { west: box.w, north: box.n, pixelLng: pixelLng, pixelLat: pixelLat },
        bands: [{ name: layerLabel(key) || key, unit: (o.unit == null ? null : String(o.unit)), nodata: null }],
        read: () => cells,
        time: moment ? { kind: 'constant', start: stated, end: stated } : null,
        provenance: { kind: 'layer-raster', layer: key, bounds: { w: box.w, s: box.s, e: box.e, n: box.n }, width: w, height: h, sampled: read, at: Date.now(), statedTime: stated || null },
      };
      if (o.id != null && o.id !== '') {
        const wanted = String(o.id);
        if (D.has && D.has(wanted)) return { ok: false, why: 'id-in-use', detail: { id: wanted } };
        spec.id = wanted;
      }
      try { return { ok: true, dataset: D.add(spec) }; }
      catch (e) { return { ok: false, why: 'add-failed', detail: { message: e && e.message } }; }
    }

    const API = { sources, read, toDataset, toRaster, canSample };
    try { window.IntMapGisLayers = API; } catch (_) { }
    return API;
  })();
}
