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
    /* (#R819) 後段の条件を実行するのは、この app の 1 つだけの filter である。⚠ IT IS REACHED THE WAY
       EVERY OTHER KERNEL IS — through window at call time — because a second comparison implemented
       here would be the drift .agents/rules/no-ad-hoc-hardcoding.md forbids, and an import would make
       this file decide which instance runs where js/gis-core.js already decides it. */
    function OPS() { try { return (typeof window !== 'undefined' && window.IntMapGisOps) || null; } catch (_) { return null; } }

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
       reason a numeric layer can become a dataset without anybody writing a reader for it.

       ══ ⚠⚠⚠ (#R783) IT ANSWERED 「いま表示されているか」 TO A QUESTION ABOUT ABILITY ═══════════════
       The body was `!!state(id).on`, and js/gis-atlas.js publishes that very answer to the planner
       as `samplable` — a word about what the LAYER CAN DO. MEASURED: switching a numeric layer off
       told Atlas 「このレイヤーは値を訊けない」 (the data did not change; a checkbox did), and a row
       with no sampler at all, switched on, was published as samplable. It is the same defect
       js/gis-sources.js region() removed one level down in #R774 — 「off ⇒ no values」 assumed rather
       than measured — kept alive at the door above it.
       ⇒ FOUR FACTS, AND EACH HAS ITS OWN CLAIMANT:
         · capable  — この行は 「その地点の値は」 に答える実装を持つか。MEASURED, never inferred: the
                      registry's one door is asynchronous (js/map-ui.js sampleAt hands back a ROW for
                      every registration it actually asked, with a value only when there was one —
                      #R774), so a synchronous answer here cannot be a measurement. null = 「まだ誰も
                      訊いていない」, which is not false.
         · prepared — 表示していなくてもデータが在るか。js/gis-sources.js `needsVisible` is the one
                      place that judgement lives, and it composes this list row there.
         · available— いま訊けるか。
         · visible  — 表示されているか。state(id).on — and ONLY this one is about the checkbox.
       ⚠ canSample KEEPS ITS NAME AND NOW ANSWERS THE CAPABILITY QUESTION, because that is what both
       its callers mean by it (js/gis-panel.js offers the sampling control; js/gis-atlas.js publishes
       `samplable`). A row MEASURED not to answer is not offered. A row nobody has measured is a
       candidate — which is exactly what js/gis-sources.js list() means by `kind:'grid'` 「場として
       訊ける候補」, and what acquisition refuses by name (`layer-not-visible`,
       `layer-values-not-numeric`) when the candidate turns out not to answer. Guessing false for an
       unmeasured row would hide a readable field; guessing true forever would keep offering a control
       whose only outcome is a refusal, and the measurement below is what stops the second. */
    const sampledRows = new Map();          /* id → did the registry hand a row back when it was asked */

    /* ⚠ WRITTEN BY THE ONE THAT ASKED. js/gis-sources.js region() already asks the registry and
       already separates 「行が返ったか」 from 「値が在ったか」 (#R774); this is that observation being
       kept instead of discarded at the end of the call. Nothing here asks on its own behalf: a probe
       fired from a render function would be a request the reader did not make. */
    function noteSampling(id, answered) {
      const key = String(id == null ? '' : id);
      if (!key) return;
      sampledRows.set(key, !!answered);
    }

    /* The three facts this file can answer. `prepared` is not among them on purpose — it belongs to
       js/gis-sources.js, and a second reading of it here is how the two would come to disagree. */
    function samplingOf(id) {
      const key = String(id == null ? '' : id);
      const R = REG();
      const door = !!(R && typeof R.sampleAt === 'function');
      let visible = false;
      try { const s = (R && R.state) ? R.state(key) : null; visible = !!(s && s.on); } catch (_) { visible = false; }
      const known = sampledRows.has(key) ? sampledRows.get(key) : null;
      return {
        /* ⚠ null WHEN THE KERNEL IS NOT MOUNTED TOO: 「訊けなかった」 is not 「能力が無い」. */
        capable: door ? known : null,
        door: door,
        visible: visible,
      };
    }

    function canSample(id) {
      const s = samplingOf(id);
      return !!s.door && s.capable !== false;
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
       「知らない」を「全部だ」の代わりにする shape, one level down.

       ══ ⚠⚠⚠ (#R783) AND NAMING THE LAYER WAS ALL IT DID, SO 「全部調べた」 HAD NO KEEPER ═══════════
       The cursor was `<layer>@<offset>`, which is a position in WHICHEVER list that layer hands over
       next. MEASURED on the shipped code: page 1 of a layer with three rows answers `v=1` and hands
       back `drawn@1`; the same cursor sent back with an attribute condition added answers `v=3` —
       position 1 of a DIFFERENT, filtered set — with `ok:true` and a coverage that says nothing about
       it. A reader paging to the end of that sequence has skipped a row and been told the window was
       exhausted, which is the 「述べていないことを地図が述べる」 shape applied to 「全部見た」.
       ⇒ SO A CURSOR IS A POSITION IN ONE ORDERED ANSWER, AND IT CARRIES WHICH ONE. `<layer>@<sig>@
       <offset>`, where `sig` is a digest of the QUESTION (the window, the conditions, and the row's
       own sentence about when its holding is) AND of the ORDERED ANSWER those produced. A cursor
       whose `sig` does not match what the current request produces is refused BY NAME, with the
       reason in the detail — not clamped, and not read as a position in this set.
       ⚠ WHAT THE ANSWER DIGEST IS AND IS NOT. It is taken from the rows themselves, in the order they
       will be paged in: each row's geometry type and its first position, after the count. So a
       holding that grew, shrank or was reordered between two pages does not resume — which is the
       fact a cursor has to depend on, because the offset means nothing without it. It is NOT a proof
       of identity: two different holdings can digest alike, and this refuses what it can recognise
       rather than claiming to recognise everything. ⚠ It costs one pass over the rows and is only
       taken when a page boundary actually exists (a cursor arrived, or one is about to be handed
       back), so an unpaged read pays nothing.
       ⚠ THE ORDER IS THE SUPPLIER'S OWN, not one invented here: re-sorting would hand the reader a
       sequence the renderer and the document do not have. What makes it safe to page is that the
       digest changes when the order does. */
    function fnv(s, h) {
      let x = h >>> 0;
      const t = String(s);
      for (let i = 0; i < t.length; i++) { x ^= t.charCodeAt(i); x = (x + ((x << 1) + (x << 4) + (x << 7) + (x << 8) + (x << 24))) >>> 0; }
      return (x ^ 0x2f) >>> 0;                               /* one separator, so 「ab」+「c」 ≠ 「a」+「bc」 */
    }
    /* The first position of a geometry, however deeply the coordinates are nested. ⚠ null for a
       geometry with none (a null geometry, an empty ring) rather than a made-up zero. */
    function firstPos(g) {
      let c = g && g.coordinates;
      if (g && g.type === 'GeometryCollection' && Array.isArray(g.geometries)) return firstPos(g.geometries[0]);
      for (let depth = 0; depth < 8; depth++) {
        if (!Array.isArray(c) || !c.length) return null;
        if (typeof c[0] === 'number') return (typeof c[1] === 'number') ? [c[0], c[1]] : null;
        c = c[0];
      }
      return null;
    }
    function pageSig(key, asked, features) {
      let h = 0x811c9dc5;
      h = fnv(key, h);
      let q = '';
      try {
        q = JSON.stringify({
          b: asked.bbox ? [asked.bbox.w, asked.bbox.s, asked.bbox.e, asked.bbox.n] : null,
          /* the conditions as they will be executed, not as they were spelt */
          w: asked.where ? asked.where.map((c) => [String(c.field), String(c.op), (c.value === undefined) ? null : c.value]) : null,
          /* ⚠ THE ROW'S OWN STATEMENT ABOUT WHEN ITS HOLDING IS (state(id).time). A layer that rolled
             over to a new hour is a new holding whatever its count says. */
          t: layerTime(key),
        });
      } catch (_) { q = 'unserialisable'; }                  /* a value we cannot read is its own version */
      h = fnv(q, h);
      h = fnv('#' + features.length, h);
      for (const f of features) {
        const g = f && f.geometry;
        const p = firstPos(g);
        h = fnv((g && g.type) ? g.type : '-', h);
        h = fnv(p ? (p[0] + ',' + p[1]) : '-', h);
      }
      return (h >>> 0).toString(36);
    }
    const cursorFor = (key, sig, offset) => key + '@' + sig + '@' + offset;
    /* The offset, or null when this cursor is not a position in THIS answer. The two refusals are
       told apart by the caller so the reader is told which it was. */
    function cursorOffset(key, sig, cursor) {
      if (cursor == null) return { ok: true, offset: 0 };
      const s = String(cursor), tag = key + '@';
      if (s.indexOf(tag) !== 0) return { ok: false, reason: 'cursor-of-another-layer' };
      const rest = s.slice(tag.length), cut = rest.lastIndexOf('@');
      if (cut < 0) return { ok: false, reason: 'cursor-not-recognised' };
      const n = Number(rest.slice(cut + 1));
      if (!(Number.isInteger(n) && n >= 0)) return { ok: false, reason: 'cursor-not-recognised' };
      if (rest.slice(0, cut) !== sig) return { ok: false, reason: 'query-or-data-changed' };
      return { ok: true, offset: n };
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
      if (Array.isArray(probe)) {
        return {
          sync: true, where: true, cursor: true, limit: true, fields: false,
          fetch: (req) => builtInFetch(key, req || {}),
        };
      }
      /* ══ ⚠⚠⚠ (#R763) 「一度も点けていない」 が 「持っていない」 の代わりになっていた ═══════════════
         The probe above fails for a row whose renderer source does not exist yet, and docs/GIS-CORE.md
         §5.6 wrote that down as the last camera dependency left in this layer: 「表示せずに読み込む扉は
         今のところ無く、これが『画面に依存しない取得』に残っている最後の依存である」.
         ⚠ THE DEPENDENCY WAS ON DRAWING, NOT ON DATA. `heritage`, `volcanoes` and `pharma` each hold a
         bundled document that a module fetches and then writes into a renderer source; the fetch does
         not need the map, and js/layer-packs.js has said so since #R311 by having a second door into
         its own loader 「with no row and no toggle involved」. What was missing was that door being
         ASKABLE from here — so a registration now states one, and a row that has it can be read while
         the camera is somewhere else and while the layer is switched off.
         ⚠ IT IS DISCOVERED, NOT LISTED. Any registration that states a loader becomes readable by
         existing; nothing here names an id (.agents/rules/no-ad-hoc-hardcoding.md §2-4).
         ⚠ AND THE SUPPLIER IT MAKES IS ASYNCHRONOUS AND SAYS SO. Loading is a fetch; claiming
         `sync:true` would have the synchronous door call it and throw the promise away. */
      let loader = null;
      try { loader = (typeof R.loaderOf === 'function') ? R.loaderOf(key) : null; } catch (_) { loader = null; }
      if (typeof loader !== 'function') return null;
      return {
        sync: false, where: true, cursor: true, limit: true, fields: false,
        fetch: (req) => loadedFetch(key, loader, req || {}),
      };
    }

    /* ══ ⚠⚠⚠ (#R783) ONE NARROWING, AND BOTH ROADS TRAVEL IT ══════════════════════════════════════
       supplierFor() declares `where:true, cursor:true, limit:true` for BOTH suppliers it builds, and
       js/gis-sources.js believes a declaration — prepare() lets a condition through precisely because
       the supplier claimed it can execute one. MEASURED on the shipped code, against a loader holding
       three rows v=1,2,3:

           where v>=2      → 1, 2, 3        (the condition was never applied)
           limit 1         → 1, 2, 3        next:null — 「これで全部」 about a page of one
           limit 1, cursor → 1, 2, 3        the position was never read

       and `coverage.filteredBy` said `'supplier'` over every one of them. That is the worst of the
       three: an answer that LOOKS filtered, with real rows in it, and a record claiming the supplier
       did the filtering. The old comment here said 「`where`/`cursor`/`limit` are js/gis-sources.js's
       to apply」, and js/gis-sources.js does not apply them — it refuses a supplier that cannot, and
       this one said it could.
       ⇒ THE FIX IS NOT THREE `if`s ON THIS ROAD. builtInFetch already implements the condition
       executor, the cursor, the limit, the available count and the continuation, so BOTH roads are
       handed to that one implementation and the drawn/undrawn difference shrinks to where the rows
       came from (.agents/rules/no-ad-hoc-hardcoding.md §2-3: the judgement is配られる, not copied).
       ⚠ THE DECLARATION AND THE IMPLEMENTATION ARE ONE FACT NOW, and that is the invariant
       tests/r783-gis-fetch-contract-checks measures: the same request answered from the document and
       from the renderer returns the same ids, the same count and the same continuation. */
    function pageOf(key, all, q) {
      const asked = {
        bbox: (q.bbox == null) ? null : asBox(q.bbox),
        where: (Array.isArray(q.where) && q.where.length) ? q.where : null,
      };
      let fs = all;
      if (asked.where) {
        const sel = selectWhere(fs, asked.where);
        if (!sel.ok) return sel;
        fs = sel.features;
      }
      const total = fs.length;
      const limit = (typeof q.limit === 'number' && isFinite(q.limit) && q.limit > 0) ? Math.floor(q.limit) : null;
      /* ⚠ THE DIGEST IS TAKEN ONLY WHERE A PAGE BOUNDARY IS IN PLAY — a cursor arrived, or a limit
         is about to cut this answer. An unpaged read is the common one and pays nothing for paging. */
      const paging = (q.cursor != null) || (limit != null && limit < total);
      const sig = paging ? pageSig(key, asked, fs) : null;
      const at = cursorOffset(key, sig, q.cursor);
      if (!at.ok) return { ok: false, why: 'bad-param', detail: { param: 'cursor', value: q.cursor, reason: at.reason } };
      const start = at.offset;
      if (start > total) return { ok: false, why: 'bad-param', detail: { param: 'cursor', value: q.cursor, reason: 'past-the-end', available: total } };
      const end = (limit == null) ? total : Math.min(total, start + limit);
      return {
        ok: true,
        features: fs.slice(start, end),
        coverage: {
          /* 「窓に在った件数」 next to what was handed over — the pair that makes 「一部だけ」 visible
             at all (memory: coverage counted is not coverage seen). */
          available: total,
          /* THIS answer holding the whole window, which is a different statement from the row's
             standing declaration and is only true when no page boundary cut it. */
          complete: (start === 0 && end === total),
          /* ⚠ (#R783) WHO EXECUTED THE CONDITIONS, SAID BY THE PARTY THAT EXECUTED THEM.
             js/gis-sources.js used to write `'supplier'` whenever conditions had been ASKED FOR,
             which is a record of the request and not of the work — and it was false on this road. */
          filteredBy: asked.where ? 'supplier' : null,
        },
        /* ⚠ PRESENT EVEN WHEN null, because js/gis-sources.js reads the PROPERTY BEING THERE as the
           supplier having spoken about continuation at all. Omitting it would say 「述べていない」. */
        next: (end < total) ? cursorFor(key, sig || pageSig(key, asked, fs), end) : null,
      };
    }

    /* The loader road: features that came from the row's own document instead of from the renderer.
       The bbox filter is the one thing read() did that this road does not get for free, so it is
       asked of the geometry the same way; everything after it is pageOf above.
       ⚠ A LOADER THAT ANSWERS WITH NOTHING HAS ANSWERED: it is an empty holding, not an unavailable
       one, and the two must not merge. */
    async function loadedFetch(key, loader, q) {
      let fc = null;
      try { fc = await loader(); } catch (e) { return { ok: false, why: 'layer-load-failed', detail: { id: key, message: e && e.message } }; }
      const all = Array.isArray(fc) ? fc : ((fc && Array.isArray(fc.features)) ? fc.features : null);
      if (!all) return { ok: false, why: 'layer-load-failed', detail: { id: key, got: (fc === null ? 'null' : typeof fc) } };
      /* ⚠ THE REGISTRY'S OWN PREDICATE, NOT A SECOND ONE. `narrow` is the same test featuresIn applies
         to the drawn features, so a request answered from the document and the same request answered
         from the renderer return the same rows. A bbox test written here would be a second opinion
         about 「この範囲に入っているか」, and the two would agree until they did not. */
      const R = REG();
      if (q.bbox != null && !(R && typeof R.narrow === 'function')) return { ok: false, why: 'map-unavailable', detail: { needs: 'IntMapLayers.narrow' } };
      const feats = (q.bbox == null) ? all.slice() : R.narrow(all, asPair(q.bbox));
      if (!Array.isArray(feats)) return { ok: false, why: 'layer-load-failed', detail: { id: key, at: 'narrow' } };
      /* ⚠ THE WHOLE REQUEST GOES ON, `bbox` INCLUDED. pageOf does not narrow by it — the window was
         already applied by the registry's own predicate just above — but the cursor is a position in
         the answer to THIS window, so the window is part of what the cursor is bound to. */
      const paged = pageOf(key, feats, q);
      if (!paged.ok) return paged;
      return Object.assign({}, paged, { loaded: true });
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
      /* ⚠ (#R783) AND THE NARROWING IS pageOf's, WHICH IS ALSO THE LOADER ROAD'S. It used to live
         here and only here, which is how the other road came to declare three capabilities it did
         not have. */
      return pageOf(key, r.features, q);
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
      const got = speak(SRC().features(id, acquireReq(o)));
      return registerFeatures(id, o, got);
    }

    /* ⚠ ONE REQUEST SHAPE FOR BOTH DOORS. The synchronous door and the asynchronous one below differ
       in whether they wait; everything they SAY is the same, and two spellings of it would drift. */
    function acquireReq(o) {
      return {
        bbox: (o.bounds == null ? null : o.bounds), limit: o.limit, fields: o.fields, time: o.time,
        where: (o.where == null ? null : o.where), cursor: (o.cursor === undefined ? null : o.cursor),
        /* ⚠ (#R819) 「画面に依存しない母集団で答えてほしい」 は、呼び手にしか言えない。js/gis-sources.js
           refuses `renderer-view-dependent` when a measurement would be assembled out of whatever the
           camera is holding — and it can only refuse a request that SAID it is a measurement. Passing
           `false` here rather than dropping the key keeps the request one shape for both doors; the
           synchronous door below reaches features(), which does not judge it, which is why the field
           is offered to a planner only on the road that does (ACQUIRE.vector). */
        analysis: (o.analysis === true),
      };
    }

    /* ══ ⚠⚠⚠ (#R763) 非同期の扉には、呼び手が 1 つも無かった ══════════════════════════════════════
       js/gis-sources.js has had acquire() — the door that waits — since #R752, and MEASURED: nothing
       in js/ called it, ever. The only supplier the app builds declares `sync:true`, so the
       asynchronous half of the contract was complete wiring with nothing energised
       ([[intmap-wiring-complete-is-not-wiring-live]]). That mattered the moment a supplier had to
       FETCH rather than read what was already drawn — which is exactly what 「表示していないレイヤー
       から取得する」 requires — because features() refuses such a supplier by name
       (`supplier-is-async`) rather than calling it and abandoning the promise.
       ⚠ toDataset IS NOT MADE ASYNC. It is a shipped synchronous contract called from a click handler
       without an await (js/gis-panel.js), and changing it for symmetry would break the caller that
       works. This is the second door, and js/gis-atlas.js — which already awaits toRaster — takes it.
       ⚠ AND IT IS NOT A COPY: both doors hand the same request to js/gis-sources.js and the same
       answer to the same registration. */
    /* ══ ⚠⚠⚠ (#R819) 「窓は取れた。条件はまだ走っていない」 は、読者に出してよい答えではない ═══════
       js/gis-sources.js plan() states WHERE EACH CONDITION RUNS — what the upstream executes and what
       a later stage must — and acquirePlanned() names the second half instead of pretending it ran:
       the result comes back as `kind:'staged'`, never as `kind:'features'`, with the pending
       conditions in `coverage.wherePlan`. That refusal to pretend is the whole value of it, and it is
       only half an answer until somebody RUNS the later stage. This door is where that happens,
       because this door is the one that hands a record to a reader and to Atlas.
       ⚠ THE EXECUTOR IS THE APP'S ONE FILTER, NOT A COMPARISON WRITTEN HERE. js/gis-ops.js owns what
       「>=」 means over a column (the plan itself names it, and this file asks the plan rather than
       spelling the module a second time) — a set of comparisons implemented in this file would be the
       drift .agents/rules/no-ad-hoc-hardcoding.md §1 forbids, and #R783 measured what a second,
       disagreeing implementation of one judgement costs.
       ⚠ AND THE ANSWER'S RECIPE IS THE ACQUISITION, NOT A TWO-STEP CHAIN. The op needs registered
       inputs, so the window is registered and the filtered output is registered; both are working
       records and both are removed, because what a reader can replay is 「この範囲の・この条件の・
       このレイヤーを取り直す」 — a chain ending in an intermediate nobody asked for and nothing can
       reach again is a recipe that cannot be re-run.
       ⚠ NOTHING IS QUIETLY DROPPED ON THE WAY: `plan-unsatisfiable` (a plan that cannot answer the
       question asked) and `renderer-view-dependent` (a measurement the camera would decide) travel
       up as themselves, and the resolved `where-pending-post-stage` is carried in the record rather
       than erased — see resolvedCoverage. */
    async function acquireDataset(id, opts) {
      const o = opts || {};
      /* ⚠ acquirePlanned(), NOT acquire(). The two agree exactly when there is no later stage — the
         same fetch, the same rows, the same cursor — and differ only in that the plan is stated in
         the record even when every condition ran upstream. 「後段は無い」 と 「計画を通っていない」
         must not reach a reader as the same absence (js/gis-sources.js says so at the same seam). */
      const got = speak(await SRC().acquirePlanned(id, acquireReq(o)));
      /* acquire() dispatches on what the source IS, so a caller that asked for features and reached a
         field gets told which door it wanted rather than a grid where it expected rows. */
      if (got && got.ok && got.kind === 'grid') return { ok: false, why: 'layer-is-a-field', detail: { id: String(id), use: 'toRaster' } };
      if (got && got.ok && got.kind === 'staged') return stagedDataset(id, o, got);
      return registerFeatures(id, o, got);
    }

    /* The later stage, run. ⚠ ITS INPUT IS THE WHOLE WINDOW — js/gis-sources.js refuses to hand over a
       staged answer that did not reach the end of it (`plan-unsatisfiable`), which is the one thing
       that makes filtering afterwards an answer rather than 「取れた分のうち条件に合うもの」. */
    async function stagedDataset(id, o, got) {
      const wp = (got.coverage && got.coverage.wherePlan) || {};
      const pending = Array.isArray(wp.pending) ? wp.pending : [];
      /* A staged answer with nothing pending is not staged. Registering a stage that does not exist
         would put a claim in the record that nobody made. */
      if (!pending.length) return registerFeatures(id, o, Object.assign({}, got, { kind: 'features' }));
      const O = OPS();
      /* ⚠ AN EXISTING CODE, CARRIED. js/gis-panel.js already prints 「処理モジュールが読み込まれて
         いないため…」 for exactly this absence (js/gis-project.js raises it for its replay), and an
         answer with the conditions silently unexecuted is the one thing this path exists to stop. */
      if (!O || typeof O.run !== 'function') {
        return { ok: false, why: 'ops-unavailable', detail: { needs: 'IntMapGisOps', stage: 'post', pending: pending } };
      }
      const D = DATA();
      if (!D || typeof D.add !== 'function') return { ok: false, why: 'registry-missing' };
      /* ⚠ THE WINDOW IS REGISTERED WITHOUT THE CALLER'S OWN id: that name belongs to the ANSWER, and
         taking it here would refuse the answer as `id-in-use` against a record of its own. */
      const win = registerFeatures(id, Object.assign({}, o, { id: null }), got);
      if (!win.ok) return win;
      const drop = (recId) => { try { if (recId != null && typeof D.remove === 'function') D.remove(recId); } catch (_) { } };
      let out = null;
      try {
        out = await O.run(
          { op: 'filter', inputs: [win.dataset.id], params: { where: pending } },
          { signal: o.signal || null, onProgress: o.onProgress || null });
      } catch (e) {
        out = { ok: false, why: 'op-failed', detail: { op: 'filter', message: e && e.message } };
      }
      /* ⚠ THE FILTER'S OWN REFUSAL TRAVELS BACK AS ITSELF — 「その列は無い」 is the sentence that tells
         a reader what to change, and js/gis-ops.js is the one that can say it. */
      if (!out || out.ok !== true) { drop(win.dataset.id); return out || { ok: false, why: 'op-failed', detail: { op: 'filter' } }; }
      let kept = null;
      try { kept = out.dataset.features(); } catch (_) { kept = null; }
      if (!Array.isArray(kept)) { drop(out.dataset.id); drop(win.dataset.id); return { ok: false, why: 'op-failed', detail: { op: 'filter', id: out.dataset.id } }; }
      drop(out.dataset.id); drop(win.dataset.id);
      return registerFeatures(id, o, {
        ok: true, kind: 'features', features: kept,
        next: (got.next == null) ? null : got.next,
        coverage: resolvedCoverage(got.coverage, got.plan, kept.length),
      });
    }

    /* ⚠⚠⚠ 解消した理由は、消すのではなく 「解消した」 と述べる。`where-pending-post-stage` is the word
       js/gis-sources.js writes over a whole window whose conditions have not run; deleting it once
       they have would leave a record that cannot be told apart from one that never had a later stage
       — the distinction a reader comparing two answers depends on ([[intmap-two-readers-one-field-list]]
       is the same shape one seam over). So the plan's halves stay, `pending` empties, what ran is
       named, and WHO ran it is read off the plan rather than spelt a second time here. */
    function resolvedCoverage(cov, plan, count) {
      const wp = (cov && cov.wherePlan) || {};
      const ran = Array.isArray(wp.pending) ? wp.pending.slice() : [];
      /* The later stage's own row in the plan: `at` is the role that executed, `by` is the module it
         names. Both are js/gis-sources.js's words, carried. */
      const st = (plan && Array.isArray(plan.stages)) ? plan.stages.find((s) => s && s.does === 'filter') : null;
      const role = (st && st.at != null) ? String(st.at) : 'post';
      const out = Object.assign({}, cov, { count: count });
      const executedBy = (Array.isArray(wp.executedBy) ? wp.executedBy.slice() : []).concat(ran.map(() => role));
      out.wherePlan = {
        upstream: Array.isArray(wp.upstream) ? wp.upstream.slice() : [],
        pending: [],
        executed: ran,
        executedBy: executedBy,
        /* 解消したのは、この理由である（黙って消さない） */
        resolved: (cov && cov.reason === 'where-pending-post-stage') ? cov.reason : null,
        resolvedBy: (st && st.by != null) ? String(st.by) : null,
      };
      /* ⚠ RESTORED, NOT RE-JUDGED. js/gis-sources.js demotes a window that was `all` to `partial` for
         this ONE reason and for no other, so a record still carrying it was complete before the later
         stage was named — and is complete again now that the stage has run. Any other reason is a
         statement about the WINDOW and survives untouched. */
      if (cov && cov.reason === 'where-pending-post-stage' && cov.completeness === 'partial') {
        out.completeness = 'all';
        out.reason = null;
      }
      /* 誰が条件を実行したか——実行した者の記録から導く。Today the plan puts every condition in ONE
         stage, so this is one word; if it ever splits, both are named rather than the flattering one. */
      const who = executedBy.filter((x, i, a) => x != null && a.indexOf(x) === i);
      out.filteredBy = who.length ? (who.length === 1 ? who[0] : who.join('+')) : null;
      return out;
    }

    function registerFeatures(id, o, got) {
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
      /* ⚠ (#R763) THE CALLER'S BAND DECLARATION, WITH THE LAYER'S LABEL ONLY WHERE IT SAID NOTHING.
         `unit` stays its own field because it was already one (a caller that learnt it is not
         wrong) and it wins over the band object's, because it is the more specific statement. */
      const bandIn = (o.band && typeof o.band === 'object') ? o.band : {};
      const got = speak(await SRC().region(key, (o.bounds == null ? null : o.bounds), {
        width: o.width, height: o.height,
        time: (o.time == null ? null : o.time),
        band: Object.assign({}, bandIn, {
          name: (bandIn.name != null) ? bandIn.name : (layerLabel(key) || key),
          unit: (o.unit != null) ? String(o.unit) : (bandIn.unit == null ? null : bandIn.unit),
        }),
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

    /* ══ ⚠⚠⚠ (#R759) 取得の語彙は 1 つで、それを名乗れるのはこの扉である ════════════════════════
       js/gis-sources.js states the acquisition contract — bbox, time, where, fields, limit, cursor,
       signal, onProgress — and js/gis-panel.js and js/gis-atlas.js are the two callers that reach it,
       through toDataset/toRaster. ⚠ MEASURED: the Atlas door passed `layers.toDataset(id, {})` — an
       EMPTY object, every time. So a planner could not ask for 「この範囲の」「この条件に合う」「続きを」
       at all: the contract existed, the panel used a third of it, and the half of the app that plans
       could use none of it. A capability the planner is not told it can pass is a capability it does
       not use ([[intmap-prompt-that-hid-the-tools-in-hand]]).
       ⚠ AND THE FIX IS ONE LIST, NOT A SECOND ONE IN THE PLANNER'S FILE. js/gis-atlas.js validates
       what it was handed against THIS, and a refusal carries it — so a field added to toDataset
       tomorrow is reachable from Atlas the same day, and a field a planner invents is refused by name
       instead of being dropped silently. That silent drop is [[intmap-two-readers-one-field-list]],
       which this project has already shipped once, in production, over `map.highlight`.
       ⚠ WHAT IS NOT IN IT: `signal` and `onProgress` are the caller's own plumbing, not a request;
       `id` and `title` name the record rather than choosing the data. A planner states neither. */
    /* ⚠⚠⚠ (#R763) `time` AND `band` WERE IMPLEMENTED BELOW AND UNSAYABLE FROM HERE. js/gis-sources.js
       region() has taken both since #R752 — it puts `time` into the coverage it answers with
       (`requestedTime`/`timeEstablished`) and hands `band` to a supplier that can answer for a whole
       window — and acquire() passes both through. But this list is what js/gis-atlas.js validates a
       planner's request against, and a field that is not in it is refused BY NAME. So
       「2020 年と 2025 年のこの範囲を取って同じ格子に合わせる」 could not be stated at all: the planner
       had to move the map's clock and read whatever was on screen, which is the camera dependency
       this whole layer exists to remove. ⚠ AND toRaster DID NOT FORWARD THEM EITHER — the capability
       was reachable from nowhere, which is [[intmap-prompt-that-hid-the-tools-in-hand]] with the
       vocabulary instead of the tools. */
    /* ⚠⚠⚠ (#R819) `analysis` IS ON THE VECTOR ROAD AND ON NO OTHER, AND THAT IS A STATEMENT. It says
       「この取得は測定である」, and js/gis-sources.js is what acts on it: an answer assembled out of
       whatever the renderer holds for the current camera is REFUSED (`renderer-view-dependent`)
       instead of being handed over as a population. A planner that cannot say it has no way to ask
       for a number that does not change when a reader pans — the capability existed below and was
       unnameable from here, which is [[intmap-prompt-that-hid-the-tools-in-hand]].
       ⚠ IT IS NOT OFFERED FOR A GRID, because nothing would act on it there: toRaster() goes through
       region(), which burns the caller's own window at the caller's own resolution and says so
       (`grid-is-a-sample`). A field a door accepts and nothing reads is the silent drop
       [[intmap-two-readers-one-field-list]] measured in production, and offering it here would be
       this file inventing a promise js/gis-sources.js has not made. */
    const ACQUIRE = {
      vector: ['bounds', 'where', 'fields', 'limit', 'cursor', 'time', 'analysis'],
      raster: ['bounds', 'width', 'height', 'where', 'unit', 'time', 'band'],
    };
    function acquireFields(kind) { const k = String(kind == null ? 'vector' : kind); return (ACQUIRE[k] || []).slice(); }

    /* (#R756) js/gis-sources.js asks this when it is looking for a supplier and has none: see the
       section above for why the answer is built from the registration rather than kept in a list. */
    /* (#R763) acquireDataset is the door that waits — see its note above for why toDataset is not
       simply made async, and why the planner takes this one. */
    /* (#R783) canSample answers 「訊けるか」 as a capability; samplingOf is the four facts it used to
       flatten into one boolean, and noteSampling is how the party that ASKS the registry hands its
       observation back (js/gis-sources.js region()). */
    const API = { sources, read, toDataset, acquireDataset, toRaster, canSample, samplingOf, noteSampling, supplierFor, acquireFields };
    try { window.IntMapGisLayers = API; } catch (_) { }
    return API;
  })();
}
