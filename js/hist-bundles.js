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
      h.nRings = Array.isArray(d.rings) ? d.rings.length : 0;
      h.nFeats = Array.isArray(d.feats) ? d.feats.length : 0;
      h.hasDates = !!d.dates;
      if (Array.isArray(d.snaps)) h.snaps = d.snaps.map(function (s) {
        var o = {}, j; for (j in s) if (j !== 'feats' && j !== 'blank' && j !== 'blankPrecision') o[j] = s[j]; return o;
      });
      return h;
    }
    function hold(global, d, preset) {
      S[global] = { d: d, preset: !!preset, sentF: new Uint8Array(Array.isArray(d.feats) ? d.feats.length : 0),
        sentR: new Uint8Array(Array.isArray(d.rings) ? d.rings.length : 0) };
      return head(d);
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
            d.gapPools.push({ global: g.global, off: off, nRings: X.rings.length, nFeats: X.feats.length, gi: gi, precision: X.precision || null });
          } else d.gapPools.push(null);
        }, function () { d.gapPools.push(null); }).then(next);
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
      if (S[m.global]) return head(S[m.global].d);
      return Promise.resolve().then(function () { return parse(m.bytes, m.global); }).then(function (d) {
        if (!d || typeof d !== 'object') throw new Error('empty bundle ' + m.global);
        return (m.gaps && m.gaps.length && Array.isArray(d.feats)) ? splice(d, m.gaps) : d;
      }).then(function (d) { return hold(m.global, d, false); });
    }
    var B = S[m.global];
    if (!B) { var e = new Error('not open: ' + m.global); e.reason = 'closed'; throw e; }
    var d = B.d, out = [], i, f;
    if (m.op === 'edges') {
      /* every instant on which the record changes: a START, and an END — the end itself where the
         record's end is exclusive (OpenHistoricalMap), the day after it where it is inclusive
         (CShapes). Both edges, because a unit that vanishes with no successor still ends an epoch. */
      var set = new Set();
      for (i = 0; i < d.feats.length; i++) { f = d.feats[i];
        set.add(ymd(f[2], f[3], f[4]));
        set.add(m.end === 'inclusive' ? dayAfter(f[5], f[6], f[7]) : ymd(f[5], f[6], f[7])); }
      set.forEach(function (k) { if (k >= m.lo && k <= m.hi) out.push(k); });
      return out.sort(function (a, b) { return a - b; });
    }
    if (m.op === 'at') {
      /* in force ON that date: started at or before it and not yet ended — `s <= t <= e` for an
         inclusive end, `s <= t < e` for an exclusive one. The record's own order is kept. */
      var t = m.t, incl = (m.end === 'inclusive');
      for (i = 0; i < d.feats.length; i++) { f = d.feats[i];
        if (ymd(f[2], f[3], f[4]) > t) continue;
        var e2 = ymd(f[5], f[6], f[7]);
        if (incl ? (e2 < t) : (e2 <= t)) continue;
        out.push(i); }
      ship(B, out);
      return out;
    }
    if (m.op === 'during') {
      /* in force at SOME instant of [t0, t1] (inclusive end — the one caller reads CShapes) */
      for (i = 0; i < d.feats.length; i++) { f = d.feats[i];
        if (ymd(f[2], f[3], f[4]) > m.t1 || ymd(f[5], f[6], f[7]) < m.t0) continue;
        out.push(i); }
      ship(B, out);
      return out;
    }
    if (m.op === 'snap') {
      var sn = null;
      for (i = 0; i < (d.snaps || []).length; i++) if (d.snaps[i].y === m.y) { sn = d.snaps[i]; break; }
      if (!sn) return null;
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
    const counts = { opened: 0, worker: 0, page: 0, preset: 0, slices: 0, rows: 0, rings: 0 };
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
      const e = { p: null, handle: null, mirror: null, preset: false, epoch: -1 };
      entries.set(global, e);
      const gaps = (spec.gaps || []).map((g) => ({ url: abs(g.file), global: g.global }));
      const doOpen = () => {
        /* already published on `window` (the node harnesses; nothing on the page does it any more):
           read it where it is — no fetch, no copy, the mirror IS the bundle */
        if (W[global] && typeof W[global] === 'object') {
          e.preset = true; counts.preset++;
          return onPage({ op: 'adopt', global, value: W[global] }).then(() => { e.epoch = epoch; e.mirror = W[global]; return true; });
        }
        requested.add(global);
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
      /* a question after the thread died re-opens the bundle on whatever answers now, into the SAME
         mirror (so nothing already drawn changes identity) */
      const call = (m) => {
        const go = () => (e.preset ? onPage(m) : ask(m));
        if (e.preset || e.epoch === epoch) return go().catch((err) => {
          if (err && err.reason === 'worker') { e.epoch = -1; return call(m); }
          throw err;
        });
        return doOpen().then(go);
      };
      e.handle = {
        global,
        get data() { return e.mirror; },
        edges: (end, lo, hi) => call({ op: 'edges', global, end, lo, hi }),
        at: (t, end) => call({ op: 'at', global, t, end }),
        during: (t0, t1) => call({ op: 'during', global, t0, t1 }),
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
      /* what this door has done, for a check and for the console — never a decision input */
      counts: () => Object.assign({ thread: !!w, broken, inFlight: jobs.size }, counts),
      workerSource,
      histJob,
      SLICE_POINTS,
      make,
    };
  }
  return make({});
})();
