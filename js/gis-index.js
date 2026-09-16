/* ============================================================================
 *  IntMap · THE SPATIAL INDEX — window.IntMapGisIndex   (#R735)
 * ----------------------------------------------------------------------------
 *  js/gis-ops.js wrote the note that made this file necessary, above its own bounding-box helper:
 *
 *      「⚠ This is not a spatial index. It turns the constant down, not the O(n·m).」
 *
 *  Every pairwise op there — aggregate, relate, clip, intersect, difference — is a loop over A × B in
 *  which each pair is first asked `boxesMeet`. That question is four comparisons and it is EXACT in
 *  one direction (a box saying «no» is proof), so it removes almost every pair; what it does not do
 *  is stop the loop from being written. 40,000 members against 1,900 wards is 76,000,000 box tests
 *  before one piece of geometry is looked at, and the ops are now reachable from Atlas, i.e. from a
 *  reader who did not choose the size of either input. This file answers the same question for a
 *  whole dataset at once: 「この矩形に重なりうるのはどれか」, in time proportional to the answer.
 *
 *  ══ WHAT IT PROMISES, AND IT IS ONLY ONE THING ════════════════════════════════════════════════
 *  ⚠⚠⚠ NO FALSE NEGATIVE. EVER. query() returns a SUPERSET of the pairs `boxesMeet` would keep, and
 *  the caller still asks boxesMeet and then the real predicate. That asymmetry is the whole design:
 *  a candidate too many costs four comparisons, a candidate too few makes 区域別集計 answer a
 *  SMALLER NUMBER THAN THE TRUTH and say nothing about it. Wherever this file cannot decide cheaply
 *  and safely — a box that is missing, malformed, wraps the world, or is so large it would be
 *  written into hundreds of cells — the item goes into the `always` bucket and is handed to EVERY
 *  query. That is a judgement, not a shortcut, and stats().oversize is how many items took it, so a
 *  caller or a check can see an index that is 「効いていない」 instead of assuming it is.
 *
 *  ══ WHY A UNIFORM GRID, AND WHERE ITS CELL SIZE COMES FROM ════════════════════════════════════
 *  A uniform grid, not an R-tree: the inputs here are built once and queried n times, the boxes are
 *  degrees on a plate-carrée plane, and the grid needs no balancing decisions — which matters,
 *  because every tuning knob an index carries is a constant somebody has to justify.
 *  ⚠ THE CELL SIZE IS DERIVED FROM THE DATA, not chosen. It is
 *
 *      cell = clamp( max( median(item width, item height),  coreSpan / √n ),  ≤ coreSpan )
 *
 *  and both terms are there for a measurable reason:
 *    · below the MEDIAN ITEM SIZE, one item is written into many cells, so the index costs more
 *      memory and more insertions than the scan it replaces;
 *    · below coreSpan/√n, the grid has more cells than items, i.e. it is mostly empty — and taking
 *      the max of the two is also what BOUNDS THE CELL COUNT: with cell ≥ coreSpan/√n the grid over
 *      that span holds at most (coreSpan/cell)² = n cells, so build() is O(n) in memory without any
 *      cap having to be written down.
 *  ⚠ BOTH TERMS ARE ROBUST ON PURPOSE — the median rather than the mean size, and coreSpan (the
 *  5th–95th percentile of item CENTRES, widest axis) rather than the full min/max extent. Measured
 *  with 1,000 points inside 10°×10° plus two continent-sized boxes: the full extent gives cell=6.3°,
 *  which puts 361 of the 1,000 points in ONE cell; the percentile span gives ~0.3° and the same
 *  worst cell holds a handful. One outlier must not set the grid for everything it contains, in
 *  either term. Items outside coreSpan are not excluded — they simply land in cells with negative or
 *  large indices, which a Map holds at no cost, or in `always` if they cover too many.
 *  Expiry: this holds while the inputs are ~uniformly sized. A dataset whose box sizes span many
 *  orders of magnitude will push items into `always` instead (see OVERSIZE_CELLS), which is visible
 *  in stats() — that is the signal to reach for a hierarchy here, and until stats() shows it, the
 *  hierarchy would be a guess.
 *
 *  ══ THE SEAM (±180) — WHY IT IS RANGES AND NOT A SPECIAL CASE ═════════════════════════════════
 *  IntMap ships shapes that cross the antimeridian, and they arrive in two forms: as `w > e` (the
 *  box that runs east off the edge and continues from −180) and as w=−180,e=180 (the box that wraps
 *  the world). So longitude is never treated as one interval: § lonRanges turns (w,e) into ONE or
 *  TWO ranges inside [-180,180], or into `null` meaning 「every longitude」 when the span reaches
 *  360°. The SAME function normalises stored boxes and query boxes, so there is one rule rather
 *  than two that can drift, and it also covers the case a pad creates: `nearer-than` grows the query
 *  box by maxKm in degrees (js/gis-ops.js runRelate), and a query 2° from the seam padded by 5°
 *  crosses it.
 *  ⚠ THIS IS STRICTLY MORE INCLUSIVE THAN boxesMeet, WHICH DOES NOT WRAP. For an inverted box
 *  boxesMeet keeps a pair only when (b.w ≤ a.e AND b.e ≥ a.w); the two ranges keep it when EITHER
 *  holds. Superset, therefore safe — and safe for a future caller that learns to wrap, which a
 *  plain-interval index would have silently broken.
 *  Latitude is one clamped interval: [-90, 90] is not periodic, and a pad pushing past the pole
 *  reaches nothing beyond it.
 *
 *  ══ WHAT IS NOT HERE ══════════════════════════════════════════════════════════════════════════
 *  ⚠ NO SECOND COPY OF boxesMeet. The candidates are a superset, and the exact test stays the one
 *  js/gis-ops.js already owns — two implementations of one rule would drift, and the drift would
 *  appear as a feature the prefilter keeps and the index drops. The only thing this file knows
 *  about that rule is its DIRECTION: unknown extent errs outward.
 *  ⚠ NO DEPENDENCIES. Pure arithmetic on numbers: no geometry kernel, no registry, no DOM. It is
 *  loadable in Node, and it publishes only if a `window` exists.
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would be a global before the bundle.
 * ==========================================================================*/

export function makeGisIndex() {
  return (function () {

    /* An item whose box would occupy more cells than this is put in `always` instead of being
       written into all of them. Derivation: cell ≥ the median item size, so a typical item straddles
       at most 2×2 = 4 cells; 64 is 16× that, i.e. only reached by an item ~4× the median in each
       axis. Such an item overlaps most query boxes anyway, so listing it once and testing it always
       is cheaper than 64 list insertions plus the dedupe work at query time — and the count is
       reported by stats(). Expires if the cell-size rule above ever stops being bounded below by the
       median item size, at which case a typical item no longer occupies ~4 cells and this ceiling
       would start catching ordinary data (which stats().oversize would show). */
    const OVERSIZE_CELLS = 64;

    /* A floor for the cell size, needed only when the data has no extent at all (every item the same
       point). 1e-9° ≈ 0.1 mm at the equator, four orders below the ~1e-13° a float64 degree resolves
       near ±180, so no pair of distinguishable coordinates is merged by it; with zero extent every
       item lands in one cell, which is the correct answer for co-located items. */
    const MIN_CELL_DEG = 1e-9;

    /* Int32 marks are per-query epochs rather than a cleared array. The reset point is below
       2^31 so the comparison never sees a wrapped epoch. */
    const EPOCH_MAX = 2147483000;

    function num(x) { return typeof x === 'number' && isFinite(x); }
    function defBox(it) { return (it && it.bbox) || null; }

    function wrap180(x) { return ((x + 180) % 360 + 360) % 360 - 180; }

    /* (w, e) → [[a,b], …] inside [-180,180], or null meaning 「every longitude」.
       A negative width is the seam-crossing form (w > e), not an empty box: reading it as empty
       would be the one direction this file may not err in. A span of 360° or more has no bounded
       range and is answered with null, which sends the item to `always`. */
    function lonRanges(w, e) {
      if (!num(w) || !num(e)) return null;
      let span = e - w;
      if (span < 0) span += 360;
      if (!(span < 360)) return null;
      const a = wrap180(w);
      const b = a + span;
      if (b <= 180) return [[a, b]];
      return [[a, 180], [-180, b - 360]];
    }

    /* (s, n) → [lo, hi] clamped to the poles, or null when the box says nothing usable. A box with
       n < s is malformed rather than empty — same direction as above, so it becomes `always`. */
    function latRange(s, n) {
      if (!num(s) || !num(n)) return null;
      if (n < s) return null;
      const lo = Math.max(-90, s), hi = Math.min(90, n);
      return (hi >= lo) ? [lo, hi] : null;
    }

    function median(list) {
      const n = list.length;
      if (!n) return 0;
      const a = list.slice().sort((x, y) => x - y);
      const h = n >> 1;
      return (n % 2) ? a[h] : (a[h - 1] + a[h]) / 2;
    }

    /* The 5th–95th percentile width of a set of values: the extent with the outliers left out. Used
       for the density term of the cell size — see the header for the measurement that made the full
       min/max extent the wrong input. Nearest-rank, because interpolating between two coordinates
       would invent a value that is not in the data for no benefit at this use. */
    function coreWidth(list) {
      const n = list.length;
      if (n < 2) return 0;
      const a = list.slice().sort((x, y) => x - y);
      const lo = a[Math.floor(0.05 * (n - 1))], hi = a[Math.ceil(0.95 * (n - 1))];
      return Math.max(0, hi - lo);
    }

    /* ── build ────────────────────────────────────────────────────────────────────────────────── */

    /* `items` are kept BY REFERENCE and handed back by query() unchanged: the caller's rows in
       js/gis-ops.js already carry { geometry, bbox, … } and re-wrapping them would make the index
       own a second copy of the same 50,000 features. Only `bbox` is read; `opts.bboxOf(item, i)`
       overrides where it lives. */
    function build(items, opts) {
      const o = opts || {};
      const getBox = (typeof o.bboxOf === 'function') ? o.bboxOf : defBox;
      const list = Array.isArray(items) ? items : [];
      const n = list.length;

      const norm = new Array(n);
      const always = [];
      const widths = [], heights = [], cxs = [], cys = [];
      let ow = Infinity, os = Infinity, oe = -Infinity, on = -Infinity;

      for (let i = 0; i < n; i++) {
        let rec = null;
        let b = null;
        try { b = getBox(list[i], i); } catch (_) { b = null; }
        if (Array.isArray(b) && b.length >= 4) {
          const lon = lonRanges(b[0], b[2]);
          const lat = latRange(b[1], b[3]);
          if (lon && lat) rec = { lon: lon, lat: lat };
        }
        norm[i] = rec;
        if (!rec) { always.push(i); continue; }
        let wsum = 0;
        for (const r of rec.lon) {
          wsum += (r[1] - r[0]);
          if (r[0] < ow) ow = r[0];
          if (r[1] > oe) oe = r[1];
        }
        if (rec.lat[0] < os) os = rec.lat[0];
        if (rec.lat[1] > on) on = rec.lat[1];
        widths.push(wsum);
        heights.push(rec.lat[1] - rec.lat[0]);
        /* The centre is taken in the UNWRAPPED longitude of the ranges and brought back, so a
           seam-crossing box contributes the point a reader would call its middle. */
        cxs.push(wrap180(rec.lon[0][0] + wsum / 2));
        cys.push((rec.lat[0] + rec.lat[1]) / 2);
      }

      const placed = widths.length;
      /* The widest axis, not the product: a dataset with no width at all — points along one meridian
         — would otherwise get a density term of 0 and fall through to the floor. */
      const coreSpan = Math.max(coreWidth(cxs), coreWidth(cys));

      /* max(median item size, coreSpan/√n), never larger than coreSpan — see the header for why each
         term is there, what bounds the cell count, and what was measured. */
      let cell = Math.max(median(widths), median(heights));
      if (placed) {
        const dens = coreSpan / Math.sqrt(placed);
        if (dens > cell) cell = dens;
        if (coreSpan > 0 && cell > coreSpan) cell = coreSpan;
      }
      if (!(cell > MIN_CELL_DEG)) cell = MIN_CELL_DEG;

      /* Origin at the data's own minimum corner, not at (-180,-90): the cell coordinates are Map
         keys, and a global origin at a city-scale cell size makes them large integers for no gain. */
      const ox = placed ? ow : -180;
      const oy = placed ? os : -90;

      const cols = new Map();
      let entries = 0, cells = 0;

      for (let i = 0; i < n; i++) {
        const rec = norm[i];
        if (!rec) continue;
        const iy0 = Math.floor((rec.lat[0] - oy) / cell);
        const iy1 = Math.floor((rec.lat[1] - oy) / cell);
        const rows = iy1 - iy0 + 1;
        let want = 0;
        for (const r of rec.lon) {
          want += (Math.floor((r[1] - ox) / cell) - Math.floor((r[0] - ox) / cell) + 1) * rows;
        }
        /* `!(want <= …)` rather than `want > …` so a non-finite count (a box wider than the grid can
           express) takes the safe branch instead of skipping the item. */
        if (!(want <= OVERSIZE_CELLS)) { always.push(i); continue; }
        for (const r of rec.lon) {
          const ix0 = Math.floor((r[0] - ox) / cell);
          const ix1 = Math.floor((r[1] - ox) / cell);
          for (let ix = ix0; ix <= ix1; ix++) {
            let col = cols.get(ix);
            if (!col) { col = new Map(); cols.set(ix, col); }
            for (let iy = iy0; iy <= iy1; iy++) {
              let bucket = col.get(iy);
              if (!bucket) { bucket = []; col.set(iy, bucket); cells++; }
              bucket.push(i);
              entries++;
            }
          }
        }
      }

      return {
        items: list,
        cell: cell, ox: ox, oy: oy,
        cols: cols,
        always: always,
        entries: entries,
        cells: cells,
        bounds: placed ? [ow, os, oe, on] : null,
        /* dedupe state: see visit() */
        mark: new Int32Array(n),
        epoch: 0,
        busy: false,
      };
    }

    /* ── query ────────────────────────────────────────────────────────────────────────────────── */

    /* One item can sit in several cells, so a query must not hand it over twice — a duplicate in an
       aggregate is a double count, which is the same class of wrong answer as a miss. The stamp is
       an epoch per query in a reusable Int32Array (no allocation, no clearing pass). ⚠ A query
       running INSIDE another query on the SAME index would bump the epoch and un-mark what the outer
       one already emitted, so that case falls back to a local Set rather than being documented as a
       rule nobody enforces. */
    function visitor(index) {
      if (index.busy) {
        const seen = new Set();
        return { take: function (i) { if (seen.has(i)) return false; seen.add(i); return true; }, done: function () { } };
      }
      index.busy = true;
      if (index.epoch >= EPOCH_MAX) { index.mark.fill(0); index.epoch = 0; }
      const ep = ++index.epoch;
      const mark = index.mark;
      return {
        take: function (i) { if (mark[i] === ep) return false; mark[i] = ep; return true; },
        done: function () { index.busy = false; },
      };
    }

    /* Hands every candidate to fn(item, i) and returns how many were handed over. fn may return
       `false` to stop the walk early — which is what the yes/no predicates in js/gis-ops.js want,
       since the first hit is their whole answer. Building no array is the point of this entry: a
       50,000-row member set queried once per polygon would otherwise allocate one array per polygon.

       `opts.padDeg` grows the query box on all four sides, in DEGREES, exactly as
       js/gis-ops.js boxesMeet(a, b, padDeg) does for `nearer-than` — the same outward-erring pad, so
       the index never rejects a pair the prefilter would have kept. */
    function queryEach(index, bbox, fn, opts) {
      if (!index || typeof fn !== 'function') return 0;
      const items = index.items;
      const total = items.length;
      if (!total) return 0;

      const pad = (opts && num(opts.padDeg) && opts.padDeg > 0) ? opts.padDeg : 0;

      let lon = null, lat = null;
      if (Array.isArray(bbox) && bbox.length >= 4) {
        lon = lonRanges(bbox[0] - pad, bbox[2] + pad);
        lat = latRange(bbox[1] - pad, bbox[3] + pad);
      }

      /* No usable query box — missing, malformed, or reaching every longitude. Everything is a
         candidate, and saying so is the same outward error boxesMeet makes for a null box. */
      if (!lon || !lat) {
        let k = 0;
        for (let i = 0; i < total; i++) { k++; if (fn(items[i], i) === false) break; }
        return k;
      }

      const v = visitor(index);
      let k = 0;
      try {
        const emit = function (i) {
          if (!v.take(i)) return true;
          k++;
          return fn(items[i], i) !== false;
        };
        for (const i of index.always) { if (!emit(i)) return k; }

        const cell = index.cell, ox = index.ox, oy = index.oy;
        const iy0 = Math.floor((lat[0] - oy) / cell);
        const iy1 = Math.floor((lat[1] - oy) / cell);
        const spans = [];
        let want = 0;
        for (const r of lon) {
          const ix0 = Math.floor((r[0] - ox) / cell);
          const ix1 = Math.floor((r[1] - ox) / cell);
          spans.push([ix0, ix1]);
          want += (ix1 - ix0 + 1) * (iy1 - iy0 + 1);
        }

        /* ⚠ THE WALK IS OVER THE SMALLER OF THE TWO SETS. Addressing the query's cells one by one is
           O(cells the query covers), which is unbounded by the data: a 「世界全体」 query against a
           0.2° grid addresses 1.6 M cells, and a query over a degenerate index whose cell size fell
           to the floor addresses 2·10¹⁰ of them (MEASURED — the first version of this file hung on
           exactly that input, 50 co-located points and a 20°×20° query). When the query covers more
           cells than the whole index HAS, the same cells are found by walking the index instead. The
           candidate set is identical either way; only the cost differs. */
        if (want <= index.cells) {
          for (const s of spans) {
            for (let ix = s[0]; ix <= s[1]; ix++) {
              const col = index.cols.get(ix);
              if (!col) continue;
              for (let iy = iy0; iy <= iy1; iy++) {
                const bucket = col.get(iy);
                if (!bucket) continue;
                for (let j = 0; j < bucket.length; j++) { if (!emit(bucket[j])) return k; }
              }
            }
          }
        } else {
          for (const entry of index.cols) {
            const ix = entry[0];
            let inLon = false;
            for (const s of spans) { if (ix >= s[0] && ix <= s[1]) { inLon = true; break; } }
            if (!inLon) continue;
            for (const cellEntry of entry[1]) {
              const iy = cellEntry[0];
              if (iy < iy0 || iy > iy1) continue;
              const bucket = cellEntry[1];
              for (let j = 0; j < bucket.length; j++) { if (!emit(bucket[j])) return k; }
            }
          }
        }
      } finally { v.done(); }
      return k;
    }

    /* The array form, for callers that want the candidates in hand (a filter, a length, a test). */
    function query(index, bbox, opts) {
      const out = [];
      queryEach(index, bbox, function (it) { out.push(it); }, opts);
      return out;
    }

    /* ── stats ────────────────────────────────────────────────────────────────────────────────── */

    /* ⚠ An index that put every item in one cell, or in `always`, is not an index — and from the
       outside it behaves exactly like one that works, only slower. So the shape of the grid is
       reported rather than assumed: `oversize` is the number of items every query must test,
       `maxPerCell` the worst cell, and `meanPerCell` the average over NON-EMPTY cells (dividing by
       the empty ones would flatter a grid that is mostly air). `entries` is the total number of
       (item, cell) insertions, i.e. what the index cost to build. */
    function stats(index) {
      if (!index) return null;
      let cells = 0, entries = 0, maxPerCell = 0;
      for (const col of index.cols.values()) {
        for (const bucket of col.values()) {
          cells++;
          entries += bucket.length;
          if (bucket.length > maxPerCell) maxPerCell = bucket.length;
        }
      }
      const items = index.items.length;
      return {
        cells: cells,
        items: items,
        indexed: items - index.always.length,
        oversize: index.always.length,
        entries: entries,
        maxPerCell: maxPerCell,
        meanPerCell: cells ? (entries / cells) : 0,
        cellDeg: index.cell,
        bounds: index.bounds,
      };
    }

    /* (#R752) ⚠ A PREFILTER CHANGES ANSWERS, AND THIS ONE HAS. #R743 measured it erring INWARD —
       true pairs off the equator discarded before any distance was measured — under a comment saying
       it erred outward. So 「索引を速くしただけ」 is not a safe thing to assume about an edit here:
       what a `relate` or an `aggregate` returned depends on what this kept. The keeper is
       scripts/gis-kernel-versions.mjs; js/gis-project.js records this beside the ops version. */
    const KERNEL_VERSION = 'index-1';

    const API = {
      build, query, queryEach, stats, version: () => KERNEL_VERSION,
      /* exposed because the seam rule is the one thing in here a check has to be able to ask
         directly: 「その矩形はどの経度帯を覆うと読んだのか」 */
      lonRanges, latRange,
    };
    try { window.IntMapGisIndex = API; } catch (_) { }
    return API;
  })();
}
