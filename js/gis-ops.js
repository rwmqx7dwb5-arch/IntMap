/* ============================================================================
 *  IntMap · THE OPS — window.IntMapGisOps   (#R729)
 * ----------------------------------------------------------------------------
 *  js/gis-datasets.js made 「データセット」 one thing whatever produced it. This file is the reason
 *  that mattered: AN OP'S OUTPUT IS REGISTERED THE SAME WAY AN IMPORT IS, so it is the input of the
 *  next op with no special case. 「5km バッファ」→「その中の地震だけ」→「県ごとに数える」 is three
 *  registrations, not one hard-coded pipeline, and the chain is re-runnable because every step
 *  writes {kind:'op', op, inputs, params} as its provenance — the recipe, not a label.
 *
 *  ══ WHAT THIS FILE DECLARES, AND WHAT IT REFUSES ══════════════════════════════════════════════
 *  Nine ops: filter, buffer, clip, intersect, difference, union, dissolve, relate, aggregate. Each
 *  DECLARES its inputs, the geometry each input must be, and its parameters; ops() is the only thing
 *  a panel reads. A UI that carried its own list of 「buffer は半径を聞く」 would be the hand-written
 *  list .agents/rules/no-ad-hoc-hardcoding.md forbids — it decides for the ops that exist today and
 *  silently omits the tenth one. (#R725 is the round that made the work list read the capability's
 *  own declared arguments for the same reason.)
 *
 *  ⚠ AND THERE IS NO SECOND LIST BESIDE DECL (#R732). ops() used to map over
 *  `ORDER = ['filter','buffer','clip','aggregate']`, one line under the comment above — so an op
 *  added to DECL and forgotten there would answer run() and never appear in the panel. ORDER is
 *  Object.keys(DECL) now, and the dispatch in run() is a table keyed the same way, because the
 *  if-chain it replaced ended in an unconditional `else` that would have run aggregate for it.
 *
 *  ⚠ REFUSALS ARE CODES, NOT SENTENCES. { ok:false, why, detail } — the nine languages live at the
 *  call site, exactly as js/geo-import.js does it. This module has no business knowing what UI it
 *  is in, and a sentence baked in here would be an English-only sentence.
 *
 *  ══ WHAT #R732 STOPPED REFUSING, AND WHY THAT IS NOT A RELAXATION ═════════════════════════════
 *  #R729 refused two things by name, honestly, because it had no engine:
 *    · `buffer-needs-points` — a buffer of a line or a polygon was not implemented, and a bead of
 *      per-vertex disks called 「5km 圏」 would have been the ハリボテ CONSTITUTION.md forbids.
 *    · `clip-window-not-convex` — Sutherland–Hodgman is only correct for a convex window, so the
 *      convexity of every clipper ring was MEASURED and a ward with a hole was turned away.
 *  js/gis-geometry.js is that engine. Neither code is raised by anything now: the buffer is the
 *  Minkowski sum of any geometry with a geodesic disk, and the clip is a Martinez–Rueda sweep-line
 *  that keeps holes, returns disjoint pieces as disjoint pieces, and does not care about concavity.
 *  ⚠ WHAT REPLACED THEM IS NOT SILENCE. An op that needs the kernel declares `needsGeometry`, run()
 *  awaits its lazy load, and a kernel that did not arrive is `geometry-unavailable` — because
 *  「訊けなかった」 and 「0 件だった」 must not reach the reader as the same answer.
 *
 *  ⚠ THE ARITHMETIC THAT IS STILL HERE IS THE ARITHMETIC ABOUT VALUES, NOT SHAPES: which rows pass
 *  a condition, which column is summed, what is written into the output and what is refused because
 *  it would overwrite something. The shapes are the kernel's. areaKm2 stays here because it is the
 *  number this file writes onto its own rows.
 *
 *  AREA IS NOT PLANAR. `areaKm2` is the spherical excess (Chamberlain–Duquette), outer rings added
 *  and holes subtracted, on IntMapGeodesy._R_EARTH_KM — the one radius the rest of the app uses. A
 *  planar degree area would be wrong by cos φ, i.e. by half at 60°, which is most of Europe. See the
 *  note on ringAreaKm2 for the measurement that forced the window it reads a ring in (a polar buffer
 *  whose area came back as the rest of the planet).
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would have been a global before the bundle, and this file may not reintroduce one.
 *
 *  ⚠ window.IntMapData AND window.IntMapGeodesy ARE READ AT CALL TIME, NOT IMPORTED. This module is
 *  loadable in Node with no DOM: makeGisOps() simply does not publish when there is no `window`,
 *  and run() answers `registry-missing` / `geodesy-missing` instead of throwing.
 *
 *  Returns, always:
 *      { ok:true,  dataset }            — already registered in IntMapData, with its provenance
 *      { ok:false, why, detail? }
 * ==========================================================================*/

export function makeGisOps() {
  return (function () {

    /* ── the two things this module borrows from the app, resolved per call ────────────────────
       Held as functions rather than captured at construction time: js/gis-ops.js may be built
       before js/gis-datasets.js publishes, and a captured `undefined` would be permanent. */
    function registry() { try { return (typeof window !== 'undefined' && window.IntMapData) || null; } catch (_) { return null; } }
    function geodesy() { try { return (typeof window !== 'undefined' && window.IntMapGeodesy) || null; } catch (_) { return null; } }
    /* js/gis-geometry.js — the boolean engine, the Minkowski buffer, the predicates and the
       distance. Read at CALL time for the same reason the two above are: this module may be built
       before it publishes, and a captured `undefined` would be permanent. */
    function geometry() { try { return (typeof window !== 'undefined' && window.IntMapGisGeometry) || null; } catch (_) { return null; } }
    function earthKm() { const g = geodesy(); const R = g && g._R_EARTH_KM; return (typeof R === 'number' && isFinite(R) && R > 0) ? R : null; }

    const D2R = Math.PI / 180;

    /* Two vertices are the same vertex below this. 1e-12° ≈ 0.1 µm at the equator — far below any
       coordinate the importers can produce (a float64 degree resolves ~1e-13° near ±180) and far
       below the 2 km tolerance of the coarsest geometry the app ships. Expires if coordinates ever
       stop being float64 degrees. */
    const SAME_EPS = 1e-12;
    /* Parallel-edge guard for the line/ring crossing test: |cross| in deg² per unit parameter.
       1e-15 deg² is below any turn a float64 coordinate can express at this scale, so two edges
       under it are parallel rather than nearly so. */
    const PARALLEL_EPS = 1e-15;

    /* Below 8 steps the inscribed polygon discards 10.0% of the disk's area ((n/2π)·sin(2π/n) at
       n=8 is 0.900; at n=4 it is 0.637), which is no longer a 5 km buffer. The ceiling bounds the
       size of the output: 4096 vertices per point. */
    const STEPS_MIN = 8, STEPS_MAX = 4096;

    /* ── small geometry utilities ─────────────────────────────────────────────────────────────── */

    function isPos(p) { return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number' && isFinite(p[0]) && isFinite(p[1]); }
    function same(a, b) { return Math.abs(a[0] - b[0]) <= SAME_EPS && Math.abs(a[1] - b[1]) <= SAME_EPS; }

    /* A ring as an OPEN list of finite positions: GeoJSON repeats the first vertex at the end and
       every algorithm below closes the ring itself with (i+1)%n. Keeping the duplicate would add a
       zero-length edge, which is exactly the edge whose cross product is 0 and whose intersection
       parameter is 0/0. */
    function ringPositions(ring) {
      if (!Array.isArray(ring)) return [];
      const out = [];
      for (const p of ring) { if (!isPos(p)) continue; if (out.length && same(out[out.length - 1], p)) continue; out.push([p[0], p[1]]); }
      while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
      return out;
    }

    /* ── area: spherical excess, not planar degrees ───────────────────────────────────────────── */

    /* Chamberlain & Duquette: A = R²/2 · |Σ Δλ·(2 + sin φ₁ + sin φ₂)|.
       ⚠ Δλ IS THE EDGE AS WRITTEN, NOT THE SHORT WAY ROUND, and that is the whole correctness of
       this function for the geometry this file produces. IntMapGeodesy.diskFillPolys returns a polar
       disk as a ring that runs the full width of the window and closes along the 89.9999° line —
       read edge by edge that ring is closed and Σ Δλ is exactly 0, which is the plate-carrée region
       the renderer draws. Normalising each edge to the short way deletes the −360° closing edge, the
       ring then reads as winding once around the pole, and the formula answers with the COMPLEMENT:
       measured, a 500 km buffer at 89°N came out as 509,280,824 km² instead of 785,200.
       For any ring whose longitude span is ≤ 180° the two readings are identical (no edge can exceed
       180°), so nothing else changes. A ring that states a seam crossing by jumping 170 → −170 is
       not in this window at all; a ring whose longitude span exceeds 180° is not in this
       window, and its area is not defined here. js/gis-geometry.js unwraps such a ring before it
       does anything with it, and hands back pieces that each sit in one window. */
    function ringAreaKm2(ring) {
      const R = earthKm();
      if (R == null) return null;
      const pts = ringPositions(ring);
      if (pts.length < 3) return 0;
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dl = (b[0] - a[0]) * D2R;
        total += dl * (2 + Math.sin(a[1] * D2R) + Math.sin(b[1] * D2R));
      }
      return Math.abs(total * R * R / 2);
    }

    /* Rings of one polygon: [0] is the outer, the rest are holes — GeoJSON's own rule, and the one
       every producer in this app follows. Holes are SUBTRACTED, so a doughnut reports the doughnut. */
    function polygonAreaKm2(rings) {
      if (!Array.isArray(rings) || !rings.length) return 0;
      const outer = ringAreaKm2(rings[0]);
      if (outer == null) return null;
      let a = outer;
      for (let i = 1; i < rings.length; i++) { const h = ringAreaKm2(rings[i]); if (h == null) return null; a -= h; }
      return a > 0 ? a : 0;
    }

    /* Public. null when IntMapGeodesy has not published — the radius is ITS value, and inventing
       6371 here would be a second copy of a number the app already decides in one place. */
    function areaKm2(geometry) {
      if (!geometry || typeof geometry !== 'object') return 0;
      if (geometry.type === 'Polygon') return polygonAreaKm2(geometry.coordinates);
      if (geometry.type === 'MultiPolygon') {
        let a = 0;
        for (const poly of (geometry.coordinates || [])) { const x = polygonAreaKm2(poly); if (x == null) return null; a += x; }
        return a;
      }
      return 0;
    }

    /* ── point in polygon ──────────────────────────────────────────────────────────────────────
       ⚠ THE RAY CAST USED TO LIVE HERE TOO (#R729), and js/gis-geometry.js now needs the same
       verdict for its own predicates. Two copies of one rule is the drift this project keeps
       paying for, so there is one: the kernel owns it and this file asks. The export below stays,
       because the panel and the checks reach for it by this name.
       ⚠ It answers FALSE when the kernel is not loaded, and every op that needs it declares
       `needsGeometry`, so run() has already refused with `geometry-unavailable` by then. */
    function pointInPolygon(lngLat, geom) {
      const GG = geometry();
      if (!GG || typeof GG.pointInGeometry !== 'function') return false;
      return GG.pointInGeometry(lngLat, geom);
    }
    /* ── convexity, measured ──────────────────────────────────────────────────────────────────── */

    /* ── geometry decomposition ───────────────────────────────────────────────────────────────── */

    function polygonsOf(g) {
      if (!g) return [];
      if (g.type === 'Polygon') return Array.isArray(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiPolygon') return Array.isArray(g.coordinates) ? g.coordinates : [];
      return [];
    }
    function linesOf(g) {
      if (!g) return [];
      if (g.type === 'LineString') return Array.isArray(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiLineString') return Array.isArray(g.coordinates) ? g.coordinates : [];
      return [];
    }
    function pointsOf(g) {
      if (!g) return [];
      if (g.type === 'Point') return isPos(g.coordinates) ? [g.coordinates] : [];
      if (g.type === 'MultiPoint') return (Array.isArray(g.coordinates) ? g.coordinates : []).filter(isPos);
      return [];
    }

    /* ── bounding boxes: the cheap question asked before the expensive one ─────────────────────
       Every pairwise op below is a loop over A × B, and a sweep-line or a distance over two shapes
       that cannot possibly meet costs the same as one over two that do. A box is one walk of the
       coordinates and the rejection is four comparisons. ⚠ IT IS A FILTER, NOT AN ANSWER: boxes
       overlapping proves nothing, so a pair that passes still goes to the real predicate. What it
       removes is only pairs where a box says «no», and a box saying no is exact.
       ⚠ This is not a spatial index. It turns the constant down, not the O(n·m). */
    function bboxOf(g) {
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      (function walk(c) {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number' && typeof c[1] === 'number') {
          if (!isFinite(c[0]) || !isFinite(c[1])) return;
          if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0];
          if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
          return;
        }
        for (const x of c) walk(x);
      })(g && g.coordinates);
      if (g && g.type === 'GeometryCollection') {
        for (const sub of (g.geometries || [])) {
          const b = bboxOf(sub);
          if (!b) continue;
          if (b[0] < w) w = b[0]; if (b[2] > e) e = b[2];
          if (b[1] < s) s = b[1]; if (b[3] > n) n = b[3];
        }
      }
      return isFinite(w) && isFinite(s) ? [w, s, e, n] : null;
    }

    /* Grown by `padDeg` so a distance query can reject on boxes too: two shapes more than d apart
       have boxes more than d apart. ⚠ The pad is in DEGREES and a degree of longitude is shorter
       than a degree of latitude away from the equator, so the pad uses the LATITUDE degree for
       both — which over-estimates the longitude reach and therefore never rejects a pair that
       should have been kept. Erring outward is the only direction a prefilter may err. */
    function boxesMeet(a, b, padDeg) {
      if (!a || !b) return true;
      const q = padDeg > 0 ? padDeg : 0;
      return !(a[2] + q < b[0] || b[2] + q < a[0] || a[3] + q < b[1] || b[3] + q < a[1]);
    }

    function polyGeometry(polys) {
      if (!polys.length) return null;
      return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
    }
    function lineGeometry(lines) {
      if (!lines.length) return null;
      return lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines };
    }

    function props(f) { return (f && f.properties && typeof f.properties === 'object') ? f.properties : {}; }
    function withProps(base, extra) { return Object.assign({}, base, extra || {}); }

    /* ── filter: the comparisons ──────────────────────────────────────────────────────────────── */

    const CONDITION_OPS = ['>=', '>', '<=', '<', '==', '!=', 'contains', 'in', 'between'];

    /* Numbers when BOTH sides are numbers, text otherwise — measured per cell, by the registry's own
       asNumber, so 「12 km」 stays text here exactly as it stays text in the column typing. Two
       parsers would drift and the drift would show up as a row the panel says matches and the filter
       drops. */
    function cmpPair(R, raw, want) {
      const a = R.asNumber(raw), b = R.asNumber(want);
      if (a != null && b != null) return { num: true, a: a, b: b };
      return { num: false, a: String(raw), b: String(want) };
    }

    /* An empty cell (null / undefined / all spaces) satisfies NOTHING except `!=`: it is not that
       value, but it is not greater than it either, and treating '' as 0 or as '' < 'x' would quietly
       pull every blank row into 「500未満」. */
    function evalCondition(R, value, op, want) {
      const empty = R.isEmpty(value);
      switch (op) {
        case '>=': case '>': case '<=': case '<': {
          if (empty) return false;
          const c = cmpPair(R, value, want);
          if (op === '>=') return c.a >= c.b;
          if (op === '>') return c.a > c.b;
          if (op === '<=') return c.a <= c.b;
          return c.a < c.b;
        }
        case '==': { if (empty) return R.isEmpty(want); const c = cmpPair(R, value, want); return c.a === c.b; }
        case '!=': { if (empty) return !R.isEmpty(want); const c = cmpPair(R, value, want); return c.a !== c.b; }
        /* text containment, case-insensitive: a reader typing a filter is choosing a word, not a
           capitalisation, and 「Tokyo」 must find 「tokyo」. */
        case 'contains': { if (empty) return false; return String(value).toLowerCase().indexOf(String(want == null ? '' : want).toLowerCase()) >= 0; }
        case 'in': {
          if (empty) return false;
          const list = Array.isArray(want) ? want : [want];
          for (const w of list) { const c = cmpPair(R, value, w); if (c.a === c.b) return true; }
          return false;
        }
        case 'between': {
          if (empty) return false;
          const pair = Array.isArray(want) ? want : [];
          if (pair.length !== 2) return false;
          const lo = cmpPair(R, value, pair[0]), hi = cmpPair(R, value, pair[1]);
          return lo.a >= lo.b && hi.a <= hi.b;                   /* both ends included */
        }
        default: return false;
      }
    }

    /* The spatial relations `relate` offers. Declared next to the op that uses them so ops() hands
       the panel the list rather than the panel carrying one. */
    const RELATE_PREDICATES = ['intersects', 'within', 'contains', 'disjoint', 'nearer-than'];

    /* ── the declarations a panel reads ───────────────────────────────────────────────────────── */

    /* `accepts` is per input; `params[].input` says WHICH input a field name is chosen from, so the
       panel never has to know that aggregate's field belongs to the points and not to the polygons.
       `requiredWhen` states the one conditional requirement as data rather than as UI code.
       Two more keys are stated rather than hidden, because a caller has a use for both: `mismatchWhy`
       is the code a geometry mismatch on THIS op answers with (buffer says what it needs by name),
       and `needsGeodesy` says the op cannot run without window.IntMapGeodesy — which is how a panel
       can grey the op out before the reader fills a form that is going to be refused. */
    const DECL = {
      filter: {
        id: 'filter', inputs: 1, accepts: ['any'], output: 'same-as-input',
        params: [{ name: 'where', type: 'conditions', required: true, input: 0, ops: CONDITION_OPS }],
      },
      buffer: {
        /* ⚠ `accepts:['Point']` UNTIL #R732. The refusal was honest — there was no offset curve —
           but it is not honest any more: js/gis-geometry.js builds the Minkowski sum of ANY
           geometry with a geodesic disk, which is what a buffer is. `buffer-needs-points` is
           therefore gone, and so is the mismatchWhy that named it. */
        id: 'buffer', inputs: 1, accepts: ['any'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [
          /* Negative means INWARD, and only an areal shape has an inside to eat into; a negative
             radius on points or lines is refused by name rather than silently made positive. */
          { name: 'radiusKm', type: 'number', required: true, unit: 'km' },
          { name: 'steps', type: 'number', required: false, default: 64 },
        ],
      },
      clip: {
        /* ⚠ THE CLIPPER NO LONGER HAS TO BE CONVEX (#R732). A ward with a hole, a concave
           prefecture and a window whose true answer is several disjoint pieces are all ordinary
           now. `clip-window-not-convex` is raised by nothing. */
        id: 'clip', inputs: 2, accepts: ['any', 'Polygon'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      intersect: {
        id: 'intersect', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      difference: {
        id: 'difference', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      union: {
        id: 'union', inputs: 2, accepts: ['Polygon', 'Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true, params: [],
      },
      dissolve: {
        /* One shape per group, boundaries between members removed. `by` absent means ONE group —
           the whole dataset — which is the 「全部まとめる」 a reader means by dissolve with no
           column named. */
        id: 'dissolve', inputs: 1, accepts: ['Polygon'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [{ name: 'by', type: 'field', required: false, input: 0 }],
      },
      relate: {
        /* The spatial WHERE: keep the features of input 0 that stand in `predicate` to ANY feature
           of input 1. ⚠ `nearer-than` measures from the SHAPES, not from their centres — which is
           the whole of 「道路そのものからの距離」 and the thing a bounding-box centre cannot answer. */
        id: 'relate', inputs: 2, accepts: ['any', 'any'], output: 'same-as-input',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'predicate', type: 'enum', required: true, default: 'intersects', values: RELATE_PREDICATES },
          { name: 'maxKm', type: 'number', required: false, unit: 'km', requiredWhen: { predicate: ['nearer-than'] } },
        ],
      },
      aggregate: {
        /* ⚠ `accepts[1]` WAS 'Point' (#R729) and the arithmetic was 「面に含まれる点」. With a real
           predicate available it is 「その面に重なるもの」, which is the same answer for points and
           the right one for the roads and parcels a reader actually has. */
        id: 'aggregate', inputs: 2, accepts: ['Polygon', 'any'], output: 'Polygon',
        needsGeodesy: true, needsGeometry: true,
        params: [
          { name: 'stat', type: 'enum', required: true, default: 'count', values: ['count', 'sum', 'mean', 'min', 'max'] },
          { name: 'field', type: 'field', required: false, input: 1, requiredWhen: { stat: ['sum', 'mean', 'min', 'max'] } },
          { name: 'outName', type: 'text', required: false },
        ],
      },
    };
    /* ⚠ THERE IS NO SECOND LIST (#R732). This was `const ORDER = ['filter','buffer','clip',
       'aggregate']`, and ops() mapped over it — so an op added to DECL and forgotten here existed,
       answered run(), and WAS NOT IN THE PANEL: the hand-written list
       .agents/rules/no-ad-hoc-hardcoding.md forbids, sitting one line under the comment that
       explains why the panel may not keep one. The authored key order of DECL is the display
       order, and it cannot fall out of step with itself. */
    const ORDER = Object.keys(DECL);

    function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (_) { return null; } }

    /* ── the runners ──────────────────────────────────────────────────────────────────────────── */

    function fail(why, detail) { return detail ? { ok: false, why: why, detail: detail } : { ok: false, why: why }; }

    function hasField(ds, name) {
      for (const f of (ds.fields || [])) if (f && f.name === name) return true;
      return false;
    }

    function runFilter(ds, params, R) {
      const where = params.where;
      if (!Array.isArray(where) || !where.length) return fail('missing-param', { param: 'where' });
      for (const c of where) {
        if (!c || typeof c !== 'object') return fail('bad-param', { param: 'where' });
        if (CONDITION_OPS.indexOf(c.op) < 0) return fail('unknown-condition-op', { op: c.op == null ? null : String(c.op) });
        /* ⚠ A condition on a column that is not there is REFUSED, not treated as true and not
           treated as false. Both of those would ship a row count the reader cannot question. */
        if (!hasField(ds, c.field)) return fail('unknown-field', { field: c.field == null ? null : String(c.field) });
      }
      const out = [];
      for (const f of ds.features()) {
        const p = props(f);
        let keep = true;
        for (const c of where) { if (!evalCondition(R, p[c.field], c.op, c.value)) { keep = false; break; } }
        if (keep) out.push(f);
      }
      /* 0 rows is an ANSWER: 「該当なし」 is what the data says, and failing here would make the
         reader unable to chain the empty result or see the count. */
      return { ok: true, features: out };
    }

    function runBuffer(ds, params, R) {
      const GG = geometry();
      const radius = R.asNumber(params.radiusKm);
      if (radius == null) return fail('missing-param', { param: 'radiusKm' });
      if (radius === 0) return fail('bad-param', { param: 'radiusKm', value: params.radiusKm });
      let steps = (params.steps == null) ? 64 : R.asNumber(params.steps);
      if (steps == null) return fail('bad-param', { param: 'steps', value: params.steps });
      steps = Math.round(steps);
      if (steps < STEPS_MIN || steps > STEPS_MAX) return fail('bad-param', { param: 'steps', value: steps, min: STEPS_MIN, max: STEPS_MAX });
      /* An inward buffer of something with no interior is not a small buffer, it is not a buffer.
         Refused by name, where the reader can still change the sign. */
      if (radius < 0 && ds.geometryType !== 'Polygon') return fail('inward-buffer-needs-area', { geometryType: ds.geometryType });

      const out = [];
      for (const f of ds.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        /* ⚠ ONE OUTPUT FEATURE PER INPUT FEATURE, not per position. #R729 emitted one per point of
           a MultiPoint because it could not union overlapping disks, and folding them would have
           double-counted the overlap in the area. It can union them now, so the MultiPoint's buffer
           is the one shape it should always have been — and `_bufferPart` is gone with the reason
           it existed. */
        const bg = GG.bufferKm(g, radius, steps);
        if (!bg) continue;
        out.push({
          type: 'Feature',
          properties: withProps(props(f), { _bufferKm: radius, _bufferSteps: steps, _areaKm2: areaKm2(bg) }),
          geometry: bg,
        });
      }
      return { ok: true, features: out };
    }

    /* Every areal feature of a dataset as a window: what clip cuts with, and what the overlays and
       relate test against. ⚠ The id is the feature's own when it has one and its ORDINAL when it
       does not — the output says which window produced it, and an output that could not say would
       make the reader's first question about it unanswerable. */
    function windowsOf(ds) {
      const out = [];
      const feats = ds.features();
      for (let i = 0; i < feats.length; i++) {
        const f = feats[i];
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        out.push({ id: (f && f.id != null) ? f.id : i, geometry: g, bbox: bboxOf(g), props: props(f) });
      }
      return out;
    }

    function runClip(subject, clipper) {
      const GG = geometry();
      const windows = windowsOf(clipper);
      if (!windows.length) return fail('no-clip-polygons');

      /* ⚠ #R729 MEASURED EVERY WINDOW FIRST AND REFUSED THE CONCAVE ONES. Nothing about the
         window's shape is measured here any more, because nothing about it is a reason to refuse:
         js/gis-geometry.js takes holes, concavity, multipolygons and the seam. What it still cannot
         take is a ring that wraps the world, and it says so by answering null — which drops that one
         pair rather than refusing the whole run, because one unusable window among three thousand
         prefectures is not a reason to give the reader nothing. */
      const out = [];
      for (const f of subject.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        const base = props(f);
        const gb = bboxOf(g);
        for (const w of windows) {
          if (!boxesMeet(gb, w.bbox, 0)) continue;

          if (polygonsOf(g).length) {
            const cut = GG.intersection(g, w.geometry);
            if (!cut) continue;
            out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id, _areaKm2: areaKm2(cut) }), geometry: cut });
            continue;
          }
          const lines = linesOf(g);
          if (lines.length) {
            const kept = [];
            for (const line of lines) for (const run of clipLineByPolygon(line.filter(isPos), w.geometry, GG)) kept.push(run);
            const gg = lineGeometry(kept);
            if (gg) out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
            continue;
          }
          const pts = pointsOf(g);
          if (pts.length) {
            const kept = pts.filter((pt) => GG.pointInGeometry(pt, w.geometry));
            if (!kept.length) continue;
            const gg = (kept.length === 1 && g.type === 'Point')
              ? { type: 'Point', coordinates: kept[0] }
              : { type: 'MultiPoint', coordinates: kept };
            out.push({ type: 'Feature', properties: withProps(base, { _clipId: w.id }), geometry: gg });
          }
        }
      }
      return { ok: true, features: out };
    }

    /* ── clipping a LINE by an arbitrary polygon ───────────────────────────────────────────────
       The sweep-line takes areas, not lines, so this is the one piece the borrowed engine does not
       do. It is not Sutherland–Hodgman's convex walk either: each segment is cut at every crossing
       of every ring of the window, and each resulting piece is kept or dropped by asking whether its
       MIDPOINT is inside. That is the one test that stays right for a concave window and for holes,
       because a piece between two consecutive crossings is entirely in or entirely out. */
    function clipLineByPolygon(coords, win, GG) {
      const rings = GG.ringsOf(win);
      const runs = [];
      let cur = [];
      const flush = () => { if (cur.length >= 2) runs.push(cur); cur = []; };
      for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1], b = coords[i];
        const ts = [0, 1];
        for (const ring of rings) {
          for (let j = 1; j < ring.length; j++) {
            const t = segmentHit(a, b, ring[j - 1], ring[j]);
            if (t != null && t > 0 && t < 1) ts.push(t);
          }
        }
        ts.sort((x, y) => x - y);
        const at = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        for (let k = 1; k < ts.length; k++) {
          const t0 = ts[k - 1], t1 = ts[k];
          if (!(t1 > t0)) continue;
          if (GG.pointInGeometry(at((t0 + t1) / 2), win)) {
            if (!cur.length) cur.push(at(t0));
            cur.push(at(t1));
          } else flush();
        }
      }
      flush();
      return runs;
    }

    /* The parameter along a→b where it crosses c→d, or null when they do not cross. */
    function segmentHit(a, b, c, d) {
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < PARALLEL_EPS) return null;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
      const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) return null;
      return t;
    }

    /* ── the overlays: one runner, because they differ only in which verb is asked ─────────────── */

    function runOverlay(kind, aDs, bDs) {
      const GG = geometry();
      const bWins = windowsOf(bDs);
      if (!bWins.length) return fail('no-overlay-polygons', { input: 1 });
      const out = [];
      for (const f of aDs.features()) {
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const base = props(f);
        const gb = bboxOf(g);

        if (kind === 'difference') {
          /* Taken against ALL of B at once. Subtracting one window at a time gives the same answer
             only if the windows do not overlap each other, and nothing in the registry says they do
             not — a second subtraction from an already-cut shape is not the same shape. */
          const near = bWins.filter((w) => boxesMeet(gb, w.bbox, 0)).map((w) => w.geometry);
          let cut = g;
          if (near.length) {
            const merged = GG.union(near);
            cut = merged ? GG.difference(g, merged) : null;
          }
          if (!cut) continue;
          out.push({ type: 'Feature', properties: withProps(base, { _areaKm2: areaKm2(cut) }), geometry: cut });
          continue;
        }

        for (const w of bWins) {
          if (!boxesMeet(gb, w.bbox, 0)) continue;
          const res = (kind === 'intersect') ? GG.intersection(g, w.geometry) : GG.union([g, w.geometry]);
          if (!res) continue;
          /* ⚠ BOTH SIDES' COLUMNS SURVIVE, with A winning a collision, and the row says it came from
             a pair (`_overlayId`). Keeping only A would throw away the table the reader brought to
             the overlay; letting B win would rewrite the one they started from. */
          out.push({
            type: 'Feature',
            properties: withProps(withProps(w.props, base), { _overlayId: w.id, _areaKm2: areaKm2(res) }),
            geometry: res,
          });
        }
      }
      return { ok: true, features: out };
    }

    function runDissolve(ds, params, R) {
      const GG = geometry();
      const by = (params.by == null || String(params.by).trim() === '') ? null : String(params.by);
      if (by && !hasField(ds, by)) return fail('unknown-field', { field: by });
      /* Map keeps insertion order, so the groups come out in the order they first appear in the
         reader's own table rather than in some order this file invented. */
      const groups = new Map();
      for (const f of ds.features()) {
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const key = by ? String(props(f)[by]) : '';
        if (!groups.has(key)) groups.set(key, { geoms: [], n: 0, first: props(f) });
        const grp = groups.get(key);
        grp.geoms.push(g);
        grp.n++;
      }
      if (!groups.size) return fail('no-features', { input: 0 });
      const out = [];
      for (const grp of groups.values()) {
        const merged = GG.union(grp.geoms);
        if (!merged) continue;
        /* ⚠ ONLY THE GROUPING COLUMN SURVIVES, plus how many members went in. The other columns of
           the members disagree with one another by construction — that is what a group is — and
           carrying the first member's values would attach one municipality's population to the
           merged prefecture and print it as the prefecture's. */
        const extra = { _dissolvedFrom: grp.n, _areaKm2: areaKm2(merged) };
        if (by) extra[by] = grp.first[by];
        out.push({ type: 'Feature', properties: extra, geometry: merged });
      }
      return { ok: true, features: out };
    }

    /* ── relate: the spatial WHERE ────────────────────────────────────────────────────────────── */

    /* 0 or the measured distance when the relation holds, null when it does not — so the caller
       gets the verdict and the number from one call. */
    function relateOne(GG, g, w, predicate, maxKm) {
      if (predicate === 'intersects') return GG.intersects(g, w) ? 0 : null;
      if (predicate === 'within') return GG.within(g, w) ? 0 : null;
      if (predicate === 'contains') return GG.contains(g, w) ? 0 : null;
      if (predicate === 'nearer-than') {
        const d = GG.distanceKm(g, w);
        return (d != null && d <= maxKm) ? d : null;
      }
      return null;
    }

    function runRelate(aDs, bDs, params, R) {
      const GG = geometry();
      const predicate = (params.predicate == null) ? 'intersects' : String(params.predicate);
      if (RELATE_PREDICATES.indexOf(predicate) < 0) return fail('bad-param', { param: 'predicate', value: predicate, values: RELATE_PREDICATES });
      let maxKm = null;
      if (predicate === 'nearer-than') {
        maxKm = R.asNumber(params.maxKm);
        if (maxKm == null) return fail('missing-param', { param: 'maxKm' });
        if (!(maxKm >= 0)) return fail('bad-param', { param: 'maxKm', value: params.maxKm });
      }
      const others = [];
      for (const f of bDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        others.push({ geometry: g, bbox: bboxOf(g) });
      }
      if (!others.length) return fail('no-features', { input: 1 });

      /* The pad turns km into degrees of LATITUDE and uses that for both axes (see boxesMeet): a
         degree of longitude is shorter everywhere but the equator, so the box reaches further east
         and west than it needs to and the filter can only ever keep too much. */
      const Rkm = earthKm();
      const pad = (predicate === 'nearer-than' && Rkm) ? (maxKm / (Math.PI * Rkm / 180)) : 0;

      const out = [];
      for (const f of aDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        const gb = bboxOf(g);
        let best = null, hit = false;

        if (predicate === 'disjoint') {
          /* ⚠ disjoint CANNOT USE THE PREFILTER AS A REJECTION. The pairs whose boxes miss are
             exactly the pairs it is true for, so skipping them would skip the answer. It is the one
             predicate that has to look at every other feature, and a box that misses is still a
             proof that those two do not touch — so the box is used the other way round, as an
             acceptance. */
          hit = true;
          for (const o of others) {
            if (!boxesMeet(gb, o.bbox, 0)) continue;
            if (GG.intersects(g, o.geometry)) { hit = false; break; }
          }
        } else {
          for (const o of others) {
            if (!boxesMeet(gb, o.bbox, pad)) continue;
            const d = relateOne(GG, g, o.geometry, predicate, maxKm);
            if (d == null) continue;
            hit = true;
            if (best == null || d < best) best = d;
            /* Only the nearest matters for a distance; for a yes/no the first yes is the answer. */
            if (predicate !== 'nearer-than') break;
          }
        }

        if (!hit) continue;
        /* The measurement is kept, not just the verdict: 500 m 以内 and 「そのうち何 m か」 are the
           same query, and throwing the number away would make the second one a second pass over
           the same two datasets. */
        if (predicate === 'nearer-than' && best != null) {
          out.push({ type: 'Feature', properties: withProps(props(f), { _distanceKm: best }), geometry: g });
        } else out.push(f);
      }
      return { ok: true, features: out };
    }

    function runAggregate(polyDs, memberDs, params, R) {
      const GG = geometry();
      const stat = (params.stat == null) ? 'count' : String(params.stat);
      const allowed = DECL.aggregate.params[0].values;
      if (allowed.indexOf(stat) < 0) return fail('bad-param', { param: 'stat', value: stat, values: allowed });
      const field = (params.field == null) ? null : String(params.field);
      if (stat !== 'count') {
        if (!field) return fail('missing-param', { param: 'field' });
        if (!hasField(memberDs, field)) return fail('unknown-field', { field: field });
      }
      const outName = (params.outName != null && String(params.outName).trim() !== '')
        ? String(params.outName).trim()
        : (stat === 'count' ? 'count' : stat + '_' + field);
      /* Writing over a column the polygons already carry would destroy data the reader imported,
         and doing it silently would make the loss invisible until the next op read the wrong column. */
      if (hasField(polyDs, outName)) return fail('output-column-in-use', { name: outName });

      /* ⚠ ONE ROW PER MEMBER FEATURE, not per position (#R729 flattened a MultiPoint into its
         points, which counted a single record as several). A feature is one thing the reader
         counted, whatever shape it has. Read once with its box so a 50,000-row dataset is not
         walked through its geometry accessors again for every polygon. */
      const members = [];
      for (const f of memberDs.features()) {
        const g = f && f.geometry;
        if (!g) continue;
        members.push({ geometry: g, bbox: bboxOf(g), raw: (field ? props(f)[field] : null) });
      }

      const out = [];
      for (const f of polyDs.features()) {
        const g = f && f.geometry;
        if (!g || !polygonsOf(g).length) continue;
        const gb = bboxOf(g);
        let n = 0, skipped = 0, sum = 0, min = null, max = null;
        for (const m of members) {
          if (!boxesMeet(gb, m.bbox, 0)) continue;
          /* ⚠ 「この面に重なるもの」, asked of the one predicate. #R729 asked point-in-polygon, which
             is the same answer for a point and no answer at all for the roads and parcels a reader
             brings to a 区域別集計. A line that crosses the boundary counts for this polygon AND for
             its neighbour, which is what 「重なる」 means and is why `_areaKm2` is on the row: a
             reader dividing by area can see that the parts do not partition. */
          if (!GG.intersects(m.geometry, g)) continue;
          n++;
          if (stat === 'count') continue;
          const v = R.asNumber(m.raw);
          /* ⚠ A member inside the polygon whose value cannot be a number is COUNTED AS SKIPPED, not
             dropped in silence. A mean over 12 of 400 is not the mean the reader asked for, and
             `_statSkipped` is the only thing that can tell them so. */
          if (v == null) { skipped++; continue; }
          sum += v;
          if (min == null || v < min) min = v;
          if (max == null || v > max) max = v;
        }
        const used = n - skipped;
        let value;
        if (stat === 'count') value = n;
        else if (stat === 'sum') value = used ? sum : null;
        else if (stat === 'mean') value = used ? sum / used : null;
        else if (stat === 'min') value = min;
        else value = max;
        const extra = { _areaKm2: areaKm2(g) };
        extra[outName] = value;
        if (stat !== 'count') extra._statSkipped = skipped;
        out.push({ type: 'Feature', properties: withProps(props(f), extra), geometry: g });
      }
      return { ok: true, features: out };
    }

    /* ── run ──────────────────────────────────────────────────────────────────────────────────── */

    /* async, and now for a reason rather than in anticipation of one: every op but filter needs
       js/gis-geometry.js, which loads its sweep-line on demand. The await happens ONCE per process —
       ready() memoises — and a reader who only ever filters never waits for it at all. */
    async function run(step) {
      const R = registry();
      if (!R) return fail('registry-missing');
      const decl = DECL[step && step.op];
      if (!decl) return fail('op-unknown', { op: (step && step.op) == null ? null : String(step.op) });
      if (decl.needsGeodesy && (!geodesy() || earthKm() == null)) return fail('geodesy-missing');
      if (decl.needsGeometry) {
        const GG = geometry();
        if (!GG) return fail('geometry-missing');
        /* ⚠ THE MODULE BEING PRESENT IS NOT THE CLIPPER BEING LOADED. available() is what the ops
           actually depend on, and answering 「0 件でした」 because a dynamic import had not landed
           is the shape this project has recorded more than once: 「見つからなかった」 and
           「訊けなかった」 must not be the same answer. */
        let ok = false;
        try { ok = await GG.ready(); } catch (_) { ok = false; }
        if (!ok || !GG.available()) return fail('geometry-unavailable');
      }

      const inputs = Array.isArray(step.inputs) ? step.inputs.slice() : [];
      if (inputs.length !== decl.inputs) return fail('input-count', { expected: decl.inputs, got: inputs.length });
      const ds = [];
      for (const id of inputs) { const rec = R.get(id); if (!rec) return fail('input-missing', { id: id == null ? null : String(id) }); ds.push(rec); }

      /* ⚠ A STALE INPUT IS REFUSED BY NAME (#R732). js/gis-datasets.js marks a dataset stale when a
         recomputation above it failed: the features are still there, but they are the answer to
         parameters the reader has already changed. Consuming them would put that staleness into a
         NEW record whose own provenance says it is current — the one place it stops being visible.
         This is what makes `stale` a state and not a decoration. */
      for (let i = 0; i < ds.length; i++) {
        if (ds[i].stale) return fail('input-stale', { input: i, id: ds[i].id, why: String(ds[i].stale.why || '') });
      }

      /* The geometry contract is checked against the dataset's MEASURED geometryType (Multi* already
         folded into its singular, 'Mixed' when the features disagree). An op that needs one kind
         refuses a mixed dataset by name instead of quietly working on the part it recognises. */
      for (let i = 0; i < ds.length; i++) {
        const acc = decl.accepts[i];
        if (acc === 'any') continue;
        if (ds[i].geometryType !== acc) {
          return fail(decl.mismatchWhy || 'geometry-type', { input: i, expected: acc, geometryType: ds[i].geometryType });
        }
      }

      const params = (step.params && typeof step.params === 'object') ? step.params : {};
      /* ⚠ A TABLE, NOT AN if-CHAIN ENDING IN else. The chain's last arm was unconditional, so an op
         declared in DECL and not wired here would have run AGGREGATE and registered its output
         under the new op's name. Keyed by the same ids DECL is keyed by, the wiring is checkable —
         and tests/r731-gis-geometry-crs-checks ① measures that every declared op has a runner. */
      const RUN = {
        filter: () => runFilter(ds[0], params, R),
        buffer: () => runBuffer(ds[0], params, R),
        clip: () => runClip(ds[0], ds[1]),
        intersect: () => runOverlay('intersect', ds[0], ds[1]),
        difference: () => runOverlay('difference', ds[0], ds[1]),
        union: () => runOverlay('union', ds[0], ds[1]),
        dissolve: () => runDissolve(ds[0], params, R),
        relate: () => runRelate(ds[0], ds[1], params, R),
        aggregate: () => runAggregate(ds[0], ds[1], params, R),
      };
      const runner = RUN[decl.id];
      if (!runner) return fail('op-not-wired', { op: decl.id });
      const res = runner();
      if (!res || !res.ok) return res || fail('op-unknown', { op: decl.id });

      /* The title is an identifier, not a sentence: op(input, input). Nothing here composes prose,
         because prose here would be prose in one language. */
      const title = (step.title != null && String(step.title).trim() !== '')
        ? String(step.title)
        : decl.id + '(' + ds.map((d) => d.title).join(', ') + ')';
      const recorded = clone(params);
      if (recorded == null) return fail('bad-param', { param: 'params' });

      let rec;
      try {
        rec = R.add({
          id: step.id,
          title: title,
          features: res.features,
          /* THE RECIPE. js/gis-project.js replays exactly this, which is why the params written here
             are the params that ran, cloned — a caller mutating its own object afterwards must not
             be able to rewrite history. */
          provenance: { kind: 'op', op: decl.id, inputs: inputs, params: recorded },
        });
      } catch (e) {
        return fail('id-in-use', { id: step.id == null ? null : String(step.id) });
      }
      return { ok: true, dataset: rec };
    }

    const API = {
      ops: () => ORDER.map((id) => clone(DECL[id])),
      op: (id) => (DECL[id] ? clone(DECL[id]) : null),
      run: run,
      /* exposed because the panel labels a clipped shape with its area and the checks measure the
         same number the ops wrote — one implementation, asked by both */
      areaKm2: areaKm2,
      pointInPolygon: pointInPolygon,
      /* The spatial relations relate offers, so a caller can present them without repeating them. */
      predicates: () => RELATE_PREDICATES.slice(),
    };
    try { window.IntMapGisOps = API; } catch (_) { }
    return API;
  })();
}
