/* ============================================================================
 *  IntMap · THE HISTORICAL BUNDLES, HELD ON ANOTHER THREAD — window.IntMapHistBundles
 *  (hist-bundles-off-main)
 * ----------------------------------------------------------------------------
 *  The ring-pooled records under data/ — data/cshapes.js, data/hist-borders.js, data/hist-eras.js,
 *  data/hist-admin1.js, data/hist-admin2.js, data/hist-admin3.js and the two gap records spliced
 *  into the first tier (data/hist-kuni.js, data/hist-admin-fill.js) — were each read by injecting a
 *  <script> tag, so the moment a reader first moved the clock into the past the MAIN THREAD
 *  evaluated a 13-41 MB object literal and allocated every ring of it, although one instant needs
 *  only the records in force on that day — a fraction of each file (counted per year in the
 *  development record). The measured cost (Playwright Chromium, before this file) is in
 *  dev-notes/2026-09-30-hist-bundles-off-main.md; the decision and its lapse conditions are in
 *  DECISIONS.md.
 *
 *  ══ WHAT MOVED, AND WHAT DID NOT ══════════════════════════════════════════════════════════════
 *  The WHOLE bundle now lives in a Worker. Its bytes are read on the page under the app's one clock
 *  (js/fetch-deadline.js `readWithin`, idle) and TRANSFERRED — never decoded here — and it is parsed
 *  there (the files are `window.<GLOBAL>=` followed by strict JSON, so `JSON.parse` reads them — the
 *  format and the builders are unchanged) and asked there. What crosses back to the page is only what the
 *  instant needs:
 *    · `at(t, end)`       the indices of the records in force at YYYYMMDD `t`
 *    · `during(t0, t1)`   the indices of the records in force at any instant of [t0, t1]
 *    · `snap(y)`          one era sheet
 *    · `edges(end,lo,hi)` the change dates, as sortable YYYYMMDD ints
 *  …and, the first time a record or a ring is needed, that record and those rings, which the page
 *  keeps in a MIRROR of the bundle: the same object shape (`rings`, `feats`, `dates`, `snaps`, and
 *  every scalar the bundle states at its top), with only the entries that have been asked for
 *  filled in. So every reader downstream — the polygon builders, js/border-coast.js's line runs and
 *  its detail fingerprint, the click, the popup outline, the labels, Atlas's `currentFC()` — reads
 *  the SAME row and the SAME ring array it read before, by the same index.
 *  ⚠ A RING IS SENT ONCE. The worker remembers what it has sent and the page keeps what it
 *  received, so scrubbing a century ships only the rings that century adds, and a ring shared by
 *  two records (the pooling the builders do) is one array on the page as it was in the bundle.
 *  ⚠ THE MIRROR IS SPARSE AND NOTHING ON THE PAGE MAY WALK IT WHOLE. Every question that needs
 *  every record — which records are in force, where the epochs change — is asked of the thread that
 *  holds every record. That is the whole design, and it is why the four questions above exist.
 *
 *  ══ ONE JOB, TWO CALLERS (the shape js/data-door.js has) ═════════════════════════════════════
 *  `histJob` below is the only implementation of those questions. Its SOURCE TEXT is the worker's
 *  program, and the page runs the same function when there is no worker — a runtime without one, a
 *  CSP that refuses it, a thread that died — and when a bundle has already been published on
 *  `window` by somebody else (the node harnesses under tests/ and scripts/ do exactly that). There
 *  is no second copy of «in force on this day» that could disagree with it.
 *  ⚠ SELF-CONTAINED ON PURPOSE: a name borrowed from this file would not be in the text.
 *
 *  ══ THE ANSWER IS SENT IN SLICES ══════════════════════════════════════════════════════════════
 *  Receiving a structured clone is not free — the page thread builds every array it contains
 *  (js/data-door.js measured it). A first travel into 1900 needs several MB of rings, and one
 *  message would be one long task of exactly the kind this file exists to remove. So the rings are
 *  posted in slices of at most SLICE_POINTS coordinate pairs; each slice is its own task and the
 *  page can paint between them. See SLICE_POINTS for the number and where it came from.
 *
 *  ⚠ A BLOB WORKER (index.html allows `worker-src blob:`), for the reason js/gis-worker.js records.
 *  ⚠ THE THREAD IS KEPT while it holds a bundle — dropping it would mean parsing 41 MB again on
 *  the next travel. The memory is the memory the page used to hold; it is simply not on the thread
 *  that paints.
 * ==========================================================================*/
window.IntMapHistBundles = (function () {
  /* ⚠ SLICE_POINTS — coordinate pairs per posted slice; a slice is closed BEFORE a ring that would
     carry it past this, so it holds at most this many pairs, or one ring when a single ring is larger
     (the largest shipped ring is 17,523 pairs, data/hist-eras.js). OBSERVED 2026-09-30 (Playwright
     Chromium, CPU profile of the page thread, 4x throttle, first travel into 1900 on the first
     subdivision tier: 37 slices, 205 ms of message handling in all, about 6 ms each), so no slice is a
     long task. (The first version closed a slice only AFTER it passed 20,000, so one message could
     carry about 37,000 pairs — two of the largest rings on top of a full slice.) What remains on the page is
     the byte read's own merge in js/fetch-deadline.js and the collection it triggers
     (dev-notes/2026-09-30-hist-bundles-off-main.md). LAPSES if the ring encoding changes (the pairs stop
     being two-number arrays) or a browser changes what a clone costs to receive. Used in one place, the
     job below, which receives it as `m.slice`. */
  const SLICE_POINTS = 8000;

  /* ── THE JOB ── `S` is the thread's own state (one object per thread), `m` the question, `emit`
     how a slice of rows and rings reaches the page before the answer does. Returns the answer, or a
     Promise of it. */
  function histJob(S, m, emit) {
    var ymd = function (y, mo, d) { return y * 10000 + mo * 100 + d; };
    /* the day after Y-M-D, on the proleptic calendar — setUTCFullYear, never Date.UTC, whose two-digit
       year rule would move years 0-99 into the twentieth century */
    var dayAfter = function (y, mo, d) {
      var t = new Date(0); t.setUTCFullYear(y, mo - 1, d); t.setUTCDate(t.getUTCDate() + 1);
      return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    };
    /* YYYYMMDD back into its three parts — exact for every row the tile builder accepts, which refuses a
       month or day outside 0-99 (scripts/build-hist-tiles.mjs) */
    var partsOf = function (k) { var y = Math.floor(k / 10000), r = k - y * 10000, mo = Math.floor(r / 100); return [y, mo, r - mo * 100]; };
    /* every row's [start, end] as sortable ints, side by side — what `at`, `during` and `edges` walk.
       A whole record derives it from its rows; a tiled one is handed it by its index file, which is the
       point: the questions that need every record need only this, never the rows themselves. */
    function spanOf(d) {
      var n = Array.isArray(d.feats) ? d.feats.length : 0, sp = new Array(2 * n), i, f;
      for (i = 0; i < n; i++) { f = d.feats[i]; sp[2 * i] = ymd(f[2], f[3], f[4]); sp[2 * i + 1] = ymd(f[5], f[6], f[7]); }
      return sp;
    }
    /* the file's bytes (read on the page under the app's clock, and TRANSFERRED here) → the object.
       The files are `window.<GLOBAL>=` followed by strict JSON, so the assignment is checked and the
       rest is JSON.parse — the literal is never evaluated as a script. */
    function parse(bytes, global) {
      var text = new TextDecoder().decode(new Uint8Array(bytes));
      var i = text.indexOf('=');
      if (i < 0 || text.slice(0, i).replace(/\s+/g, '') !== 'window.' + global) throw new Error('not the ' + global + ' bundle');
      return JSON.parse(text.slice(i + 1).replace(/;\s*$/, ''));
    }
    /* what the page may hold whole: every top-level fact except the pools and the per-record tables */
    function head(d) {
      var h = {}, k;
      for (k in d) if (k !== 'rings' && k !== 'feats' && k !== 'snaps' && k !== 'dates') h[k] = d[k];
      /* ⚠ (hist-coverage-depth) A RECORD WHOSE ROWS CANNOT ADDRESS ITS DATES HOLDS THEM IN THE HEAD. The
         tiers key `dates` by the OpenHistoricalMap relation id in column 10, and the rows carry them to
         the page one by one (`ship`, and the tile builder's chunks, both by `d.dates[row[10]]`). A
         surveyed gap record (scripts/build-hist-admin-surveys.mjs) has no relation id — its column 10
         is the publisher's key — and keys its dates by its OWN row, so no row would ever carry one: the
         tiled path dropped them and the popup said «? – ?» under a unit dated to the day. The fact
         asked is the rows', not the file's name: no row holds a numeric id, so the table goes whole
         (one entry per row of a gap record — `openTiled` reads it as `rowDates`, the whole-file
         `splice` reads the record's own `dates`; both land in `gapDates`).
         ⚠ BEFORE the counts: `openTiled` rebuilds a head from an index head key by key, and a tiled head
         must be the whole one key for key (the tile builder compares them as text). */
      if (d.dates && Array.isArray(d.feats) && d.feats.length && !d.feats.some(function (f) { return f && typeof f[10] === 'number'; })) h.rowDates = d.dates;
      h.nRings = Array.isArray(d.rings) ? d.rings.length : 0;
      h.nFeats = Array.isArray(d.feats) ? d.feats.length : 0;
      h.hasDates = !!d.dates;
      if (Array.isArray(d.snaps)) h.snaps = d.snaps.map(function (s) {
        var o = {}, j; for (j in s) if (j !== 'feats' && j !== 'blank' && j !== 'blankPrecision') o[j] = s[j]; return o;
      });
      return h;
    }
    function hold(global, d, preset) {
      S[global] = { d: d, preset: !!preset, span: spanOf(d), sentF: new Uint8Array(Array.isArray(d.feats) ? d.feats.length : 0),
        sentR: new Uint8Array(Array.isArray(d.rings) ? d.rings.length : 0) };
      return head(d);
    }

    /* ══ THE TILED RECORD (hist-vector-tiles) ══════════════════════════════════════════════════════
       The same record, cut by the build (scripts/build-hist-tiles.mjs) into an INDEX — the head this job
       would have answered `open` with, every row's span, which chunk holds each row and which chunks
       hold its rings — and an ARCHIVE of independent gzip members, one JSON line each. This thread
       never holds the record whole: it is told which records an instant needs by the span, says which
       chunks those live in (`need`), is handed exactly those bytes (`feed` — read on the page under the
       app's one clock, with a Range request) and then answers `at`/`during`/`snap` with the SAME code,
       from the SAME rows and rings, by the SAME indices. A gap record is its own index and archive and
       is spliced here, as `splice` does with whole files: its rings after the record's, its rows after
       the record's rows, rewritten to the same thirteen columns.
       ⚠ A CHUNK NAMES ITSELF (`c`), and gzip carries its own CRC, so bytes that are not that chunk —
       a server that answered another range, or a body it compressed again — fail here instead of
       becoming geometry. */
    function gunzip(bytes) {
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    }
    /* a ring stored as integer deltas at the record's own scale. Exact: the builder keeps this form only
       for rings whose every coordinate comes back as the same double (IEEE division is correctly
       rounded, and the quotient of the integer and the power of ten IS the decimal it was written as) */
    function ringFrom(a, sc) {
      var n = a.length / 2, out = new Array(n), x = 0, y = 0, k;
      for (k = 0; k < n; k++) { x += a[2 * k]; y += a[2 * k + 1]; out[k] = [x / sc, y / sc]; }
      return out;
    }
    function openTiled(global, dirs) {
      var main = dirs[0], h = {}, k, parts = [{ dir: main, rOff: 0, fOff: 0, cOff: 0, gi: -1 }];
      var nR = main.head.nRings, nF = main.head.nFeats, nC = main.chunks.length, span = main.span.slice();
      /* the head in the order `head()` builds it: the record's own facts, the splice's, then the counts and
         the sheets — so a tiled record's mirror is the same object, key for key, as a whole one's */
      for (k in main.head) if (k !== 'nRings' && k !== 'nFeats' && k !== 'hasDates' && k !== 'snaps') h[k] = main.head[k];
      if (dirs.length > 1 && nF > 0) {
        h.gapPools = [];
        for (var gi = 0; gi < dirs.length - 1; gi++) {
          var g = dirs[gi + 1];
          if (!g) { h.gapPools.push(null); continue; }
          parts.push({ dir: g, rOff: nR, fOff: nF, cOff: nC, gi: gi });
          h.gapSrcs = (h.gapSrcs || []).concat(g.head.src ? [g.head.src] : []);
          h.gapSrc = h.gapSrcs.join(' · ') || null;
          h.gapPools.push({ global: g.global, off: nR, nRings: g.head.nRings, nFeats: g.head.nFeats, gi: gi, precision: g.head.precision || null, dateSemantics: g.head.dateSemantics || null });
          /* the record's own dates, by its own row — `head` put them there (see `rowDates`) */
          (h.gapDates || (h.gapDates = []))[gi] = g.head.rowDates || null;
          for (k = 0; k < g.span.length; k++) span.push(g.span[k]);
          nR += g.head.nRings; nF += g.head.nFeats; nC += g.chunks.length;
        }
      }
      h.nRings = nR; h.nFeats = nF; h.hasDates = !!main.head.hasDates;
      if (Array.isArray(main.head.snaps)) h.snaps = main.head.snaps;
      var d = { feats: new Array(nF), rings: new Array(nR) };
      if (h.hasDates) d.dates = {};
      /* the thread's own sheets, never the objects handed back as the head (on the page they would be
         the mirror's own) */
      if (Array.isArray(main.head.snaps)) d.snaps = main.head.snaps.map(function (s) { var o = {}, j; for (j in s) o[j] = s[j]; return o; });
      S[global] = { d: d, tiled: parts, h: h, span: span, have: new Uint8Array(nC), sheetIn: new Uint8Array(d.snaps ? d.snaps.length : 0), preset: false,
        sentF: new Uint8Array(nF), sentR: new Uint8Array(nR) };
      return h;
    }
    function partOfRow(B, i) { for (var p = B.tiled.length - 1; p >= 0; p--) if (i >= B.tiled[p].fOff) return B.tiled[p]; return B.tiled[0]; }
    function partOfChunk(B, c) { for (var p = B.tiled.length - 1; p >= 0; p--) if (c >= B.tiled[p].cOff) return p; return 0; }
    /* the chunks a question will read that this thread does not hold: [chunk, part, offset, length] */
    function needOf(B, q) {
      var want = {}, list = [], i, n, p, lc, rr;
      var add = function (part, pi, l) {
        var c = l + part.cOff;
        if (B.have[c] || want[c]) return;
        want[c] = 1; list.push([c, pi, part.dir.chunks[l][0], part.dir.chunks[l][1]]);
      };
      if (q.op === 'snap') {
        var sn = B.h.snaps || [];
        for (i = 0; i < sn.length; i++) if (sn[i].y === q.y) { rr = (B.tiled[0].dir.snapChunks || [])[i] || []; for (n = 0; n < rr.length; n++) add(B.tiled[0], 0, rr[n]); break; }
      } else if (q.op === 'contains') {
        /* (place-through-time) the rows whose box holds the point, and each sheet polygon's: its sheet's own
           chunk (the rows of the sheet) and only the ring chunks THAT polygon names (the box file lists them) */
        var cand = boxCandidates(B, q.lng, q.lat), bx0 = B.boxes[0];
        for (n = 0; n < cand.rows.length; n++) {
          i = cand.rows[n]; p = partOfRow(B, i); lc = i - p.fOff;
          var pj = B.tiled.indexOf(p);
          if (B.d.feats[i] === undefined) add(p, pj, p.dir.rowChunk[lc]);
          rr = p.dir.rowRings[lc] || [];
          for (var r0 = 0; r0 < rr.length; r0++) add(p, pj, rr[r0]);
        }
        for (n = 0; n < cand.sheets.length; n++) {
          var cs = cand.sheets[n], si0 = cs[0], sh0 = bx0.sheets[si0];
          if (!B.sheetIn[si0]) add(B.tiled[0], 0, (B.tiled[0].dir.snapChunks || [])[si0][0]);
          cs[1].forEach(function (k) { (sh0.fc[k] || []).forEach(function (c) { add(B.tiled[0], 0, c); }); });
          cs[2].forEach(function (k) { (sh0.bc[k] || []).forEach(function (c) { add(B.tiled[0], 0, c); }); });
        }
      } else if (q.op === 'at' || q.op === 'during') {
        var idx = rowsFor(B, q);
        for (n = 0; n < idx.length; n++) {
          i = idx[n]; p = partOfRow(B, i); lc = i - p.fOff;
          var pi = B.tiled.indexOf(p);
          if (B.d.feats[i] === undefined) add(p, pi, p.dir.rowChunk[lc]);
          rr = p.dir.rowRings[lc] || [];
          for (var r = 0; r < rr.length; r++) add(p, pi, rr[r]);
        }
      }
      return list.sort(function (a, b) { return a[0] - b[0]; });
    }
    function install(B, c, obj) {
      var pi = partOfChunk(B, c), p = B.tiled[pi], d = B.d, j, e, f;
      if (!obj || obj.c !== c - p.cOff) { var err = new Error('chunk ' + c + ' is not the bytes asked for'); err.reason = 'tiles'; throw err; }
      for (j = 0; j < (obj.f || []).length; j++) {
        e = obj.f[j]; f = e[1];
        if (d.feats[p.fOff + e[0]] !== undefined) continue;
        d.feats[p.fOff + e[0]] = p.gi < 0 ? f : [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7],
          f[8].map(function (poly) { return poly.map(function (ri) { return ri + p.rOff; }); }), f[9], null, e[0], p.gi];
      }
      if (d.dates && p.gi < 0) for (j = 0; j < (obj.d || []).length; j++) { e = obj.d[j]; if (d.dates[e[0]] === undefined) d.dates[e[0]] = e[1]; }
      for (j = 0; j < (obj.r || []).length; j++) { e = obj.r[j]; if (d.rings[p.rOff + e[0]] === undefined) d.rings[p.rOff + e[0]] = ringFrom(e[1], p.dir.scale); }
      for (j = 0; j < (obj.j || []).length; j++) { e = obj.j[j]; if (d.rings[p.rOff + e[0]] === undefined) d.rings[p.rOff + e[0]] = e[1]; }
      for (j = 0; j < (obj.s || []).length; j++) { e = obj.s[j]; var sh = d.snaps[e[0]]; sh.feats = e[1]; sh.blank = e[2]; sh.blankPrecision = e[3]; B.sheetIn[e[0]] = 1; }
      B.have[c] = 1;
    }
    /* ══ (place-through-time) WHICH ROWS, OF ALL TIME, CONTAIN ONE POINT ═══════════════════════════════
       «Who held this ground, and when» is a question about EVERY row of a record, so it is asked here, where
       every row is (the page's mirror is sparse — see the header). It is answered in two steps:
         · a BOX per row (and per era-sheet polygon), so only the rows whose box holds the point are tested.
           A whole record derives its boxes from its rings the first time it is asked; a tiled one is handed
           them by the box file the build writes beside its index (`boxesOf`, scripts/build-hist-tiles.mjs),
           rounded OUTWARD — a box may be larger than the row, never smaller, so the prefilter cannot drop
           a row that holds the point (the build proves every coordinate lies inside its box);
         · the EXACT test on the rings: even-odd crossings over every ring of each polygon, so a hole is a
           hole and a concave outline is judged by its own edges, not by a sample of points. Planar in
           longitude/latitude — the predicate the click and Atlas already use (js/time-borders.js
           `_contains`, turf.booleanPointInPolygon). A ring that has not arrived is not «outside»: the
           question fails, as `complete` makes `at` fail. */
    var BOX_UNSET = 1e9;
    function boxOfRings(d, polys) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var p = 0; p < polys.length; p++) for (var q = 0; q < polys[p].length; q++) {
        var r = d.rings[polys[p][q]]; if (!r) return null;
        for (var k = 0; k < r.length; k++) { var c = r[k];
          if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; }
      }
      return isFinite(x0) ? [x0, y0, x1, y1] : null;
    }
    function polysHold(d, polys, x, y) {
      for (var p = 0; p < polys.length; p++) {
        var inside = false;
        for (var q = 0; q < polys[p].length; q++) {
          var r = d.rings[polys[p][q]];
          if (!r) { var e = new Error('ring ' + polys[p][q] + ' did not arrive'); e.reason = 'tiles'; throw e; }
          for (var a = 0, b = r.length - 1; a < r.length; b = a++) {
            var ya = r[a][1], yb = r[b][1];
            if ((ya > y) !== (yb > y) && x < r[b][0] + (y - yb) * (r[a][0] - r[b][0]) / (ya - yb)) inside = !inside;
          }
        }
        if (inside) return true;
      }
      return false;
    }
    /* does the row's box hold the point? A tiled record reads the box file (scaled integers, per part); a
       whole one derives the box once and keeps it (NaN-free Float64Array, BOX_UNSET until derived) */
    function rowBoxHolds(B, i, x, y) {
      if (B.tiled) {
        var p = partOfRow(B, i), bx = B.boxes && B.boxes[B.tiled.indexOf(p)];
        if (!bx) { var e = new Error('no box file for ' + (p.dir && p.dir.global)); e.reason = 'tiles'; throw e; }
        var j = 4 * (i - p.fOff), s = bx.scale;
        return x >= bx.rows[j] / s && y >= bx.rows[j + 1] / s && x <= bx.rows[j + 2] / s && y <= bx.rows[j + 3] / s;
      }
      if (!B.box) { B.box = new Float64Array(4 * (B.d.feats || []).length); B.box.fill(BOX_UNSET); }
      if (B.box[4 * i] === BOX_UNSET) {
        var b = boxOfRings(B.d, (B.d.feats[i] && B.d.feats[i][8]) || []) || [Infinity, Infinity, -Infinity, -Infinity];
        B.box[4 * i] = b[0]; B.box[4 * i + 1] = b[1]; B.box[4 * i + 2] = b[2]; B.box[4 * i + 3] = b[3];
      }
      return x >= B.box[4 * i] && y >= B.box[4 * i + 1] && x <= B.box[4 * i + 2] && y <= B.box[4 * i + 3];
    }
    /* the same for one polygon set of an era sheet: `kind` 'f' (a named feature) or 'b' (a blank), `k` its index */
    function sheetBoxHolds(B, si, kind, k, x, y) {
      if (B.tiled) {
        var bx = B.boxes && B.boxes[0], sh = bx && bx.sheets && bx.sheets[si];
        if (!sh) { var e = new Error('no box file for sheet ' + si); e.reason = 'tiles'; throw e; }
        var flat = sh[kind], s = bx.scale, j = 4 * k;
        return x >= flat[j] / s && y >= flat[j + 1] / s && x <= flat[j + 2] / s && y <= flat[j + 3] / s;
      }
      var key = si + kind + k; B.sbox = B.sbox || {};
      var b = B.sbox[key];
      if (b === undefined) {
        var sn = B.d.snaps[si], polys = kind === 'f' ? ((sn.feats[k] && sn.feats[k][2]) || []) : (sn.blank[k] || []);
        b = B.sbox[key] = boxOfRings(B.d, polys);
      }
      return !!b && x >= b[0] && y >= b[1] && x <= b[2] && y <= b[3];
    }
    /* the candidates — rows (and sheet polygons) whose box holds the point; the one prefilter, for both the
       answer and the chunks a tiled record must fetch first */
    function boxCandidates(B, x, y) {
      var n = B.span.length / 2, rows = [], sheets = [], i, si, k;
      for (i = 0; i < n; i++) if (rowBoxHolds(B, i, x, y)) rows.push(i);
      var snaps = B.d.snaps || [];
      for (si = 0; si < snaps.length; si++) {
        var fs = [], bs = [], sn = snaps[si];
        if (B.tiled) {
          var sh = B.boxes && B.boxes[0] && B.boxes[0].sheets && B.boxes[0].sheets[si];
          if (!sh) { var e = new Error('no box file for sheet ' + si); e.reason = 'tiles'; throw e; }
          for (k = 0; k < sh.f.length / 4; k++) if (sheetBoxHolds(B, si, 'f', k, x, y)) fs.push(k);
          for (k = 0; k < sh.b.length / 4; k++) if (sheetBoxHolds(B, si, 'b', k, x, y)) bs.push(k);
        } else {
          for (k = 0; k < (sn.feats || []).length; k++) if (sheetBoxHolds(B, si, 'f', k, x, y)) fs.push(k);
          for (k = 0; k < (sn.blank || []).length; k++) if (sheetBoxHolds(B, si, 'b', k, x, y)) bs.push(k);
        }
        if (fs.length || bs.length) sheets.push([si, fs, bs]);
      }
      return { rows: rows, sheets: sheets };
    }

    /* the rows a question reads — the one predicate, for both the answer and the chunks it needs */
    function rowsFor(B, q) {
      var sp = B.span, n = sp.length / 2, out = [], i, s, e;
      if (q.op === 'at') {
        /* in force ON that date: started at or before it and not yet ended — `s <= t <= e` for an
           inclusive end, `s <= t < e` for an exclusive one. The record's own order is kept. */
        var t = q.t, incl = (q.end === 'inclusive');
        for (i = 0; i < n; i++) { s = sp[2 * i]; e = sp[2 * i + 1];
          if (s > t) continue;
          if (incl ? (e < t) : (e <= t)) continue;
          out.push(i); }
      } else {
        /* in force at SOME instant of [t0, t1] (inclusive end — the one caller reads CShapes) */
        for (i = 0; i < n; i++) { if (sp[2 * i] > q.t1 || sp[2 * i + 1] < q.t0) continue; out.push(i); }
      }
      return out;
    }
    /* a tiled record must hold every row a question reads before it answers: a hole here is a chunk
       that never arrived, and answering around it would draw a world with a country missing */
    function complete(B, idx) {
      if (!B.tiled) return;
      for (var n = 0; n < idx.length; n++) if (B.d.feats[idx[n]] === undefined) { var e = new Error('row ' + idx[n] + ' did not arrive'); e.reason = 'tiles'; throw e; }
    }
    /* ⚠ THE GAP RECORDS ARE APPENDED TO THE FIRST ONE, NOT HELD BESIDE IT (#R669/#R719 — the reason
       is in js/time-admin1.js). Moved here from that file unchanged: column 11 is the row's index in
       ITS OWN file and column 12 which gap record it came from, because js/border-coast.js marks each
       set's rings against its own file. `gapPools` tells the page where each one's rings start. */
    function splice(d, gaps) {
      var i = 0;
      d.gapPools = [];
      var next = function () {
        if (i >= gaps.length) return d;
        var g = gaps[i], gi = i++;
        return Promise.resolve().then(function () { return g.bytes ? parse(g.bytes, g.global) : null; }).then(function (X) {
          if (X && X.rings && X.feats) {
            var off = d.rings.length, k, f;
            for (k = 0; k < X.rings.length; k++) d.rings.push(X.rings[k]);
            for (k = 0; k < X.feats.length; k++) { f = X.feats[k];
              d.feats.push([f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7],
                f[8].map(function (poly) { return poly.map(function (ri) { return ri + off; }); }), f[9], null, k, gi]); }
            d.gapSrcs = (d.gapSrcs || []).concat(X.src ? [X.src] : []);
            d.gapSrc = d.gapSrcs.join(' · ') || null;
            d.gapPools.push({ global: g.global, off: off, nRings: X.rings.length, nFeats: X.feats.length, gi: gi, precision: X.precision || null, dateSemantics: X.dateSemantics || null });
            /* ⚠ (hist-coverage-depth) a gap row's column 10 is null after the splice, so it cannot address
               `d.dates`; a record that states its own dates (a surveyed one) keys them by its own row, which
               is column 11. They ride on the head as plain data — this runs on another thread, and the
               head crosses by structured clone. A derived record has none: null, and the popup says «?». */
            (d.gapDates || (d.gapDates = []))[gi] = X.dates || null;
          } else { d.gapPools.push(null); (d.gapDates || (d.gapDates = []))[gi] = null; }
        }, function () { d.gapPools.push(null); (d.gapDates || (d.gapDates = []))[gi] = null; }).then(next);
      };
      return Promise.resolve().then(next);
    }
    /* the rows and rings of `idx` the page does not have yet, posted in slices */
    function ship(B, idx) {
      if (B.preset) return;
      var d = B.d, feats = [], rings = [], dates = [], pts = 0, lim = m.slice > 0 ? m.slice : Infinity;
      var flush = function () {
        if (!feats.length && !rings.length && !dates.length) return;
        emit({ global: m.global, feats: feats, rings: rings, dates: dates });
        feats = []; rings = []; dates = []; pts = 0;
      };
      for (var n = 0; n < idx.length; n++) {
        var i = idx[n];
        if (B.sentF[i]) continue;
        B.sentF[i] = 1;
        var row = d.feats[i];
        feats.push([i, row]);
        if (d.dates && row[10] != null && d.dates[row[10]] !== undefined) dates.push([row[10], d.dates[row[10]]]);
        var polys = row[8] || [];
        for (var p = 0; p < polys.length; p++) for (var q = 0; q < polys[p].length; q++) {
          var ri = polys[p][q];
          if (B.sentR[ri]) continue;
          /* close the slice BEFORE a ring that would carry it past the limit, so a slice is at most the
             limit — or one ring, when a single ring is larger than the limit */
          if (pts > 0 && pts + d.rings[ri].length > lim) flush();
          B.sentR[ri] = 1; rings.push([ri, d.rings[ri]]); pts += d.rings[ri].length;
        }
      }
      flush();
    }
    function shipRings(B, ids) {
      if (B.preset) return;
      var d = B.d, rings = [], pts = 0, lim = m.slice > 0 ? m.slice : Infinity;
      for (var n = 0; n < ids.length; n++) {
        var ri = ids[n]; if (B.sentR[ri]) continue;
        if (pts > 0 && pts + d.rings[ri].length > lim) { emit({ global: m.global, feats: [], rings: rings, dates: [] }); rings = []; pts = 0; }
        B.sentR[ri] = 1; rings.push([ri, d.rings[ri]]); pts += d.rings[ri].length;
      }
      if (rings.length) emit({ global: m.global, feats: [], rings: rings, dates: [] });
    }

    if (m.op === 'adopt') return hold(m.global, m.value, true);
    if (m.op === 'open') {
      /* a record already held whole answers from what it holds; one held as tiles is replaced by the
         whole file (the page falls back to it only after the tiles failed — the rows and rings it already
         sent stay sent, because the page never replaces an entry it holds) */
      if (S[m.global] && !S[m.global].tiled) return head(S[m.global].d);
      return Promise.resolve().then(function () { return parse(m.bytes, m.global); }).then(function (d) {
        if (!d || typeof d !== 'object') throw new Error('empty bundle ' + m.global);
        return (m.gaps && m.gaps.length && Array.isArray(d.feats)) ? splice(d, m.gaps) : d;
      }).then(function (d) { return hold(m.global, d, false); });
    }
    if (m.op === 'openTiled') {
      if (S[m.global] && S[m.global].tiled) return S[m.global].h;
      return openTiled(m.global, m.dirs);
    }
    var B = S[m.global];
    if (!B) { var e = new Error('not open: ' + m.global); e.reason = 'closed'; throw e; }
    var d = B.d, out = [], i, sp = B.span;
    if (m.op === 'need') return B.tiled ? needOf(B, m.q) : [];
    if (m.op === 'feed') {
      if (!B.tiled) return 0;
      var parts = m.parts || [];
      return parts.reduce(function (pr, part) {
        return pr.then(function () {
          if (B.have[part.c]) return;
          return gunzip(part.bytes).then(function (text) { install(B, part.c, JSON.parse(text)); });
        });
      }, Promise.resolve()).then(function () { return parts.length; });
    }
    if (m.op === 'edges') {
      /* every instant on which the record changes: a START, and an END — the end itself where the
         record's end is exclusive (OpenHistoricalMap), the day after it where it is inclusive
         (CShapes). Both edges, because a unit that vanishes with no successor still ends an epoch. */
      var set = new Set();
      for (i = 0; i < sp.length; i += 2) {
        set.add(sp[i]);
        set.add(m.end === 'inclusive' ? dayAfter.apply(null, partsOf(sp[i + 1])) : sp[i + 1]); }
      set.forEach(function (k) { if (k >= m.lo && k <= m.hi) out.push(k); });
      return out.sort(function (a, b) { return a - b; });
    }
    if (m.op === 'boxes') {
      /* (place-through-time) the box files of a tiled record, one per part (the record, then each gap record in
         splice order) — each must be for the part it is handed as, or the boxes would address another record's rows */
      if (!B.tiled) return 0;
      var bf = m.files || [];
      for (i = 0; i < B.tiled.length; i++) {
        var f0 = bf[i], want = B.tiled[i].dir;
        if (!f0 || f0.hvt !== 1 || f0.global !== want.global || !Array.isArray(f0.rows) || f0.rows.length !== 4 * want.head.nFeats || !(f0.scale > 0)) {
          var e4 = new Error('box file ' + i + ' is not for ' + want.global); e4.reason = 'tiles'; throw e4; }
      }
      B.boxes = bf;
      return bf.length;
    }
    if (m.op === 'contains') {
      /* (place-through-time) → { rows: [[index, row without its polygons]], dates: [[key, the record's dates]],
         sheets: [{ si, y, feats: [[index, names, facts]], blank: [index] }] } — what each row and sheet polygon that
         holds the point SAYS (names, span, identity), never its geometry: the page draws nothing from this answer */
      var x = +m.lng, y = +m.lat;
      if (!isFinite(x) || !isFinite(y)) { var e5 = new Error('no point'); e5.reason = 'input'; throw e5; }
      var cand = boxCandidates(B, x, y), rows = [], dates = [], sheets = [];
      complete(B, cand.rows);
      for (i = 0; i < cand.rows.length; i++) {
        var ri0 = cand.rows[i], row = d.feats[ri0];
        if (!polysHold(d, row[8] || [], x, y)) continue;
        var copy = row.slice(); copy[8] = null; rows.push([ri0, copy]);
        if (d.dates && row[10] != null && d.dates[row[10]] !== undefined) dates.push([row[10], d.dates[row[10]]]);
      }
      for (i = 0; i < cand.sheets.length; i++) {
        var c3 = cand.sheets[i], sn3 = d.snaps[c3[0]];
        if (B.tiled && !B.sheetIn[c3[0]]) { var e6 = new Error('sheet ' + sn3.y + ' did not arrive'); e6.reason = 'tiles'; throw e6; }
        var fh = [], bh = [];
        c3[1].forEach(function (k) { var ft = sn3.feats[k]; if (polysHold(d, ft[2] || [], x, y)) fh.push([k, ft[0], ft[1] || {}]); });
        c3[2].forEach(function (k) { if (polysHold(d, sn3.blank[k] || [], x, y)) bh.push(k); });
        if (fh.length || bh.length) sheets.push({ si: c3[0], y: sn3.y, feats: fh, blank: bh });
      }
      return { rows: rows, dates: dates, sheets: sheets };
    }
    if (m.op === 'at' || m.op === 'during') {
      out = rowsFor(B, m);
      complete(B, out);
      ship(B, out);
      return out;
    }
    if (m.op === 'snap') {
      var sn = null, si = -1;
      for (i = 0; i < (d.snaps || []).length; i++) if (d.snaps[i].y === m.y) { sn = d.snaps[i]; si = i; break; }
      if (!sn) return null;
      /* a sheet that has not arrived is not an empty sheet */
      if (B.tiled && !B.sheetIn[si]) { var e3 = new Error('sheet ' + m.y + ' did not arrive'); e3.reason = 'tiles'; throw e3; }
      if (!B.preset) {
        var ids = [], seen = {};
        var add = function (list) { for (var a = 0; a < (list || []).length; a++) { var ps = list[a]; for (var b = 0; b < ps.length; b++) for (var c = 0; c < ps[b].length; c++) { var r = ps[b][c]; if (!seen[r]) { seen[r] = 1; ids.push(r); } } } };
        add((sn.feats || []).map(function (x) { return x[2]; }));
        add(sn.blank);
        shipRings(B, ids);
      }
      return { y: sn.y, feats: sn.feats || [], blank: sn.blank || [], blankPrecision: sn.blankPrecision || null };
    }
    throw new Error('unknown question ' + m.op);
  }

  /* The worker's whole program: the job's own text and the message loop around it. */
  function workerSource() {
    return '"use strict";\nvar job = (' + histJob.toString() + ');\nvar S = {};\n' +
      'self.onmessage = function (e) {\n' +
      '  var m = e.data || {};\n' +
      '  var emit = function (part) { self.postMessage({ id: m.id, part: part }); };\n' +
      '  Promise.resolve().then(function () { return job(S, m, emit); }).then(function (v) {\n' +
      '    self.postMessage({ id: m.id, ok: true, value: v });\n' +
      '  }, function (err) {\n' +
      '    self.postMessage({ id: m.id, ok: false, reason: (err && err.reason) || "failed", message: String((err && err.message) || err) });\n' +
      '  });\n' +
      '};\n';
  }

  /* ── the page side ───────────────────────────────────────────────────────────────────────────
     make(deps) — one door. The app uses the single instance at the bottom; a check builds its own so
     its counts and its thread start from nothing.
       deps.spawn() -> a Worker-shaped object or null   (default: a Blob worker from workerSource())
       deps.win     -> where published bundles and the base URL are read (default: window)
       deps.fetchWithin -> { readWithin, clockFor } (default: window.IntMapFetchWithin — js/app-body.js) */
  function make(deps) {
    const D = deps || {};
    const W = D.win || ((typeof window !== 'undefined') ? window : {});
    const pageState = {};
    const counts = { opened: 0, worker: 0, page: 0, preset: 0, slices: 0, rows: 0, rings: 0,
      tiled: 0, indexes: 0, ranges: 0, rangeBytes: 0, chunks: 0, wholeFiles: 0, fellBack: 0 };
    const ringOf = (typeof WeakMap === 'function') ? new WeakMap() : null;   /* ring array → [global, index, pool length] */
    const globalOfObj = (typeof WeakMap === 'function') ? new WeakMap() : null;
    const entries = new Map();   /* global → { p, handle, mirror, preset } */
    const requested = new Set();

    let w = null, broken = false, seq = 0, epoch = 0;
    const jobs = new Map();
    function blobWorker() {
      if (typeof Worker !== 'function' || typeof Blob !== 'function' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
      const u = URL.createObjectURL(new Blob([workerSource()], { type: 'text/javascript' }));
      try { return new Worker(u); } finally { try { URL.revokeObjectURL(u); } catch (_) { /* nothing to revoke */ } }
    }
    function thread() {
      if (w || broken) return w;
      try { w = (typeof D.spawn === 'function' ? D.spawn : blobWorker)(); } catch (_) { w = null; }
      if (!w) { broken = true; return null; }
      const it = w;
      it.onmessage = (ev) => {
        const msg = (ev && ev.data) || {};
        const j = jobs.get(msg.id); if (!j) return;
        if (msg.part) { counts.slices++; try { ingest(msg.part); } catch (_) { /* a slice that cannot be kept is asked for again */ } return; }
        jobs.delete(msg.id);
        if (msg.ok) j.res(msg.value);
        else { const e = new Error(msg.message || 'failed'); e.reason = msg.reason; j.rej(e); }
      };
      /* a thread that dies does not take the bundles with it: every question in flight rejects, the
         next one is asked on the page (a different path, after an observed failure — the mirrors the
         page already holds are kept, so nothing drawn changes identity) */
      it.onerror = () => {
        broken = true; epoch++;
        if (w === it) { w = null; try { it.terminate(); } catch (_) { /* already gone */ } }
        jobs.forEach((j) => { try { const e = new Error('hist-bundles worker died'); e.reason = 'worker'; j.rej(e); } catch (_) { /* nobody listening */ } });
        jobs.clear();
      };
      it.onmessageerror = it.onerror;
      return w;
    }
    function onThread(m, transfer) {
      const it = thread(); if (!it) return null;
      const id = ++seq; m.id = id;
      const p = new Promise((res, rej) => { jobs.set(id, { res, rej }); });
      try { it.postMessage(m, transfer || []); } catch (e) { jobs.delete(id); return Promise.reject(e); }
      counts.worker++;
      return p;
    }
    function onPage(m) {
      counts.page++;
      try { return Promise.resolve(histJob(pageState, m, ingest)); } catch (e) { return Promise.reject(e); }
    }
    function ask(m, transfer) { m.slice = SLICE_POINTS; return onThread(m, transfer) || onPage(m); }
    /* ⚠ THE BYTES ARE READ HERE, UNDER THE APP'S ONE CLOCK, AND HANDED OVER WHOLE: js/fetch-deadline.js
       `readWithin` with js/proxy-fetch.js `clockFor` and the idle clock (the deadline bounds the longest
       silence, not the length of a 41 MB download), reached through window.IntMapFetchWithin because
       this is a classic script. The body stays bytes — nothing is decoded or parsed on this thread —
       and is TRANSFERRED to the Worker, so the hand-over copies nothing. */
    function readBytes(url) {
      const FW = D.fetchWithin || W.IntMapFetchWithin;
      if (!FW || typeof FW.readWithin !== 'function') { const e = new Error('no clocked reader for ' + url); e.reason = 'unsupported'; return Promise.reject(e); }
      return FW.readWithin(url, FW.clockFor(url), undefined, { idle: true, bytes: true }).then((r) => {
        if (!r || !r.ok) { const e = new Error('http ' + (r && r.status) + ' ' + url); e.reason = 'http'; throw e; }
        return r.bytes;
      });
    }

    /* ══ TILES (hist-vector-tiles) ══════════════════════════════════════════════════════════════════
       ⚠ THE NAME IS DERIVED, NOT LISTED: `data/<name>.js` is tiled as `data/hvt/<name>.idx.json` (the
       index) and the archive that index names beside it. The builder asks THIS function for the name,
       so the two cannot disagree (scripts/build-hist-tiles.mjs). */
    function tilesOf(file) { return /\.js$/.test(String(file)) ? String(file).replace(/([^/]+)\.js$/, 'hvt/$1.idx.json') : null; }
    /* (place-through-time) …and the box file beside it — the per-row boxes `contains` prefilters with, read only by
       that question (a travel never reads it). Named from the same record name, by the same rule, for the builder too. */
    function boxesOf(file) { return /\.js$/.test(String(file)) ? String(file).replace(/([^/]+)\.js$/, 'hvt/$1.box.json') : null; }
    function readText(url) {
      const FW = D.fetchWithin || W.IntMapFetchWithin;
      if (!FW || typeof FW.readWithin !== 'function') { const e = new Error('no clocked reader for ' + url); e.reason = 'unsupported'; return Promise.reject(e); }
      return FW.readWithin(url, FW.clockFor(url), undefined, { idle: true }).then((r) => {
        if (!r || !r.ok) { const e = new Error('http ' + (r && r.status) + ' ' + url); e.reason = 'http'; throw e; }
        return r.text;
      });
    }
    /* ⚠ ONE RANGE, UNDER THE SAME CLOCK. An archive is served `application/gzip` (a `.gz` name) because
       that is the type GitHub Pages sends WITHOUT a Content-Encoding: MEASURED 2026-10-01 against the
       live site, a Range on `application/javascript` or `application/octet-stream` came back as a range
       of the GZIPPED stream (`Content-Range: bytes 0-99/3961350` for the 12.96 MB data/cshapes.js) — an
       offset into bytes nobody can address — while `.gz` and `.png` came back as ranges of the file.
       A 206 must be exactly the bytes asked for; a 200 is a server that ignored the Range and sent the
       whole archive, which is still the archive. Anything else is not the archive. */
    function readRange(url, a, b, total) {
      const FW = D.fetchWithin || W.IntMapFetchWithin;
      if (!FW || typeof FW.readWithin !== 'function') { const e = new Error('no clocked reader for ' + url); e.reason = 'unsupported'; return Promise.reject(e); }
      return FW.readWithin(url, FW.clockFor(url), { headers: { Range: 'bytes=' + a + '-' + b } }, { idle: true, bytes: true }).then((r) => {
        const n = r && r.bytes ? r.bytes.byteLength : -1;
        if (r && r.status === 206 && n === b - a + 1) { counts.ranges++; counts.rangeBytes += n; return { base: a, bytes: r.bytes }; }
        if (r && r.status === 200 && n === total) { counts.ranges++; counts.rangeBytes += n; return { base: 0, bytes: r.bytes }; }
        const e = new Error('range ' + a + '-' + b + ' of ' + url + ' answered ' + (r && r.status) + ' with ' + n + ' bytes'); e.reason = 'tiles'; throw e;
      });
    }
    /* ⚠ GAP_BYTES — two needed chunks of one archive are read in ONE request when fewer than this many
       unneeded bytes lie between them: the request saved costs a round trip, the bytes read cost their
       transfer time. ESTIMATE, from Chrome's Fast 4G preset (150 ms RTT, 1.6 Mb/s ≈ 200 kB/s down): one
       round trip is worth ~30 kB of transfer. What it did to the first travel's request count is
       measured in dev-notes/2026-10-01-hist-vector-tiles.md. LAPSES if the builder re-cuts chunks
       (its CHUNK_BYTES) or the archive's order changes.
       PARALLEL — requests in flight per door: what HTTP/1.1 gives one origin (Chromium: 6). On HTTP/2
       (Pages) more would multiplex, but the instant is answered only when its last chunk arrives, so a
       wider fan-out changes the order bytes arrive in, not when the answer does. */
    const GAP_BYTES = 32 * 1024;
    const PARALLEL = 6;
    let running = 0;
    const waiting = [];
    function limited(fn) {
      return new Promise((res, rej) => {
        const go = () => { running++; Promise.resolve().then(fn).then(res, rej).finally(() => { running--; const n = waiting.shift(); if (n) n(); }); };
        if (running < PARALLEL) go(); else waiting.push(go);
      });
    }
    /* the chunks a question needs, read and handed to the thread. A chunk another question is already
       reading is waited for, not read twice. */
    function fetchNeed(e, list) {
      const wait = [], todo = new Map();
      for (const it of list || []) {
        const p = e.inflight.get(it[0]);
        if (p) { wait.push(p); continue; }
        if (!todo.has(it[1])) todo.set(it[1], []);
        todo.get(it[1]).push(it);
      }
      const runs = [];
      for (const [pi, items] of todo) {
        items.sort((x, y) => x[2] - y[2]);
        let cur = null;
        for (const it of items) {
          if (cur && it[2] - cur.end <= GAP_BYTES) { cur.items.push(it); cur.end = it[2] + it[3]; }
          else { cur = { pi, start: it[2], end: it[2] + it[3], items: [it] }; runs.push(cur); }
        }
      }
      const reads = runs.map((run) => {
        const dir = e.tiles[run.pi], url = e.archives[run.pi];
        const pr = limited(() => readRange(url, run.start, run.end - 1, dir.archive.bytes)).then(({ base, bytes }) => {
          const parts = run.items.map((it) => ({ c: it[0], bytes: bytes.slice(it[2] - base, it[2] - base + it[3]) }));
          counts.chunks += parts.length;
          return ask({ op: 'feed', global: e.global, parts }, parts.map((x) => x.bytes));
        });
        for (const it of run.items) e.inflight.set(it[0], pr);
        const clear = () => { for (const it of run.items) if (e.inflight.get(it[0]) === pr) e.inflight.delete(it[0]); };
        pr.then(clear, clear);
        return pr;
      });
      return Promise.all(wait.concat(reads));
    }
    const validIndex = (d, global) => !!(d && d.hvt === 1 && d.global === global && d.head && Array.isArray(d.span) && Array.isArray(d.chunks) && d.archive);

    /* the page's copy, filled as slices arrive. ⚠ AN ENTRY ALREADY HELD IS NEVER REPLACED: the
       geometry memos and the line records downstream key on the ring and row OBJECTS, so a second copy
       of the same ring would be a second identity for one boundary. */
    function ingest(part) {
      const e = entries.get(part.global); if (!e || !e.mirror || e.preset) return;
      const M = e.mirror, pools = M.gapPools || [];
      const own = pools.reduce((n, g) => (g ? Math.min(n, g.off) : n), M.rings.length);
      for (const [ri, ring] of part.rings || []) {
        if (M.rings[ri] !== undefined) continue;
        M.rings[ri] = ring; counts.rings++;
        /* the bundle's OWN pool length: a spliced gap record's rings sit past it and are its own */
        let owner = [part.global, ri, own];
        for (const g of pools) if (g && ri >= g.off && ri < g.off + g.nRings) { g.view.rings[ri - g.off] = ring; owner = [g.global, ri - g.off, g.nRings]; break; }
        if (ringOf) ringOf.set(ring, owner);
      }
      for (const [i, row] of part.feats || []) {
        if (M.feats[i] !== undefined) continue;
        M.feats[i] = row; counts.rows++;
        if (row[12] != null && row[11] != null && pools[row[12]]) {
          const g = pools[row[12]];
          g.view.feats[row[11]] = [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7],
            (row[8] || []).map((poly) => poly.map((ri) => ri - g.off)), row[9]];
        }
      }
      if (M.dates) for (const [k, v] of part.dates || []) if (M.dates[k] === undefined) M.dates[k] = v;
    }
    function mirrorOf(global, h) {
      const M = Object.assign({}, h);
      delete M.nRings; delete M.nFeats; delete M.hasDates;
      M.rings = new Array(h.nRings);
      M.feats = new Array(h.nFeats);
      if (h.hasDates) M.dates = {};
      if (Array.isArray(h.gapPools)) M.gapPools = h.gapPools.map((g) => {
        if (!g) return null;
        const view = { rings: new Array(g.nRings), feats: new Array(g.nFeats), precision: g.precision };
        if (globalOfObj) globalOfObj.set(view, g.global);
        return Object.assign({}, g, { view });
      });
      if (globalOfObj) globalOfObj.set(M, global);
      return M;
    }
    const abs = (file) => { try { return new URL(String(file), (W.IM_HOST && W.IM_HOST.base) || (W.document && W.document.baseURI) || undefined).toString(); } catch (_) { return String(file); } };

    /* `open({file, global, gaps?})` → Promise<handle|null>. One per bundle, shared by every caller. */
    function open(spec) {
      const global = spec.global;
      const e0 = entries.get(global);
      if (e0) return e0.p;
      const e = { p: null, handle: null, mirror: null, preset: false, epoch: -1, global, mode: null, tiles: null, archives: null, inflight: new Map() };
      entries.set(global, e);
      const gaps = (spec.gaps || []).map((g) => ({ url: abs(g.file), file: g.file, global: g.global }));
      /* the record as tiles: its index and every gap record's, ALL of them or none — a record whose gap
         could not be tiled is opened whole, so the splice is the same splice either way */
      const openTiles = () => {
        const ix = tilesOf(spec.file);
        if (!ix || gaps.some((g) => !tilesOf(g.file))) return Promise.resolve(false);
        const urls = [abs(ix), ...gaps.map((g) => abs(tilesOf(g.file)))];
        return Promise.all(urls.map((u) => readText(u).then((t) => JSON.parse(t)))).then((dirs) => {
          counts.indexes += dirs.length;
          if (!dirs.every((d, i) => validIndex(d, i ? gaps[i - 1].global : global))) return false;
          e.tiles = dirs;
          /* the archive sits beside its index (a relative base — the node harnesses — is not a URL) */
          e.archives = dirs.map((d, i) => String(urls[i]).replace(/[^/]*$/, String(d.archive.file)));
          return ask({ op: 'openTiled', global, dirs }).then((h) => {
            if (!e.mirror) e.mirror = mirrorOf(global, h);
            e.mode = 'tiled'; e.epoch = epoch; counts.opened++; counts.tiled++;
            return true;
          });
        });
      };
      const openWhole = () => {
        e.mode = 'whole'; counts.wholeFiles++;
        /* a gap record that cannot be read is left out (the splice records null for it), as the old
           loader did; the record itself failing fails the open */
        return Promise.all([readBytes(abs(spec.file)), ...gaps.map((g) => readBytes(g.url).catch(() => null))]).then(([bytes, ...gb]) => {
          const gs = gaps.map((g, i) => ({ global: g.global, bytes: gb[i] }));
          return ask({ op: 'open', global, bytes, gaps: gs }, [bytes, ...gb].filter(Boolean));
        }).then((h) => {
          if (!e.mirror) e.mirror = mirrorOf(global, h);
          e.epoch = epoch; counts.opened++;
          return true;
        });
      };
      /* (place-through-time) the record's box file and each gap record's, in splice order — read under the same clock */
      const readBoxes = () => Promise.all([spec.file, ...gaps.map((g) => g.file)].map((f) => readText(abs(boxesOf(f))).then((t) => JSON.parse(t))));
      /* «nothing was observed» (the clock ran out, the caller stopped, the thread died) is not a refusal:
         it fails or re-asks as before. A refusal — no index on this server (`npm run dev` serves the
         repository, where the build has not cut any), an index for another record, bytes that are not
         the chunk — is an observed failure, and the whole file is the different thing to try
         (.agents/rules/one-pass-or-a-reason.md §5). */
      const unobserved = (err) => !!(err && (err.reason === 'timeout' || err.reason === 'aborted' || err.reason === 'worker'));
      const doOpen = () => {
        /* already published on `window` (the node harnesses; nothing on the page does it any more):
           read it where it is — no fetch, no copy, the mirror IS the bundle */
        if (W[global] && typeof W[global] === 'object') {
          e.preset = true; counts.preset++;
          return onPage({ op: 'adopt', global, value: W[global] }).then(() => { e.epoch = epoch; e.mirror = W[global]; return true; });
        }
        requested.add(global);
        e.inflight = new Map();
        if (e.mode === 'whole') return openWhole();
        return openTiles().then((ok) => (ok ? true : openWhole()), (err) => {
          if (unobserved(err)) throw err;
          counts.fellBack++;
          return openWhole();
        });
      };
      /* a question after the thread died re-opens the bundle on whatever answers now, into the SAME
         mirror (so nothing already drawn changes identity) */
      const call = (m) => {
        /* a tiled record first says which chunks the question reads, is handed them, then answers —
           `edges` reads only the index, so it is asked at once */
        const go = () => {
          if (e.preset) return onPage(m);
          if (e.mode !== 'tiled' || m.op === 'edges') return ask(m);
          /* (place-through-time) `contains` needs the box files before it can say which chunks it reads; they are
             read once per opening (a thread that died is handed them again — `e.boxed` is per epoch) */
          const boxed = (m.op === 'contains' && e.boxed !== epoch) ? readBoxes(e).then((files) => ask({ op: 'boxes', global, files })).then(() => { e.boxed = epoch; }) : Promise.resolve();
          return boxed.then(() => ask({ op: 'need', global, q: { op: m.op, t: m.t, end: m.end, t0: m.t0, t1: m.t1, y: m.y, lng: m.lng, lat: m.lat } }))
            .then((list) => fetchNeed(e, list)).then(() => ask(m));
        };
        const retry = (err) => {
          if (err && err.reason === 'worker') { e.epoch = -1; return call(m); }
          if (e.mode === 'tiled' && !unobserved(err)) { counts.fellBack++; e.mode = 'whole'; e.epoch = -1; return call(m); }
          throw err;
        };
        if (e.preset || e.epoch === epoch) return go().catch(retry);
        return doOpen().then(go);
      };
      e.handle = {
        global,
        get data() { return e.mirror; },
        edges: (end, lo, hi) => call({ op: 'edges', global, end, lo, hi }),
        at: (t, end) => call({ op: 'at', global, t, end }),
        during: (t0, t1) => call({ op: 'during', global, t0, t1 }),
        /* (place-through-time) every row of all time, and every era-sheet polygon, that holds [lng, lat] — what each
           says, not its geometry (see the job). Asked of the thread that holds every row; nothing lands on the mirror. */
        contains: (lng, lat) => call({ op: 'contains', global, lng, lat }),
        snap: (y) => call({ op: 'snap', global, y }).then((s) => {
          if (!s) return null;
          /* the sheet's rows are small and are not pooled, so they travel with the answer; the rings they
             name are in the mirror now. Kept on the mirror's own sheet so `data.snaps` reads as before. */
          const M = e.mirror, sh = (M.snaps || []).find((x) => x.y === s.y);
          if (sh && !e.preset && !sh.feats) { sh.feats = s.feats; sh.blank = s.blank; sh.blankPrecision = s.blankPrecision; }
          return sh || s;
        }),
      };
      e.p = doOpen().then(() => e.handle, () => { if (entries.get(global) === e) entries.delete(global); return null; });
      return e.p;
    }

    return {
      open,
      /* which bundle a mirror (or a gap record's view) stands for — js/border-coast.js keys its
         detail index by that name, and a mirror is not `window[name]` */
      globalOf: (obj) => {
        try { if (globalOfObj && obj && globalOfObj.has(obj)) return globalOfObj.get(obj); } catch (_) { /* not an object */ }
        for (const [g, e] of entries) if (e.mirror === obj) return g;
        return null;
      },
      /* [bundle global, ring index in that bundle's own file, that pool's length] for a ring the page
         received, or null — js/border-coast.js marks a collection's rings by it */
      ringOrigin: (ring) => { try { return (ringOf && ringOf.get(ring)) || null; } catch (_) { return null; } },
      loaded: (global) => { const e = entries.get(global); return !!(e && e.mirror); },
      requested: (global) => requested.has(global) || !!(entries.get(global) && entries.get(global).preset),
      /* 'tiled' | 'whole' | 'preset' | null — how a record is being read, for a check and the console */
      mode: (global) => { const e = entries.get(global); return e ? (e.preset ? 'preset' : e.mode) : null; },
      tilesOf,
      boxesOf,
      /* what this door has done, for a check and for the console — never a decision input. `inFlight` is
       questions on the thread, `reading` the Range reads under way or queued: between the two a tiled
       question is busy while NEITHER thread has a job, so an observer that waits for quiet reads both */
      counts: () => Object.assign({ thread: !!w, broken, inFlight: jobs.size, reading: running + waiting.length }, counts),
      workerSource,
      histJob,
      SLICE_POINTS,
      make,
    };
  }
  return make({});
})();
