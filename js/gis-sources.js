/* ============================================================================
 *  IntMap · WHAT THE ANSWER WAS TAKEN FROM — window.IntMapGisSources   (#R749)
 * ----------------------------------------------------------------------------
 *  js/gis-layers.js opened the door from 「地図に出ているもの」 to 「分析できるもの」. What it could
 *  not say is the thing that decides whether the analysis means anything:
 *
 *      ⚠⚠⚠ ASKING FOR THE WORLD IS NOT THE SAME AS HAVING BEEN GIVEN THE WORLD.
 *
 *  The bridge asks a layer for [[-180,-90],[180,90]] because the layer contract has one door and no
 *  word for 「everything」 — and then hands back whatever came, with nothing attached that says what
 *  it was. But what comes back is what the RENDERER is holding: a source a module refreshed for the
 *  current view, a list the upstream capped, a field that is only loaded while its layer is on. So
 *  「この範囲の平均は」 came out as a number with the authority of a measurement over a region, when
 *  it was a measurement over 「いま画面に載っていたもの」 — and neither the reader nor Atlas could
 *  tell the two apart, because nothing in the dataset distinguished them.
 *
 *  This is the shape this repository keeps recording: 被覆を件数で報告すると「一部だけ」が原理的に
 *  見えない ([[intmap-coverage-counted-is-not-coverage-seen]]), and 「記録が答えなかった」 and
 *  「そこには無かった」 must not arrive as one sentence. So this file adds one value to every
 *  acquisition — `coverage` — and it is the only thing here that is new. Everything else is a
 *  delegation: the features come from js/gis-layers.js's read(), the grid arithmetic from
 *  js/gis-raster.js, the box predicate from js/map-ui.js. Nothing is judged twice.
 *
 *  ══ ⚠⚠⚠ `all` IS A CLAIM, AND A CLAIM NEEDS A CLAIMANT ═══════════════════════════════════════
 *  `completeness:'all'` says 「求めた窓のうち、供給元が持っているものは全部ここに在る」. NOTHING
 *  REACHABLE FROM HERE CAN ESTABLISH THAT BY ITSELF: a renderer source holding 400 aircraft is
 *  indistinguishable, from the outside, from a world-wide list and from a fetch for the current
 *  viewport. Guessing would be 「知らない」を「全部だ」の代わりにする — the defect
 *  .agents/rules/historical-verification.md §3 is about, in a new place.
 *  ⇒ SO `all` IS ONLY REACHED WHEN THE SUPPLIER ITSELF SAYS SO, through `declare()`, and the
 *  declaration is CHECKED against the window that was asked for. With no declaration the answer is
 *  `partial` and the reason says which kind of silence it was. ⚠ TODAY NO MODULE DECLARES, so today
 *  every acquisition reads `partial`. That is not a defect of this file — it is the true state of the
 *  app, stated for the first time, and it is what a module has to fix by saying what it holds.
 *
 *  ⚠ AND ONE THING IS MEASURED RATHER THAN DECLARED. When the caller asked for everything and no
 *  declaration exists, this file compares what the supplier hands over for the WORLD against what it
 *  hands over for the CURRENT CAMERA. If the two are the same size, every feature the supplier holds
 *  is on screen — which is what a view-bound supplier looks like, and is also what a genuinely small
 *  dataset under a wide camera looks like. So the verdict is not 「view-bound」 but
 *  `indistinguishable-from-view`: a measurement reported as what it is, which is the whole subject of
 *  this file. It is taken only when it can discriminate (the camera is narrower than the world) and
 *  only when `all` was otherwise at stake, so it costs one extra pass and never runs in a loop.
 *
 *  ══ REFUSALS ARE CODES, AND THE VOCABULARY IS THE APP'S ═══════════════════════════════════════
 *  Every code returned here is one js/gis-panel.js already has nine languages for, except
 *  `layer-not-visible` — which is the one fact this layer adds (「消えている供給元に訊いたので何も
 *  返らなかった」 as opposed to 「訊けたが 0 件だった」), and which js/gis-layers.js translates into the
 *  app's existing `layer-not-sampling` at the door a reader actually reaches.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③) and window.* is read at CALL time, so this
 *  module imports in Node with no DOM and refuses by name instead of throwing.
 * ==========================================================================*/

export function makeGisSources() {
  return (function () {

    /* Read at call time — never captured. */
    function LAYERS() { try { return (typeof window !== 'undefined' && window.IntMapGisLayers) || null; } catch (_) { return null; } }
    function REG() { try { return (typeof window !== 'undefined' && window.IntMapLayers) || null; } catch (_) { return null; } }
    function RASTER() { try { return (typeof window !== 'undefined' && window.IntMapGisRaster) || null; } catch (_) { return null; } }
    function DATA() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }
    function GE() { try { return (typeof window !== 'undefined' && window.IntMapGeoEngine) || null; } catch (_) { return null; } }

    /* 「everything」, in the only vocabulary the layer contract has (js/gis-layers.js says why). */
    const WHOLE_WORLD = { w: -180, s: -90, e: 180, n: 90 };

    function refuse(why, detail) { return detail === undefined ? { ok: false, why: why } : { ok: false, why: why, detail: detail }; }

    const isNum = (v) => typeof v === 'number' && isFinite(v);
    const isPosInt = (v) => isNum(v) && Number.isInteger(v) && v > 0;

    function asBox(b) {
      if (!b) return null;
      try {
        if (typeof b.getWest === 'function') return { w: b.getWest(), s: b.getSouth(), e: b.getEast(), n: b.getNorth() };
        if (Array.isArray(b) && b.length === 2 && Array.isArray(b[0])) return { w: +b[0][0], s: +b[0][1], e: +b[1][0], n: +b[1][1] };
        if (Array.isArray(b) && b.length === 4 && b.every(isNum)) return { w: +b[0], s: +b[1], e: +b[2], n: +b[3] };
        if (b.w != null && b.e != null) return { w: +b.w, s: +b.s, e: +b.e, n: +b.n };
      } catch (_) { }
      return null;
    }
    const finiteBox = (x) => !!x && [x.w, x.s, x.e, x.n].every(isNum);
    const copyBox = (x) => ({ w: x.w, s: x.s, e: x.e, n: x.n });
    /* Containment, in the plane the boxes are written in. Used for ONE thing: does a declared extent
       cover the window that was asked for. A declaration that crosses the seam is written as two
       boxes by its author, because this file will not guess which side of ±180 they meant. */
    const contains = (outer, inner) => outer.w <= inner.w && outer.s <= inner.s && outer.e >= inner.e && outer.n >= inner.n;
    const intersectBox = (a, b) => ({ w: Math.max(a.w, b.w), s: Math.max(a.s, b.s), e: Math.min(a.e, b.e), n: Math.min(a.n, b.n) });

    /* ── the vocabulary of an answer's coverage ───────────────────────────────────────────────── */

    /* ⚠ THREE WORDS, AND THE THIRD IS NOT A WEAKER SECOND. `partial` means 「求めた窓の一部しか
       答えていない（かもしれない）」 — something was, or may have been, left out of the window.
       `sample` means 「窓は全部答えたが、答えは元のものそのものではない」 — a field read at a
       resolution the caller chose, or a list cut at a count the caller chose. The two need different
       things from a reader: a partial answer is made whole by asking again differently; a sample is
       made finer by asking again with different numbers, and is never made whole. */
    const COMPLETENESS = ['all', 'partial', 'sample'];

    /* Why the answer is not `all`. ⚠ EVERY ONE OF THESE IS A THING THAT WAS OBSERVED OR DECLARED,
       never a default: an answer with no reason is an `all`. */
    const REASONS = [
      'extent-undeclared',            /* nobody said what the supplier holds — the state of the app today */
      'completeness-undeclared',      /* it said WHERE it is, not that it holds all of what is there */
      'extent-narrower-than-request', /* the supplier declared an extent, and it does not cover the window */
      'supplier-view-bound',          /* the supplier declared that it keeps only what the camera needs */
      'indistinguishable-from-view',  /* measured: everything it holds is inside the current camera */
      'limit-truncated',              /* the caller's own limit cut the answer */
      'time-not-established',         /* a time was asked for and nothing establishes that this is it */
      'grid-is-a-sample',             /* a field burnt at the caller's resolution is a sample by construction */
    ];

    /* ── declarations: the only route to `all` ────────────────────────────────────────────────── */

    /* A module that KNOWS what it holds says so here. ⚠ THIS IS NOT A TABLE OF SOURCES KEPT IN THIS
       FILE. Nothing is written down: the map is empty until a supplier fills its own row, and a
       supplier this file has never heard of declares exactly as well as one it has.
       {extent:{w,s,e,n}|null, viewBound:bool, live:bool, asOf:string|null, resolution:any,
        complete:bool} — `complete` is 「宣言した extent の中では全部持っている」. Without it an
       extent narrows the reason but never reaches `all`, because 「どこまでを覆うか」 and
       「その中を漏れなく持っているか」 are two statements. */
    const declared = new Map();

    function declare(id, decl) {
      const key = String(id == null ? '' : id);
      if (!key) return refuse('bad-param', { param: 'id', value: id });
      if (decl === null) { declared.delete(key); return { ok: true, id: key, declaration: null }; }
      if (!decl || typeof decl !== 'object') return refuse('bad-param', { param: 'declaration', value: decl });
      let extent = null;
      if (decl.extent != null) {
        extent = asBox(decl.extent);
        if (!finiteBox(extent)) return refuse('bad-param', { param: 'declaration.extent', value: decl.extent });
        extent = copyBox(extent);
      }
      const d = {
        extent: extent,
        complete: decl.complete === true,
        viewBound: decl.viewBound === true,
        live: (decl.live == null) ? null : (decl.live === true),
        asOf: (decl.asOf == null || decl.asOf === '') ? null : String(decl.asOf),
        resolution: (decl.resolution === undefined) ? null : decl.resolution,
      };
      declared.set(key, d);
      return { ok: true, id: key, declaration: d };
    }

    function declarationOf(id) { const d = declared.get(String(id)); return d || null; }

    /* ── what the registry says about one row ─────────────────────────────────────────────────── */

    function stateOf(id) {
      const R = REG();
      try { return (R && R.state) ? R.state(String(id)) : null; } catch (_) { return null; }
    }

    /* The layer's own sentence about WHEN it is, and the moment ONLY when it actually reads as one.
       js/gis-layers.js states the rule and the registry that owns it (IntMapData.momentOf); this is
       the same call, not a second reading of the same string. */
    function statedTime(id) {
      const s = stateOf(id);
      const t = s && s.time;
      return (t == null || t === '') ? null : String(t);
    }
    function momentOf(sentence) {
      const D = DATA();
      try { return (sentence && D && D.momentOf) ? D.momentOf(sentence) : null; } catch (_) { return null; }
    }

    /* ── list(): discovered, never written ────────────────────────────────────────────────────── */

    /* ⚠ THE POPULATION IS js/gis-layers.js's sources() PLUS THE REGISTRY ROWS IT DID NOT OFFER.
       The first is already a count-up rather than a list (it asks the layer registry and the
       renderer's own style); the second is every other row the registry knows, and those are the
       rows that answer 「その地点の値は」 instead of handing features over — the FIELDS. A row that
       answers neither is still listed as a field candidate, because `IntMapLayers` has exactly one
       door for that question and no way to ask in advance whether it is answered; what it actually
       has is MEASURED at acquisition and refused by name (`layer-values-not-numeric`).
       ⇒ So `kind:'grid'` here means 「場として訊ける候補」, not 「値を持つ」. */
    function list() {
      const out = [];
      const seen = new Set();
      const L = LAYERS();
      let featureRows = [];
      try { featureRows = (L && typeof L.sources === 'function') ? (L.sources() || []) : []; } catch (_) { featureRows = []; }
      for (const s of featureRows) {
        if (!s || s.id == null) continue;
        const id = String(s.id);
        seen.add(id);
        out.push(entry(id, s.label == null ? id : String(s.label), 'features', s));
      }
      const R = REG();
      let ids = [];
      try { ids = (R && typeof R.list === 'function') ? R.list().map(String) : []; } catch (_) { ids = []; }
      for (const id of ids) {
        if (seen.has(id)) continue;
        const st = stateOf(id);
        if (!st) continue;                       /* state() did not answer: not a readable row */
        out.push(entry(id, st.label == null ? id : String(st.label), 'grid', null));
      }
      return out;
    }

    function entry(id, title, kind, featureRow) {
      const d = declarationOf(id);
      const st = stateOf(id);
      const stated = statedTime(id);
      return {
        id: id,
        title: title,
        kind: kind,
        /* ⚠ null IS 「宣言が無い」, NOT 「生きていない」 — the same distinction js/gis-raster.js draws
           for `nodata`. Nothing reachable from here can watch a source refresh itself. */
        live: d ? d.live : null,
        needsVisible: needsVisible(id, kind, st, featureRow, d),
        /* The extent its supplier DECLARED, or null. ⚠ NOT the bounding box of what came back: that
           is a statement about today's contents, and reading it as an extent is exactly how 「いま
           画面にあるもの」 becomes 「そのレイヤーの範囲」. What was actually served is in
           coverage.served, per acquisition, where it belongs. */
        bounds: d && d.extent ? copyBox(d.extent) : null,
        resolution: d ? d.resolution : null,
        asOf: (d && d.asOf) || (momentOf(stated) ? stated : null),
      };
    }

    /* ⚠ THREE ANSWERS, AND THE THIRD IS null. A field is loaded by the layer that draws it when that
       layer is switched on (docs/GIS-CORE.md §5.1 records the measurement: sampling one that is off
       answers null for every pixel), so a grid candidate needs its layer visible unless its supplier
       declared otherwise. A feature row that is OFF and still handed features over has just proved it
       does not (false). A row that is ON cannot be asked the question at all without switching it off
       behind the reader's back — so it is null, and region() MEASURES it at the moment it matters. */
    function needsVisible(id, kind, st, featureRow, d) {
      if (d && d.viewBound === true) return true;
      const on = !!(st && st.on);
      if (kind === 'grid') return d && d.extent ? null : true;
      if (on) return null;
      return !(featureRow && typeof featureRow.count === 'number' && featureRow.count > 0);
    }

    function entryFor(id) {
      const key = String(id == null ? '' : id);
      const all = list();
      for (const e of all) if (e.id === key) return e;
      return null;
    }

    /* ── coverage: the one value this file adds ───────────────────────────────────────────────── */

    /* ⚠ ORDERED, AND THE ORDER IS THE ARGUMENT. The first rule that holds decides, because each one
       is a stronger statement about the answer than the ones below it: a truncated list is a sample
       whatever else is true of its supplier; a field burnt at a chosen resolution is a sample even if
       its supplier declared the whole world; a supplier that keeps only the view cannot be complete
       over a window larger than the view. `all` is what is left when nothing was left out — never a
       default, and never reachable without a declaration (see the header). */
    function coverageOf(m) {
      const requested = {
        bbox: m.requestedBox ? copyBox(m.requestedBox) : null,
        time: m.requestedTime == null ? null : m.requestedTime,
        limit: isPosInt(m.limit) ? m.limit : null,
        fields: Array.isArray(m.fields) ? m.fields.slice() : null,
      };
      const base = {
        requested: requested,
        served: m.servedBox ? copyBox(m.servedBox) : null,
        count: (typeof m.count === 'number') ? m.count : null,
        asOf: m.asOf == null ? null : m.asOf,
        resolution: m.resolution === undefined ? null : m.resolution,
      };
      const say = (completeness, reason, extra) => {
        const out = Object.assign({ completeness: completeness, reason: reason }, base);
        if (extra) Object.assign(out, extra);
        return out;
      };
      const d = m.declaration || null;

      /* ⚠ THE WINDOW A CALLER DID NOT NARROW IS THE WORLD, and it is measured as the world here: a
         supplier declaring one country, asked for 「everything」, has not answered everything. */
      const reqBox = m.requestedBox || WHOLE_WORLD;

      if (m.truncated) return say('sample', 'limit-truncated', { available: m.available == null ? null : m.available });
      if (m.kind === 'grid') return say('sample', 'grid-is-a-sample');
      if (d && d.viewBound) return say('partial', 'supplier-view-bound');
      if (d && d.extent && !contains(d.extent, reqBox)) return say('partial', 'extent-narrower-than-request');
      if (!d) return say('partial', m.viewEvidence ? 'indistinguishable-from-view' : 'extent-undeclared');
      if (!d.complete) return say('partial', 'completeness-undeclared');
      /* ⚠ A TIME THAT WAS ASKED FOR AND NOT ESTABLISHED IS NOT AN `all`. Handing back today's ships
         for a question about 1889 with `completeness:'all'` would be a claim nobody made — the
         defect .agents/rules/historical-verification.md §2-3 names. */
      if (m.requestedTime != null && !m.timeEstablished) return say('partial', 'time-not-established');
      return say('all', null);
    }

    /* ── measured: is everything this supplier holds already on screen? ───────────────────────── */

    function cameraBox() {
      const E = GE();
      try {
        const b = E && E.camera && E.camera.getBounds ? E.camera.getBounds() : null;
        const box = asBox(b);
        return finiteBox(box) ? box : null;
      } catch (_) { return null; }
    }

    /* Returns true when the supplier hands over no more for the WORLD than it does for the camera —
       see the header for why that is reported as `indistinguishable-from-view` and not as a verdict.
       ⚠ TAKEN ONLY WHEN IT CAN DISCRIMINATE: against a camera that already sees the world every
       supplier passes this test trivially, and a trivially-passed test is a measurement of nothing. */
    function viewEvidence(id, servedCount) {
      const cam = cameraBox();
      if (!cam) return false;
      if (!(cam.e - cam.w < 360 || cam.n - cam.s < 180)) return false;
      const L = LAYERS();
      if (!L || typeof L.read !== 'function') return false;
      let inView;
      try { inView = L.read(id, { bounds: [[cam.w, cam.s], [cam.e, cam.n]] }); } catch (_) { return false; }
      if (!inView || !inView.ok || !Array.isArray(inView.features)) return false;
      return inView.features.length >= servedCount;
    }

    /* ── features(): the synchronous door ─────────────────────────────────────────────────────── */

    /* ⚠ SYNCHRONOUS ON PURPOSE. js/gis-layers.js's toDataset() is called from a click handler in
       js/gis-panel.js and from js/gis-atlas.js without an await, and it has been synchronous since
       #R732; making it async to fit a uniform door would change a shipped contract for the sake of
       symmetry. acquire() below is the async door, and it dispatches to this one. */
    function features(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const L = LAYERS();
      if (!L || typeof L.read !== 'function') return refuse('map-unavailable', { needs: 'IntMapGisLayers' });

      let requestedBox = null;
      if (o.bbox != null) {
        requestedBox = asBox(o.bbox);
        /* A bounds that cannot be read is not 「no bounds」 — treating it as 「everything」 answers a
           different question, silently and with real data (js/gis-layers.js says the same). */
        if (!finiteBox(requestedBox)) return refuse('bad-param', { param: 'bbox', value: o.bbox });
      }
      const win = requestedBox || WHOLE_WORLD;

      const r = L.read(key, requestedBox ? { bounds: [[win.w, win.s], [win.e, win.n]] } : {});
      if (!r.ok) {
        /* ⚠ 「訊けなかった」 と 「0 件だった」 を同じ答えにしない. A supplier whose layer is switched
           off has not answered 「そこには何も無い」 — it has not been asked, because the module that
           loads its contents does so when the layer comes on. */
        if (r.why === 'no-features' && isOff(key)) return refuse('layer-not-visible', { id: key, from: (r.detail && r.detail.from) || null });
        return r;
      }

      let out = r.features;
      const available = out.length;
      let truncated = false;
      const limit = isPosInt(o.limit) ? o.limit : null;
      if (limit != null && out.length > limit) { out = out.slice(0, limit); truncated = true; }
      if (Array.isArray(o.fields) && o.fields.length) out = project(out, o.fields);

      const stated = statedTime(key);
      const moment = momentOf(stated);
      const coverage = coverageOf({
        kind: 'features',
        requestedBox: requestedBox, servedBox: servedBoxOf(win, declarationOf(key)),
        requestedTime: o.time == null ? null : o.time,
        timeEstablished: o.time != null && moment != null && String(o.time) === stated,
        limit: limit, fields: Array.isArray(o.fields) ? o.fields : null,
        count: out.length, available: available, truncated: truncated,
        asOf: moment ? stated : null,
        /* SIMPLIFICATION, and there is none: read() hands geometry over whole (js/gis-layers.js §
           WHAT IS READ IS WHAT IS THERE), so the honest value is 'none' rather than null — null here
           would read as 「測れなかった」, which is a different statement. */
        resolution: 'none',
        declaration: declarationOf(key),
        viewEvidence: (requestedBox == null && !declarationOf(key)) ? viewEvidence(key, available) : false,
      });
      return { ok: true, kind: 'features', features: out, coverage: coverage };
    }

    function servedBoxOf(win, d) {
      if (d && d.extent) return intersectBox(win, d.extent);
      return win;
    }

    function isOff(id) { const s = stateOf(id); return !!(s && s.on === false); }

    /* A copy carrying only the properties the caller named. ⚠ A NEW OBJECT, not an edit: the feature
       objects belong to the renderer's source, and writing on them would change what the map draws.
       ⚠ A NAMED FIELD THAT THE FEATURE DOES NOT HAVE IS ABSENT, not null — a null would be a value
       the source never wrote, and js/gis-datasets.js reads an absent property as 「無い」. */
    function project(fs, fields) {
      const want = fields.map(String);
      return fs.map((f) => {
        const p = (f && f.properties) || {};
        const kept = {};
        for (const k of want) if (Object.prototype.hasOwnProperty.call(p, k)) kept[k] = p[k];
        return { type: 'Feature', properties: kept, geometry: (f && f.geometry) || null };
      });
    }

    /* ── region(): a field read as a region, not a pixel at a time ────────────────────────────── */

    /* ⚠ (#R749) THE OLD PATH ASKED `sampleAt` ONCE PER PIXEL AND REQUIRED THE LAYER TO BE ON.
       Both were stated as facts about the world and only one of them is: the contract really does
       have one position per call (so this door still makes one call per pixel — see
       js/gis-raster.js's fromSamplerAsync note on why a bulk parameter here would be an export with
       no caller), but 「消えているレイヤーは値を持たない」 was an ASSUMPTION applied to every row.
       Some fields answer while their layer is off — a cached sampler, a field another module keeps
       loaded — and refusing them was refusing data that was there.
       ⇒ SO IT IS MEASURED: when the layer is off, one probe is taken; a number means the field
       answers and the read proceeds, anything else means it does not and the refusal is
       `layer-not-visible` — 「訊けなかった」 said as itself rather than returned as a grid of holes. */
    async function region(id, box, opts) {
      const o = opts || {};
      const key = String(id == null ? '' : id);
      const R = REG(), RS = RASTER();
      if (!R || typeof R.sampleAt !== 'function') return refuse('map-unavailable', { needs: 'sampleAt' });
      if (!RS || typeof RS.fromSamplerAsync !== 'function') return refuse('map-unavailable', { needs: 'IntMapGisRaster' });
      if (!entryFor(key)) return refuse('layer-unknown', { id: key });

      const win = (box == null) ? copyBox(WHOLE_WORLD) : asBox(box);
      if (!finiteBox(win)) return refuse('bad-param', { param: 'bounds', value: box });
      if (!isPosInt(o.width)) return refuse('bad-param', { param: 'width', value: o.width });
      if (!isPosInt(o.height)) return refuse('bad-param', { param: 'height', value: o.height });
      if (!(win.e > win.w) || !(win.n > win.s)) return refuse('bad-param', { param: 'bounds', value: [win.w, win.s, win.e, win.n] });

      const D = DATA();
      const asNum = (D && D.asNumber) ? D.asNumber : ((v) => (isNum(v) ? v : null));
      /* One position, through the registry's own door, with the answer for THIS row picked out of
         what it returns for all of them. */
      let textSeen = null;
      async function sampleOne(lng, lat) {
        let got;
        try { got = await R.sampleAt(lng, lat, [key]); } catch (_) { return null; }
        const hit = Array.isArray(got) ? got.find((x) => x && String(x.id) === key) : null;
        if (!hit) return null;
        const v = asNum(hit.value);
        if (v == null && textSeen == null && hit.value != null && hit.value !== '') textSeen = String(hit.value);
        return v;
      }

      if (isOff(key)) {
        const probe = await sampleOne((win.w + win.e) / 2, (win.s + win.n) / 2);
        if (!isNum(probe)) return refuse('layer-not-visible', { id: key });
      }

      const st = stateOf(key);
      const bandSpec = (o.band && typeof o.band === 'object') ? o.band : {};
      const baked = await RS.fromSamplerAsync({
        bounds: [win.w, win.s, win.e, win.n],
        width: o.width, height: o.height,
        band: {
          name: bandSpec.name != null ? bandSpec.name : ((st && st.label) || key),
          unit: bandSpec.unit == null ? null : bandSpec.unit,
          nodata: bandSpec.nodata,
        },
        sample: sampleOne,
        signal: o.signal || null,
        onProgress: o.onProgress || null,
      });
      if (!baked.ok) return baked;
      /* ⚠ A GRID WITH NO NUMBERS IN IT IS NOT A GRID, and what the layer DID answer with is the
         sentence the reader needs: a field answering 「12 °C」 has values, it just does not have them
         as numbers, and that is a different thing to fix. */
      if (!baked.filled) return refuse('layer-values-not-numeric', { id: key, sample: (baked.textSeen != null) ? baked.textSeen : textSeen });

      const stated = statedTime(key);
      const moment = momentOf(stated);
      const g = baked.raster.grid;
      const coverage = coverageOf({
        kind: 'grid',
        requestedBox: (box == null) ? null : copyBox(win), servedBox: win,
        requestedTime: o.time == null ? null : o.time,
        timeEstablished: o.time != null && moment != null && String(o.time) === stated,
        count: baked.filled,
        asOf: moment ? stated : null,
        resolution: { pixelLng: g.pixelLng, pixelLat: g.pixelLat, width: baked.raster.width, height: baked.raster.height },
        declaration: declarationOf(key),
      });
      return { ok: true, kind: 'grid', grid: baked.raster, filled: baked.filled, empty: baked.empty, failed: baked.failed, coverage: coverage };
    }

    /* ── acquire(): one door, dispatching on what the supplier is ─────────────────────────────── */

    /* ⚠ IT DECIDES NOTHING THE TWO DOORS ABOVE DO NOT. This exists so a caller that does not know
       whether a source hands over features or answers as a field can still ask — which is the
       position js/gis-atlas.js's planner is in — and so the `coverage` contract has ONE shape
       whichever kind answered. */
    async function acquire(id, req) {
      const o = req || {};
      const key = String(id == null ? '' : id);
      const ent = entryFor(key);
      if (!ent) {
        /* Say which of the two silences this is: no map at all, or a map that does not know this id. */
        if (!LAYERS() && !REG()) return refuse('map-unavailable', { needs: 'IntMapGisLayers' });
        return refuse('layer-unknown', { id: key });
      }
      if (ent.kind === 'features') return features(key, o);
      const box = (o.bbox == null) ? null : o.bbox;
      return region(key, box, {
        width: o.width, height: o.height, band: o.band, time: o.time,
        signal: (o.ctx && o.ctx.signal) || o.signal || null,
        onProgress: (o.ctx && o.ctx.onProgress) || o.onProgress || null,
      });
    }

    const API = {
      list, acquire, features, region, declare, declarationOf,
      /* the vocabularies, so a UI or a check reads them from the file that decides them rather than
         keeping a second copy (docs/GIS-CORE.md §2.1) */
      completenessValues: () => COMPLETENESS.slice(),
      coverageReasons: () => REASONS.slice(),
    };
    try { window.IntMapGisSources = API; } catch (_) { }
    return API;
  })();
}
