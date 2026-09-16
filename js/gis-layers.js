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
 *  (featuresIn(bounds)) and no word for 「everything」.
 *  ⚠⚠⚠ AND THE SENTENCE THAT USED TO FOLLOW THAT ONE WAS FALSE (#R749). It read: 「A layer that has
 *  answered for [[-180,-90],[180,90]] has answered for all of its content.」 What a layer answers for
 *  the world box is all of what the RENDERER IS HOLDING — a source a module refreshed for the current
 *  view, a list an upstream capped, a field loaded only while its layer is on. Stating the world and
 *  being given the world are two different things, and everything computed downstream inherited the
 *  difference with no way to see it. js/gis-sources.js is where that difference is now measured and
 *  said (`coverage`), and toDataset()/toRaster() below go through it.
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

import { makeGisSources } from './gis-sources.js';

export function makeGisLayers() {
  return (function () {

    /* ⚠ (#R749) THE SUPPLY LAYER, AND EXACTLY ONE OF IT. js/gis-sources.js holds the judgement this
       file used to make silently — 「渡したものは、求めたもののどれだけなのか」 — and toDataset() and
       toRaster() below are its only two readers here. It is reached through window at call time like
       every other kernel, so js/gis-core.js's mounting order decides; when nothing has mounted it
       (this file evaluated first, or a test importing only this module) ONE is built here and
       published, rather than this file keeping a second opinion about coverage. The module publishes
       itself onto window, so the two paths converge on the same instance and the declarations a
       supplier makes are visible to both. */
    let _ownSources = null;
    function SRC() {
      try { if (typeof window !== 'undefined' && window.IntMapGisSources) return window.IntMapGisSources; } catch (_) { }
      if (!_ownSources) _ownSources = makeGisSources();
      return _ownSources;
    }

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

    /* ── supplierFor(): the layer answering the whole question itself ─────────────────────────── */

    /* ══ ⚠⚠⚠ (#R756) THE SUPPLY CONTRACT HAD NO SUPPLIER, SO TWO QUESTIONS HAD NO ANSWER ═══════════
       js/gis-sources.js supply() was reachable from nowhere in the shipped app, and its prepare()
       refuses `where` and `cursor` unless a registered implementation claims them. So 「M6 以上だけ」
       came back `where-not-supported` and 「続きを」 came back `cursor-not-supported` FOR EVERY ID —
       an answer about the app, not about the layer, and the same one whatever the layer held.
       ⇒ THIS BUILDS ONE OUT OF THE REGISTRATION ITSELF. There is no list of suppliable ids here and
       there must not be: a row qualifies when its OWN declaration says it holds everything within a
       stated extent and is not view-bound (js/map-ui.js `holds`), and when it actually hands
       features over. A layer registered tomorrow that says the same thing is supplied by saying it.
       ⚠ A VIEW-BOUND ROW IS NOT SUPPLIED, and that is the whole discrimination: the aircraft source
       holds what the camera asked airplanes.live for, so 「この条件に合うものを全部」 cannot be
       answered from it — and answering it anyway, out of what happens to be in the renderer, is
       precisely the defect js/gis-sources.js exists to stop.
       ⚠ WHAT IT CLAIMS, IT DOES. `fields` is NOT claimed (js/gis-sources.js projects, and one
       projection is enough); `limit` and `cursor` are, because a store holding the whole list is the
       only thing that can page it honestly; `where` is, and the executor below is what makes that
       true rather than a word. */

    /* ⚠ THE COMPARISONS, AND THE LIST IS THE IMPLEMENTATION. Keyed by the names js/gis-ops.js
       publishes on its `filter` op (asked for through js/gis-sources.js conditionOps — this file
       keeps no vocabulary), so a name that kernel adds and this table does not have is REFUSED BY
       NAME instead of quietly evaluating false: an unexecuted condition that returns rows is an
       answer to a question nobody asked.
       ⚠⚠ AND THE SEMANTICS ARE MEASURED AGAINST THAT KERNEL, not asserted here. The app has one
       filter over a registered dataset and it is async (js/gis-ops.js run()), while this door is
       synchronous by shipped contract (js/gis-sources.js features() is called from a click handler
       without an await) — so the rows cannot be routed through it. What keeps the two from drifting
       is tests/r754-gis-supply-checks ④, which runs every operator, and the empty cell, through both
       and requires the same rows out of each. The typing is not re-invented: `asNumber` and
       `isEmpty` are the dataset registry's own, which is what makes 「12 km」 text in both. */
    function cmpPair(R, raw, want) {
      const a = R.asNumber(raw), b = R.asNumber(want);
      if (a != null && b != null) return { a: a, b: b };
      return { a: String(raw), b: String(want) };
    }
    /* the four orderings, which share one rule: an empty cell satisfies none of them — see
       js/gis-ops.js evalCondition for why treating '' as 0 pulls every blank row into 「500未満」 */
    function ordered(R, v, w, cmp) { if (R.isEmpty(v)) return false; const c = cmpPair(R, v, w); return cmp(c.a, c.b); }
    const WHERE_IMPL = {
      '>=': (R, v, w) => ordered(R, v, w, (a, b) => a >= b),
      '>': (R, v, w) => ordered(R, v, w, (a, b) => a > b),
      '<=': (R, v, w) => ordered(R, v, w, (a, b) => a <= b),
      '<': (R, v, w) => ordered(R, v, w, (a, b) => a < b),
      '==': (R, v, w) => { if (R.isEmpty(v)) return R.isEmpty(w); const c = cmpPair(R, v, w); return c.a === c.b; },
      '!=': (R, v, w) => { if (R.isEmpty(v)) return !R.isEmpty(w); const c = cmpPair(R, v, w); return c.a !== c.b; },
      'contains': (R, v, w) => (R.isEmpty(v) ? false : String(v).toLowerCase().indexOf(String(w == null ? '' : w).toLowerCase()) >= 0),
      'in': (R, v, w) => {
        if (R.isEmpty(v)) return false;
        const list = Array.isArray(w) ? w : [w];
        for (const x of list) { const c = cmpPair(R, v, x); if (c.a === c.b) return true; }
        return false;
      },
      'between': (R, v, w) => {
        if (R.isEmpty(v)) return false;
        const pair = Array.isArray(w) ? w : [];
        if (pair.length !== 2) return false;
        const lo = cmpPair(R, v, pair[0]), hi = cmpPair(R, v, pair[1]);
        return lo.a >= lo.b && hi.a <= hi.b;                     /* both ends included */
      },
    };

    /* {ok:true, features} or a refusal in js/gis-sources.js's own vocabulary (it passes a supplier's
       refusal through untouched, so inventing a code here would be inventing a sentence nobody can
       translate). */
    function selectWhere(features, where) {
      const D = DATA();
      /* 「訊けなかった」 — the typing rule lives in the dataset registry, and guessing at it here
         would be a second answer to 「この文字列は数か」. */
      if (!D || typeof D.asNumber !== 'function' || typeof D.isEmpty !== 'function') {
        return { ok: false, why: 'map-unavailable', detail: { needs: 'IntMapData' } };
      }
      for (const c of where) {
        const op = String(c.op);
        if (!Object.prototype.hasOwnProperty.call(WHERE_IMPL, op)) {
          return { ok: false, why: 'where-not-supported', detail: { op: op, executes: Object.keys(WHERE_IMPL) } };
        }
        /* ⚠ A CONDITION ON A COLUMN NOTHING CARRIES IS REFUSED, not answered — the same rule
           js/gis-ops.js runFilter states, for the same reason: 0 rows from a misspelt field name is
           a count the reader cannot question. */
        if (!features.some((f) => f && f.properties && Object.prototype.hasOwnProperty.call(f.properties, c.field))) {
          return { ok: false, why: 'bad-param', detail: { param: 'where', field: String(c.field), reason: 'unknown-field' } };
        }
      }
      const kept = features.filter((f) => {
        const p = (f && f.properties) || {};
        for (const c of where) if (!WHERE_IMPL[String(c.op)](D, p[c.field], c.value)) return false;
        return true;
      });
      return { ok: true, features: kept };
    }

    /* ⚠ THE CURSOR NAMES ITS OWN LAYER. js/gis-sources.js hands back whatever the supplier returned
       as `next` and hands it on unread, so a cursor from another row — or one a caller invented —
       would otherwise be read as an offset into a list it was never taken from. It is refused by
       name (`bad-param`) rather than clamped: a page that silently starts somewhere else is the
       「知らない」を「全部だ」の代わりにする shape, one level down. */
    function cursorOffset(key, cursor) {
      if (cursor == null) return 0;
      const s = String(cursor), tag = key + '@';
      if (s.indexOf(tag) !== 0) return null;
      const n = Number(s.slice(tag.length));
      return (Number.isInteger(n) && n >= 0) ? n : null;
    }

    function supplierFor(id) {
      const key = String(id == null ? '' : id);
      if (!key) return null;
      const R = REG();
      if (!R || typeof R.declarationOf !== 'function' || typeof R.featuresIn !== 'function') return null;
      let d = null;
      try { d = R.declarationOf(key); } catch (_) { d = null; }
      /* ⚠ THE THREE THINGS THE ROW HAS TO HAVE SAID. Without an extent 「全部」 has no window it is
         全部 of; without `complete` the row said where it is, not that it holds all of what is
         there; `viewBound` is the row saying the opposite. */
      if (!d || d.complete !== true || d.viewBound === true || !d.extent) return null;
      /* and it has to actually hand features over — asked with a degenerate box so the answer costs
         one pass and no copy, and so 「featuresIn が無い」 and 「今は空だ」 stay different */
      let probe = null;
      try { probe = R.featuresIn(key, [[0, 0], [0, 0]]); } catch (_) { probe = null; }
      if (!Array.isArray(probe)) return null;
      return {
        sync: true, where: true, cursor: true, limit: true, fields: false,
        fetch: (req) => builtInFetch(key, req || {}),
      };
    }

    function builtInFetch(key, q) {
      const r = read(key, (q.bbox == null) ? {} : { bounds: q.bbox });
      if (!r.ok) {
        /* the one distinction delegated() draws and this path would otherwise lose: a layer that is
           switched off has not answered 「そこには何も無い」, it has not been asked */
        if (r.why === 'no-features') {
          const st = (() => { try { const S = REG(); return S && S.state ? S.state(key) : null; } catch (_) { return null; } })();
          if (st && st.on === false) return { ok: false, why: 'layer-not-visible', detail: { id: key, from: 'layer' } };
        }
        return r;
      }
      let fs = r.features;
      if (Array.isArray(q.where) && q.where.length) {
        const sel = selectWhere(fs, q.where);
        if (!sel.ok) return sel;
        fs = sel.features;
      }
      const total = fs.length;
      const start = cursorOffset(key, q.cursor);
      if (start == null || start > total) return { ok: false, why: 'bad-param', detail: { param: 'cursor', value: q.cursor } };
      const limit = (typeof q.limit === 'number' && isFinite(q.limit) && q.limit > 0) ? Math.floor(q.limit) : null;
      const end = (limit == null) ? total : Math.min(total, start + limit);
      const page = fs.slice(start, end);
      return {
        ok: true,
        features: page,
        coverage: {
          /* 「窓に在った件数」 next to what was handed over — the pair that makes 「一部だけ」 visible
             at all (memory: coverage counted is not coverage seen). */
          available: total,
          /* THIS answer holding the whole window, which is a different statement from the row's
             standing declaration and is only true when no page boundary cut it. */
          complete: (start === 0 && end === total),
        },
        /* ⚠ PRESENT EVEN WHEN null, because js/gis-sources.js reads the PROPERTY BEING THERE as the
           supplier having spoken about continuation at all. Omitting it would say 「述べていない」. */
        next: (end < total) ? (key + '@' + end) : null,
      };
    }

    /* ── toDataset() ─────────────────────────────────────────────────────────────────────────── */

    /* ⚠ (#R749) ONE VOCABULARY AT THE DOOR A READER REACHES. js/gis-sources.js says
       `layer-not-visible` because that is the fact it measured; js/gis-panel.js has nine languages
       for `layer-not-sampling` and has had since #R735, and they are the same sentence to a reader
       (「そのレイヤーは表示されていないため、渡せる値がありません」). Translating here rather than
       inventing a tenth string keeps the refusal readable; every other code passes through as it is,
       because they are already this app's.
       ⚠ (#R752) AND THE SUPPLY CONTRACT'S CODES PASS THROUGH UNTRANSLATED ON PURPOSE. They are only
       reachable by a caller that named `where` or `cursor`, or by an id that registered an
       implementation — no shipped control does either yet, so no reader meets them. Wiring one means
       giving them nine languages in js/gis-panel.js first; inventing an English sentence here would
       be the tenth string this function exists to avoid. */
    function speak(r) {
      if (!r || r.ok !== false) return r;
      if (r.why === 'layer-not-visible') return { ok: false, why: 'layer-not-sampling', detail: r.detail };
      /* js/gis-panel.js prints the offending parameter's NAME back to the reader, and the name a
         reader of this file used is `bounds` — `bbox` is what it is called one layer down. */
      if (r.why === 'bad-param' && r.detail && r.detail.param === 'bbox') {
        return { ok: false, why: 'bad-param', detail: Object.assign({}, r.detail, { param: 'bounds' }) };
      }
      return r;
    }

    function toDataset(id, opts) {
      const o = opts || {};
      /* ⚠ THE READ ITSELF IS STILL read()'s — js/gis-sources.js calls it. What this call adds is the
         `coverage` that travels with the answer, which is the one thing that could not be said
         before: 「どこまでを見て出した答えか」. */
      /* ⚠ (#R752) `where` AND `cursor` TRAVEL FROM HERE. js/gis-sources.js can now ask a supplier for
         「この属性に合うものだけ」 and 「続きを」, and a door that dropped them would make the contract
         unreachable from the one entrance the panel and Atlas hold — an entrance being the reason the
         layer below has a supplier contract at all. A supplier that cannot execute them refuses BY
         NAME down there (`where-not-supported` / `cursor-not-supported`), so nothing arrives here
         looking like a filtered answer that is not one. */
      const got = speak(SRC().features(id, {
        bbox: (o.bounds == null ? null : o.bounds), limit: o.limit, fields: o.fields, time: o.time,
        where: (o.where == null ? null : o.where), cursor: (o.cursor === undefined ? null : o.cursor),
      }));
      if (!got.ok) return got;
      const r = { ok: true, features: got.features, bounds: (o.bounds == null ? null : got.coverage.requested.bbox), coverage: got.coverage };
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
        /* ⚠ (#R749) THE COVERAGE TRAVELS WITH THE DATA. A recipe that says 「いつ・どのレイヤーの・
           どの範囲を」 still does not say whether that range was ANSWERED, and every number computed
           downstream inherits the difference. So the record carries it, and a reader (or Atlas)
           asking 「これは世界についての答えか」 has somewhere to look. */
        provenance: { kind: 'layer', layer: String(id), bounds: r.bounds, at: Date.now(), statedTime: stated || null, coverage: r.coverage },
      };
      if (wanted) spec.id = wanted;
      try {
        const made = { ok: true, dataset: D.add(spec) };
        /* ⚠ (#R752) THE CURSOR IS HANDED ON ONLY WHEN THE SUPPLIER HANDED ONE OVER. Its absence is
           not 「これで終わり」 — that is what `coverage.continues` says, three-valued, in the record
           above — so no field is written here to be mistaken for the end of the list. */
        if (got.next != null) made.next = got.next;
        return made;
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
       (`onProgress`). ⚠ (#R749) IT NOW YIELDS BY ELAPSED TIME RATHER THAN PER ROW, and the walk
       itself lives in js/gis-raster.js — a row is a count, and a count is 3 ms of one field and tens
       of seconds of another (docs/GIS-CORE.md §2.6). A ceiling written here would be a number with no
       measurement behind it, on a cost that depends entirely on which layer is being asked. */
    async function toRaster(id, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const D = DATA();
      if (!D || typeof D.add !== 'function') return { ok: false, why: 'registry-missing' };
      /* ⚠ (#R749) THE WALK IS NOT HERE ANY MORE. It was one await per pixel with a yield ONCE PER
         ROW, and the rest of this layer had no way to read a field over a region at all — so the
         only region read in the app was this loop, and the only thing that knew a grid is a SAMPLE
         of a field was this function's own comment. js/gis-sources.js region() is that read now
         (js/gis-raster.js fromSamplerAsync does the walk, yielding by elapsed time), and what comes
         back carries the coverage. ⚠ IT ALSO DOES NOT ASSUME 「off ⇒ no values」 any more: it probes,
         and refuses only when the field really does not answer. */
      const got = speak(await SRC().region(key, (o.bounds == null ? null : o.bounds), {
        width: o.width, height: o.height,
        band: { name: layerLabel(key) || key, unit: (o.unit == null ? null : String(o.unit)) },
        /* (#R752) a field whose supplier can answer for a whole window at once answers this call in
           one go rather than width×height times; `where` reaches the ones that can narrow it. */
        where: (o.where == null ? null : o.where),
        signal: o.signal || null, onProgress: o.onProgress || null,
      }));
      if (!got.ok) return got;

      const ras = got.grid;
      const cells = ras.read(0);
      const box = { w: ras.grid.west, s: ras.grid.north - ras.grid.pixelLat * ras.height, e: ras.grid.west + ras.grid.pixelLng * ras.width, n: ras.grid.north };
      const stated = layerTime(key);
      const moment = (stated && D.momentOf) ? D.momentOf(stated) : null;
      const spec = {
        kind: 'raster',
        title: o.title ? String(o.title) : (layerLabel(key) || key),
        sourceCrs: 'EPSG:4326',
        width: ras.width, height: ras.height,
        grid: { west: ras.grid.west, north: ras.grid.north, pixelLng: ras.grid.pixelLng, pixelLat: ras.grid.pixelLat },
        bands: ras.bands,
        read: () => cells,
        time: moment ? { kind: 'constant', start: stated, end: stated } : null,
        /* `sampled` is what it has always been (the pixels that carried a number); `coverage` is the
           part that was missing — 「これは場の標本であって、上流の格子ではない」 said as a value the
           next op can read, instead of only in this file's header. */
        provenance: { kind: 'layer-raster', layer: key, bounds: box, width: ras.width, height: ras.height, sampled: got.filled, at: Date.now(), statedTime: stated || null, coverage: got.coverage },
      };
      if (o.id != null && o.id !== '') {
        const wanted = String(o.id);
        if (D.has && D.has(wanted)) return { ok: false, why: 'id-in-use', detail: { id: wanted } };
        spec.id = wanted;
      }
      try { return { ok: true, dataset: D.add(spec) }; }
      catch (e) { return { ok: false, why: 'add-failed', detail: { message: e && e.message } }; }
    }

    /* (#R756) js/gis-sources.js asks this when it is looking for a supplier and has none: see the
       section above for why the answer is built from the registration rather than kept in a list. */
    const API = { sources, read, toDataset, toRaster, canSample, supplierFor };
    try { window.IntMapGisLayers = API; } catch (_) { }
    return API;
  })();
}
