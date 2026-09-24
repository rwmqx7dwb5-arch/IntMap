/* ============================================================================
 *  IntMap · THE SPATIAL INDEX — window.IntMapGisIndex   (#R735 · 実測と階層 #R819)
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
 *  ⚠ THE PROMISE IS PER KIND, NOT PER IMPLEMENTATION: both kinds below hand out a superset of the
 *  same set, and tests/r819-gis-index-checks holds each of them against the walk with no index at
 *  all — an index compared only against the other index can be wrong in both.
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
 *
 *  ══ THE SECOND KIND, AND WHY IT IS CHOSEN BY MEASUREMENT (#R819) ══════════════════════════════
 *  The paragraph above used to end 「a dataset whose box sizes span many orders of magnitude will
 *  push items into `always` instead, which is visible in stats() — that is the signal to reach for a
 *  hierarchy here, and until stats() shows it, the hierarchy would be a guess」. stats() shows it, so
 *  the hierarchy is here — and it is still not the default, because WHICH INDEX IS FASTER IS A
 *  MEASUREMENT AND NOT A NAME. 「空間索引が無い」 and 「R-tree にすれば直る」 are the same mistake
 *  made in two directions; what decides is how many geometry tests were actually avoided, which is
 *  what every counter in stats() exists to say.
 *
 *    · kind 'grid'   — one uniform grid, the cell size above. What every caller got before #R819 and
 *                      what every caller still gets by default: same cells, same candidate order.
 *    · kind 'tiered' — several uniform grids, cell sizes doubling from the same cell size and the
 *                      same origin. An item is written into the FINEST level whose cell is at least
 *                      as large as the item itself, so it occupies at most 2×2 cells THERE instead
 *                      of hundreds here or of nothing at all in `always`. Two stages, the same two
 *                      DuckDB's and PostGIS's R-trees use: the levels answer with bounding boxes,
 *                      and the exact condition is evaluated afterwards by the caller — this file
 *                      never evaluates it (see ⚠ NO SECOND COPY OF boxesMeet below).
 *    · kind 'auto'   — build() counts, in one O(n) arithmetic pass and before any insertion, how many
 *                      items the grid would push into `always`, and takes the tiered index when that
 *                      share exceeds AUTO_OVERSIZE_RATIO. It is the one number that bounds what any
 *                      index can do: an item in `always` is handed to EVERY query for ever.
 *
 *  ⚠ THE DEFAULT IS STILL 'grid'. A kind is chosen by opts.kind, and nothing else in the repository
 *  changes kind on its own — an index that silently answered with a different candidate set would
 *  make js/gis-project.js replay a saved recipe through an engine the record does not name.
 *
 *  ══ THE MEASUREMENT, AND WHY IT LIVES HERE AND NOT IN THE CALLER (#R819) ══════════════════════
 *  stats() reports, per index: how many items went in, how many queries were asked, how many
 *  CANDIDATES the index handed out, how many of those the caller's exact test kept (`delivered` —
 *  i.e. how many pieces of geometry were actually looked at), how long build took, how long the
 *  queries took, what share sits in `always`, and what the index is holding in memory.
 *  ⚠ THE COUNTING IS IN ONE PLACE. `delivered` happens OUTSIDE this file — it is the caller's
 *  predicate that decides — so the caller hands that predicate IN, as opts.test, through the same
 *  entry that distributes the candidates. A caller that counted for itself would be a second
 *  implementation of the same count, and two counts of one thing drift (this file already refuses a
 *  second copy of boxesMeet for the same reason). With no opts.test the numbers are still true:
 *  `delivered` is then simply equal to `candidates`, because everything handed over was looked at.
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
 *  about that rule is its DIRECTION: unknown extent errs outward. opts.test does not change that:
 *  the predicate is the caller's, passed in and called, never reimplemented.
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
       would start catching ordinary data (which stats().oversize would show).
       ⚠ It applies to the 'grid' kind. The tiered kind has no such ceiling BY CONSTRUCTION — a large
       item is written into a large cell — so there `always` holds only boxes that cannot be read. */
    const OVERSIZE_CELLS = 64;

    /* A floor for the cell size, needed only when the data has no extent at all (every item the same
       point). 1e-9° ≈ 0.1 mm at the equator, four orders below the ~1e-13° a float64 degree resolves
       near ±180, so no pair of distinguishable coordinates is merged by it; with zero extent every
       item lands in one cell, which is the correct answer for co-located items. */
    const MIN_CELL_DEG = 1e-9;

    /* The number of doublings the tiered kind may take above the base cell. DERIVED, not chosen: the
       base cell is at least MIN_CELL_DEG (1e-9°) and no box can be wider than 360°, so the coarsest
       level anyone can need is 2^L ≥ 360/1e-9 = 3.6e11, i.e. L = 39. 40 is that plus the level the
       loop starts on. ⚠ Expires if MIN_CELL_DEG changes: the two numbers are one derivation, and the
       floor is the source of it. Nothing depends on the cap being reached — an item that somehow
       needed a level beyond it is simply written into the coarsest one and occupies more cells there,
       which is a cost and not a wrong answer. */
    const MAX_LEVELS = 40;

    /* 'auto' takes the tiered kind when this share of the items would land in the grid's `always`
       bucket. It is a CEILING ON WHAT THE GRID CAN DO, not a taste: an item in `always` is handed to
       EVERY query for ever, so a grid holding a share f of them hands out at least f·n candidates per
       query — f of what the scan it replaces would hand out — however well it indexes the rest. At
       f = 0.05 the grid's best possible speedup is 20x.
       ⚠ MEASURED (#R819, Node on the author's machine: 20,000 items of which a share f are
       continent-sized boxes and the rest ~0.05° points; 2,000 queries of 1°; the caller's exact box
       test handed in as opts.test). Candidate counts are deterministic, so they are the evidence; the
       millisecond columns at small f are single-digit and are noise.
         f=0       grid    10,350 candidates / tiered    10,350 — IDENTICAL. With no oversized item
                   the tiered index has ONE level and IS the grid, which is what makes this one
                   number enough to decide on.
         f=0.0005  grid    24,383 / tiered    15,241   (oversize 7)
         f=0.001   grid    52,305 / tiered    28,802   (oversize 21)
         f=0.005   grid   204,100 / tiered    90,736   (oversize 97)
         f=0.02    grid   803,955 / tiered   341,209   (oversize 397)
         f=0.05    grid 1,931,517 / tiered   800,841   (oversize 961); query 28-30 ms vs 19-20 ms
       The grid's excess over its own f=0 baseline is oversize × queries EXACTLY (7 × 2,000 = 14,000
       of the 14,033 measured; the remainder is real overlap) — the ceiling above, observed rather
       than argued. ⚠ `delivered` was the SAME NUMBER for both kinds at every f: the no-false-negative
       promise measured, not assumed.
       ⚠ THE CROSSOVER IS BELOW 0.05, NOT AT IT — on this input the tiered kind is already ahead at
       f=0.0005. This threshold is deliberately the conservative end of the measured range, because
       'auto' changes which engine answers and a caller must not have that taken from them over a few
       thousand candidates. Expiry: if the two kinds ever stop differing in how they treat an
       oversized item (i.e. if the grid gains a coarse level of its own), this number has no subject.
       Sole owner of the threshold — a caller wanting the other kind names it with opts.kind rather
       than restating a number here. */
    const AUTO_OVERSIZE_RATIO = 0.05;

    /* Bytes per unit of retained structure, used ONLY for stats().retained.bytesApprox and reported
       under a name that says it is approximate. ⚠ THESE ARE ESTIMATES AND THERE IS NO MEASUREMENT
       BEHIND THEM THAT A PAGE COULD MAKE — no browser exposes a per-object heap size to script, so
       the honest thing is to publish the structural counts (entries, cells, items) as facts and this
       derived number as an estimate beside them.
         · ENTRY_BYTES 8 — one (item, cell) insertion is one element of a JS array holding a small
           integer; a 64-bit engine gives a packed-SMI element one 8-byte slot.
         · CELL_BYTES 96 — one non-empty cell is one Map entry (key, value and hash-table slot) plus
           the header and backing store of the array it points at. A round over-estimate on purpose:
           a reader deciding whether an index fits in memory must not be told a number that is too
           small.
       index.mark is an Int32Array, so its 4 bytes per item are exact rather than estimated, and the
       items themselves are NOT counted — they are held by reference and belong to the caller.
       Expiry: whenever the structure below stops being Map-of-Map-of-array. */
    const ENTRY_BYTES = 8;
    const CELL_BYTES = 96;

    /* Int32 marks are per-query epochs rather than a cleared array. The reset point is below
       2^31 so the comparison never sees a wrapped epoch. */
    const EPOCH_MAX = 2147483000;

    /* One monotonic clock for build and query time. performance.now() where it exists — both the
       browser and Node have it — and Date.now() otherwise. ⚠ The fallback resolves milliseconds, so
       a query faster than that reads 0: a zero here means 「測れなかった」 and not 「無料だった」,
       which is why stats() reports the query COUNT beside the time. */
    const clock = (function () {
      try {
        if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
          return function () { return performance.now(); };
        }
      } catch (_) { }
      return function () { return Date.now(); };
    })();

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

    /* ── levels ───────────────────────────────────────────────────────────────────────────────── */

    /* A LEVEL IS A UNIFORM GRID: { cell, cols: Map<ix, Map<iy, int[]>>, cells, entries }. The 'grid'
       kind is ONE level and the 'tiered' kind is several over the same origin — which is why the
       insertion and the walk below are written once each and not twice. The only thing the kind
       decides is WHICH level an item is written into. */
    function makeLevel(cell) { return { cell: cell, cols: new Map(), cells: 0, entries: 0 }; }

    /* How many cells rec would occupy at this cell size. `want` can be non-finite for a box wider
       than the grid can express, which is why every caller compares with `!(want <= …)`. */
    function cellsWanted(rec, cell, ox, oy) {
      const rows = Math.floor((rec.lat[1] - oy) / cell) - Math.floor((rec.lat[0] - oy) / cell) + 1;
      let want = 0;
      for (const r of rec.lon) {
        want += (Math.floor((r[1] - ox) / cell) - Math.floor((r[0] - ox) / cell) + 1) * rows;
      }
      return want;
    }

    function insertAt(level, rec, i, ox, oy) {
      const cell = level.cell;
      const iy0 = Math.floor((rec.lat[0] - oy) / cell);
      const iy1 = Math.floor((rec.lat[1] - oy) / cell);
      for (const r of rec.lon) {
        const ix0 = Math.floor((r[0] - ox) / cell);
        const ix1 = Math.floor((r[1] - ox) / cell);
        for (let ix = ix0; ix <= ix1; ix++) {
          let col = level.cols.get(ix);
          if (!col) { col = new Map(); level.cols.set(ix, col); }
          for (let iy = iy0; iy <= iy1; iy++) {
            let bucket = col.get(iy);
            if (!bucket) { bucket = []; col.set(iy, bucket); level.cells++; }
            bucket.push(i);
            level.entries++;
          }
        }
      }
    }

    /* The level a tiered index writes rec into: the first whose cell is at least as wide as the item
       on BOTH axes, measuring longitude per range rather than summed — a seam-crossing box is two
       narrow intervals at opposite ends of the world, and summing them would send it to a level
       coarser than anything it touches. With cell ≥ the item's extent, an interval of that length
       meets at most two cells per axis, so an item occupies at most 2×2 per range: the ceiling
       OVERSIZE_CELLS exists to enforce in the grid is a property of the structure here. */
    function levelFor(rec, base) {
      let extent = rec.lat[1] - rec.lat[0];
      for (const r of rec.lon) { const w = r[1] - r[0]; if (w > extent) extent = w; }
      let L = 0, c = base;
      while (L < MAX_LEVELS && c < extent) { c *= 2; L++; }
      return L;
    }

    /* ── build ────────────────────────────────────────────────────────────────────────────────── */

    /* `items` are kept BY REFERENCE and handed back by query() unchanged: the caller's rows in
       js/gis-ops.js already carry { geometry, bbox, … } and re-wrapping them would make the index
       own a second copy of the same 50,000 features. Only `bbox` is read; `opts.bboxOf(item, i)`
       overrides where it lives.

       opts.kind — 'grid' (the default, and what every caller got before #R819), 'tiered', or 'auto'.
       ⚠ An unknown value is the default rather than an error: a caller asking for a kind this build
       does not have must get the old, correct index rather than none. stats().kind says which one it
       actually got, so the request is never assumed to have been honoured. */
    function build(items, opts) {
      const t0 = clock();
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

      /* ── which kind. `auto` DECIDES BY COUNTING, in one arithmetic pass and before a single cell
         is written: how many items the grid would refuse to place. Everything else is either the
         caller's explicit choice or the default. */
      const asked = (o.kind === 'tiered' || o.kind === 'auto' || o.kind === 'grid') ? o.kind : 'grid';
      let wouldOversize = 0;
      if (asked === 'auto') {
        for (let i = 0; i < n; i++) {
          const rec = norm[i];
          if (!rec) { wouldOversize++; continue; }
          if (!(cellsWanted(rec, cell, ox, oy) <= OVERSIZE_CELLS)) wouldOversize++;
        }
      }
      const kind = (asked === 'tiered' || (asked === 'auto' && n > 0 && (wouldOversize / n) > AUTO_OVERSIZE_RATIO))
        ? 'tiered' : 'grid';

      const levels = [];
      function levelAt(L) {
        let lv = levels[L];
        if (!lv) {
          /* cell · 2^L, computed by doubling rather than by Math.pow so every level's size is
             exactly representable from the one below it. */
          let c = cell;
          for (let k = 0; k < L; k++) c *= 2;
          lv = levels[L] = makeLevel(c);
        }
        return lv;
      }
      if (kind === 'grid') levelAt(0);

      for (let i = 0; i < n; i++) {
        const rec = norm[i];
        if (!rec) continue;
        if (kind === 'tiered') {
          insertAt(levelAt(levelFor(rec, cell)), rec, i, ox, oy);
          continue;
        }
        /* `!(want <= …)` rather than `want > …` so a non-finite count (a box wider than the grid can
           express) takes the safe branch instead of skipping the item. */
        if (!(cellsWanted(rec, cell, ox, oy) <= OVERSIZE_CELLS)) { always.push(i); continue; }
        insertAt(levels[0], rec, i, ox, oy);
      }

      let entries = 0, cells = 0, used = 0;
      for (const lv of levels) { if (!lv) continue; used++; entries += lv.entries; cells += lv.cells; }

      const index = {
        items: list,
        kind: kind,
        cell: cell, ox: ox, oy: oy,
        levels: levels,
        /* Kept under its old name because it is the grid's own cell map and a reader of this object
           (or of a heap snapshot) should find it where it has always been. For 'tiered' it is the
           finest level, which is the same thing one level up. */
        cols: (levels[0] && levels[0].cols) || new Map(),
        always: always,
        entries: entries,
        cells: cells,
        levelCount: used,
        bounds: placed ? [ow, os, oe, on] : null,
        /* dedupe state: see visit() */
        mark: new Int32Array(n),
        epoch: 0,
        busy: false,
        metrics: null,
      };
      index.metrics = newMetrics();
      index.metrics.buildMs = clock() - t0;
      return index;
    }

    /* ── the counters ─────────────────────────────────────────────────────────────────────────── */

    /* ⚠ ONE PLACE COUNTS. Everything a caller could want to know about how much work the index saved
       is accumulated here, at the one point candidates leave the file — see the header. `queries`
       sits beside `queryMs` because a 0 ms total over 4,000 queries is a clock that could not
       measure them, not a free index. */
    function newMetrics() {
      return {
        buildMs: 0,
        queries: 0,       // how many times the index was asked
        queryMs: 0,       // wall time inside queryEach, in ms
        candidates: 0,    // items the index handed out (before the caller's exact test)
        delivered: 0,     // items handed to fn, i.e. geometry actually looked at
        scans: 0,         // queries answered by walking every item (no usable query box)
        stopped: 0,       // queries the caller ended early (fn returned false)
      };
    }

    /* Zeroes the per-query counters, for a caller that reports them PER OP: js/gis-ops.js builds one
       index and queries it from several ops, and a total that spans both says nothing about either.
       ⚠ buildMs is not reset — the build happened once and did not happen again. */
    function resetMetrics(index) {
      if (!index) return null;
      const built = index.metrics ? index.metrics.buildMs : 0;
      index.metrics = newMetrics();
      index.metrics.buildMs = built;
      return index.metrics;
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

    /* Walks one level for the cells (lon, lat) covers and calls emit(i) for every item in them.
       Returns false when emit asked to stop.

       ⚠ THE WALK IS OVER THE SMALLER OF THE TWO SETS. Addressing the query's cells one by one is
       O(cells the query covers), which is unbounded by the data: a 「世界全体」 query against a
       0.2° grid addresses 1.6 M cells, and a query over a degenerate index whose cell size fell to
       the floor addresses 2·10¹⁰ of them (MEASURED — the first version of this file hung on exactly
       that input, 50 co-located points and a 20°×20° query). When the query covers more cells than
       the level HAS, the same cells are found by walking the level instead. The candidate set is
       identical either way; only the cost differs. ⚠ The comparison is per level, because in a
       tiered index a query that is small against the finest level is large against the coarsest. */
    function walkLevel(level, lon, lat, ox, oy, emit) {
      if (!level || !level.cells) return true;
      const cell = level.cell;
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
      if (want <= level.cells) {
        for (const s of spans) {
          for (let ix = s[0]; ix <= s[1]; ix++) {
            const col = level.cols.get(ix);
            if (!col) continue;
            for (let iy = iy0; iy <= iy1; iy++) {
              const bucket = col.get(iy);
              if (!bucket) continue;
              for (let j = 0; j < bucket.length; j++) { if (!emit(bucket[j])) return false; }
            }
          }
        }
      } else {
        for (const entry of level.cols) {
          const ix = entry[0];
          let inLon = false;
          for (const s of spans) { if (ix >= s[0] && ix <= s[1]) { inLon = true; break; } }
          if (!inLon) continue;
          for (const cellEntry of entry[1]) {
            const iy = cellEntry[0];
            if (iy < iy0 || iy > iy1) continue;
            const bucket = cellEntry[1];
            for (let j = 0; j < bucket.length; j++) { if (!emit(bucket[j])) return false; }
          }
        }
      }
      return true;
    }

    /* Hands every candidate to fn(item, i) and returns how many were handed over. fn may return
       `false` to stop the walk early — which is what the yes/no predicates in js/gis-ops.js want,
       since the first hit is their whole answer. Building no array is the point of this entry: a
       50,000-row member set queried once per polygon would otherwise allocate one array per polygon.

       `opts.padDeg` grows the query box on all four sides, in DEGREES, exactly as
       js/gis-ops.js boxesMeet(a, b, padDeg) does for `nearer-than` — the same outward-erring pad, so
       the index never rejects a pair the prefilter would have kept.

       `opts.test(item, i)` — THE CALLER'S EXACT BOX TEST, handed in rather than duplicated. When it
       is given, only the items it keeps reach fn, and the index counts both sides: `candidates` is
       what the grid removed the rest from, `delivered` is what the caller then looked at. The return
       value counts CANDIDATES either way, which is what it counted before #R819. ⚠ It is the
       caller's rule and this file does not know it: an absent test means everything handed over was
       looked at, and the numbers say exactly that. */
    function queryEach(index, bbox, fn, opts) {
      if (!index || typeof fn !== 'function') return 0;
      const items = index.items;
      const total = items.length;
      if (!total) return 0;

      const m = index.metrics || (index.metrics = newMetrics());
      const t0 = clock();
      m.queries++;

      const pad = (opts && num(opts.padDeg) && opts.padDeg > 0) ? opts.padDeg : 0;
      const test = (opts && typeof opts.test === 'function') ? opts.test : null;

      let lon = null, lat = null;
      if (Array.isArray(bbox) && bbox.length >= 4) {
        lon = lonRanges(bbox[0] - pad, bbox[2] + pad);
        lat = latRange(bbox[1] - pad, bbox[3] + pad);
      }

      let k = 0, gave = 0, halted = false;

      /* No usable query box — missing, malformed, or reaching every longitude. Everything is a
         candidate, and saying so is the same outward error boxesMeet makes for a null box. */
      if (!lon || !lat) {
        m.scans++;
        for (let i = 0; i < total; i++) {
          k++;
          if (test && test(items[i], i) === false) continue;
          gave++;
          if (fn(items[i], i) === false) { halted = true; break; }
        }
        m.candidates += k; m.delivered += gave; if (halted) m.stopped++;
        m.queryMs += clock() - t0;
        return k;
      }

      const v = visitor(index);
      try {
        const emit = function (i) {
          if (!v.take(i)) return true;
          k++;
          if (test && test(items[i], i) === false) return true;
          gave++;
          if (fn(items[i], i) === false) { halted = true; return false; }
          return true;
        };
        for (const i of index.always) { if (!emit(i)) return k; }
        /* Finest level first, so the candidate order for a 'grid' index is exactly what it was. */
        for (let L = 0; L < index.levels.length; L++) {
          if (!walkLevel(index.levels[L], lon, lat, index.ox, index.oy, emit)) return k;
        }
      } finally {
        v.done();
        m.candidates += k; m.delivered += gave; if (halted) m.stopped++;
        m.queryMs += clock() - t0;
      }
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
       (item, cell) insertions, i.e. what the index cost to build.

       (#R819) Beside the shape, THE WORK: which kind was built, how long that took, how many queries
       were asked, how many candidates they produced, and how many of those survived the caller's
       exact test — `delivered` is the count of geometry tests the caller actually performed, and
       `items × queries − candidates` is the number it did not. `retained` is what the index is
       holding; see ENTRY_BYTES for why one of its four numbers is called bytesApprox.
       ⚠ Every field here is derived from the one set of counters queryEach keeps. Nothing in this
       object asks the caller to have counted anything itself. */
    function stats(index) {
      if (!index) return null;
      let cells = 0, entries = 0, maxPerCell = 0;
      const levels = [];
      for (const lv of (index.levels || [])) {
        if (!lv) continue;
        let lvMax = 0;
        for (const col of lv.cols.values()) {
          for (const bucket of col.values()) {
            cells++;
            entries += bucket.length;
            if (bucket.length > maxPerCell) maxPerCell = bucket.length;
            if (bucket.length > lvMax) lvMax = bucket.length;
          }
        }
        levels.push({ cellDeg: lv.cell, cells: lv.cells, entries: lv.entries, maxPerCell: lvMax });
      }
      const items = index.items.length;
      const m = index.metrics || newMetrics();
      const asked = m.queries;
      return {
        /* shape (unchanged since #R735) */
        cells: cells,
        items: items,
        indexed: items - index.always.length,
        oversize: index.always.length,
        entries: entries,
        maxPerCell: maxPerCell,
        meanPerCell: cells ? (entries / cells) : 0,
        cellDeg: index.cell,
        bounds: index.bounds,
        /* which index answered (#R819) */
        kind: index.kind || 'grid',
        levels: levels,
        oversizeRatio: items ? (index.always.length / items) : 0,
        /* the work (#R819) */
        buildMs: m.buildMs,
        queries: asked,
        queryMs: m.queryMs,
        candidates: m.candidates,
        delivered: m.delivered,
        scans: m.scans,
        stopped: m.stopped,
        /* What a scan would have handed the same predicate, for the same queries — the denominator
           that makes `candidates` mean something. It is items × queries and not a second
           measurement: the unindexed walk in js/gis-ops.js visits every member for every query. */
        scanned: items * asked,
        candidateRatio: (items && asked) ? (m.candidates / (items * asked)) : 0,
        retained: {
          entries: entries,
          cells: cells,
          always: index.always.length,
          bytesApprox: entries * ENTRY_BYTES + cells * CELL_BYTES
            + index.always.length * ENTRY_BYTES + items * 4,
        },
      };
    }

    /* (#R752) ⚠ A PREFILTER CHANGES ANSWERS, AND THIS ONE HAS. #R743 measured it erring INWARD —
       true pairs off the equator discarded before any distance was measured — under a comment saying
       it erred outward. So 「索引を速くしただけ」 is not a safe thing to assume about an edit here:
       what a `relate` or an `aggregate` returned depends on what this kept. The keeper is
       scripts/gis-kernel-versions.mjs; js/gis-project.js records this beside the ops version.
       ⚠ (#R819) NOT RAISED, and the choice is the one that gate exists to force. The default kind
       builds the same cells from the same derivation and emits the same candidates in the same
       order; the counters observe and decide nothing; and the tiered kind — which a caller must ask
       for by name — hands out a different SUPERSET of the same set, after which the caller's exact
       test produces the same answer. New capability and new observation are not a changed answer.
       ⚠ The recorded HASH does change, and has to be re-recorded in scripts/gis-kernel-versions.mjs
       for this edit. */
    const KERNEL_VERSION = 'index-1';

    const API = {
      build, query, queryEach, stats, resetMetrics, version: () => KERNEL_VERSION,
      /* exposed because the seam rule is the one thing in here a check has to be able to ask
         directly: 「その矩形はどの経度帯を覆うと読んだのか」 */
      lonRanges, latRange,
    };
    try { window.IntMapGisIndex = API; } catch (_) { }
    return API;
  })();
}
