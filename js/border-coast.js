/* ============================================================================
 *  IntMap · WHICH EDGES OF A HISTORICAL OUTLINE ARE BORDER — the reader   (#R564)
 * ----------------------------------------------------------------------------
 *  data/border-coast.js (built by scripts/build-border-coast.mjs, #R531) marks, for every pooled
 *  ring of every bundled historical record, which of its edges are a boundary between polities and
 *  which are that record's own copy of the COASTLINE — the copy the planet knows better, and which
 *  js/coast-line.js already draws from live tiles in the same colour and the same width.
 *
 *  ⚠ THIS FILE EXISTS BECAUSE THE READING WAS ABOUT TO BE WRITTEN TWICE. #R531 put the loader, the
 *  mark lookup and the ring→LineString slicer inside js/time-borders.js, where the country record is
 *  drawn. #R564 has to do exactly the same thing to the SUBDIVISION record (js/time-admin1.js), which
 *  had gone on stroking whole rings and drawing a second, wrong shore a few kilometres out to sea for
 *  every coastal province. Copying six functions across would have put one fact — «how a mark is read»
 *  — in two places, which is what AGENTS.md §3.9 forbids and what #R488 measured the cost of. So the
 *  reading moves HERE and both time modules call it. Nothing about the rule or the constant changed;
 *  those live in scripts/build-border-coast.mjs, which is where they were measured.
 *
 *  ⚠ IT IS OPTIONAL, AND THAT IS LOAD-BEARING. Without the marks every ring is stroked whole — the
 *  picture before #R531, and still the picture for the aourednik fallback, which is fetched from
 *  GitHub at the moment it is drawn and so has no build step to mark it in. `ringLines(ring, null)`
 *  therefore returns the whole ring rather than nothing: a record nobody has measured is drawn as it
 *  always was, not deleted.
 *
 *  ⚠ THE CLOSED RING IS THE INDEX. data/cshapes.js repeats a ring's first point and the other bundles
 *  do not, so a run [a,b] is read off the ring CLOSED — the same walk the marks were measured on.
 *  Reading it off the raw ring would slide every run by one on one of the records.
 * ==========================================================================*/
import { IntMapTime } from './chronos.js';
import { IntMapGeoEngine } from './geo-engine.js';

/* ══ (hist-coverage-depth) THE RECORDS THE FIRST SUBDIVISION TIER SPLICES IN BESIDE OPENHISTORICALMAP ══
   ⚠ ONE LIST, READ BY EVERY READER. js/time-admin1.js draws these rows, scripts/hist-fidelity.mjs
   measures them, scripts/build-hist-admin-fill.mjs and scripts/build-hist-admin-surveys.mjs yield to
   the ones that are records, and scripts/build-border-detail.mjs builds the zoomed-in detail of the
   surveyed ones. Before (hist-coverage-depth) the list was written in js/time-admin1.js and a regex in
   scripts/hist-fidelity.mjs held a second copy of it; a third record would have been drawn and not
   measured, or measured and not drawn (.agents/rules/no-ad-hoc-hardcoding.md §1 — the same judgement
   in two places).
   ⚠ IT LIVES HERE, NOT IN A FILE OF ITS OWN: this module already owns each record's `set` key (the
   marks below are read by it) and is already on the boot path, so a separate module was one more
   eager module for one array (check:perf eager.modules, measured 314 > 313).
   Each entry carries what differs between them:
     set      the key data/border-coast.js marks this file's rings under
     derived  true  — IntMap assembled the row itself (a present-day outline carried back, a raster
                      vectorised); the reader is told so, and a record that is not derived outranks it
              false — the row is a dated record a publisher surveyed; it is a record in its own right
                      and only lacks an OpenHistoricalMap relation (so the tiles cannot draw its line)
     nonCommercial  the record carries sources licensed for non-commercial use only (share-alike, so
                    the file itself is under that licence) — kept apart from the open record exactly as
                    data/cshapes.js keeps CShapes apart; scripts/build-hist-admin-surveys.mjs sorts the
                    publishers into the two by their own licence
     reconstructed  IntMap assembled the row from cited facts as a union of finer units (scripts/build-hist-admin-recon.mjs,
                    docs/HIST-RECONSTRUCTION.md) — derived (the reader is told), but a cited timeline: it yields to every
                    record that is not derived and outranks the present-day outline carried back
     withheld       (with reconstructed) build-time data — the ground and windows the dossiers researched and could not
                    settle (`unresolved`), written to the reconstruction's cache by its builder (scripts/histrecon/withheld-file.mjs). It is never drawn, but the present-day outline carried back yields to it as to a
                    drawn row: research that says «the line here is not known» must not be answered by today's line */
export const HIST_ADMIN_GAPS = [
  { file: 'data/hist-kuni.js',             global: '__HISTKUNI',        set: 'hk',              derived: true },
  { file: 'data/hist-admin-surveys.js',    global: '__HISTADMSURVEY',   set: 'histadmsurvey',   derived: false },
  { file: 'data/hist-admin-surveys-nc.js', global: '__HISTADMSURVEYNC', set: 'histadmsurveync', derived: false, nonCommercial: true },
  { file: 'data/hist-admin-fill.js',       global: '__HISTADMFILL',     set: 'histadmfill',     derived: true },
  { file: 'data/hist-admin-recon.js',      global: '__HISTADMRECON',    set: 'histadmrecon',    derived: true, reconstructed: true, withheld: true },
];
export const IntMapBorderCoast = (function () {
  let _D = null, _P = null;
  const _arrived = [];

  /* ⚠ DROP THE PROMISE ON FAILURE. Keeping a resolved-null promise would make one lost request
     permanent for the session — and because both callers MEMOISE the line geometry they derive from
     these marks, the map would then be pinned to the whole-ring drawing until a reload. Telling the
     callers when a late copy arrives is the other half of the same point. */
  function load() {
    if (_D) return Promise.resolve(_D);
    if (_P) return _P;
    _P = new Promise((res) => {
      if (window.__IMBCOAST) { _D = window.__IMBCOAST; res(_D); return; }
      const s = document.createElement('script'); s.src = 'data/border-coast.js'; s.async = true;
      s.onload = () => {
        _D = window.__IMBCOAST || null;
        if (_D) for (const cb of _arrived) { try { cb(); } catch (_) {} }
        res(_D);
      };
      s.onerror = () => { _P = null; res(null); };
      document.head.appendChild(s);
    });
    return _P;
  }

  /* called when a late copy of the marks lands, so a caller can throw away geometry it derived
     without them */
  function onArrive(cb) { if (typeof cb === 'function') _arrived.push(cb); }

  /* (hist-border-refine) the river and wall courses a coarse line is redrawn along — read by js/hist-courses.js,
     which is imported only when a Cliopatria line is first drawn (it is not on the boot path) */
  let _HC = null, _HCP = null;
  const loadCourses = () => _HCP || (_HCP = import('./hist-courses.js').then((m) => m.open(window, globalThis.document))
    .then((h) => { if (h) { _HC = h; _arrived.forEach((cb) => { try { cb(); } catch (_) {} }); } else _HCP = null; return h; }, () => (_HCP = null)));

  function marks(set) { try { return (_D && _D.sets && _D.sets[set] && _D.sets[set].draw) || null; } catch (_) { return null; } }

  const closedRing = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };

  /* the border runs of ONE ring, as LineString coordinate arrays */
  function ringLines(ring, mark, subs) {
    const V = closedRing(ring);
    if (mark === 0) return [];
    if (subs) return _HC.runs(V, mark, subs);
    if (mark === 1 || !Array.isArray(mark)) return [V];
    const out = [];
    for (const run of mark) { const seg = V.slice(run[0], run[1] + 1); if (seg.length > 1) out.push(seg); }
    return out;
  }

  /* one bundled feature's border runs. `d` is any of the ring-pooled bundles — they all carry
     `rings` and `feats[i][8] = [[ringIdx…]…]`, which is why one reader serves all of them. */
  function lineGeom(d, idx, marksArr, allowDetail = true) {
    const detail = allowDetail ? detailLine(d, idx) : undefined;
    if (detail !== undefined) return detail;
    const lines = [];
    for (const poly of d.feats[idx][8]) for (const ri of poly) {
      for (const l of ringLines(d.rings[ri], marksArr ? marksArr[ri] : 1)) lines.push(l);
    }
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }

  /* ⚠⚠⚠ (#R695) A MARK BELONGS TO A RING, AND A RING CAN BE RECOGNISED WITHOUT BEING ASKED FOR BY
     KEY. The two callers above hand over a bundle and a ring INDEX, which is why they have to know
     their set's key ('cs', 'hb', …). The era tier does not: js/time-borders.js builds a
     FeatureCollection out of data/hist-eras.js's pooled rings and hands the COLLECTION here — and
     so, before this round, the whole band from 123,000 BC to 1688 was stroked whole, every
     record's copy of the coastline drawn as a boundary. Measured on the 1500 snapshot: 384,167 of
     1,116,501 km of line (34.4%) is that copy.
     The rings in that collection are THE SAME ARRAY OBJECTS the bundle pooled, so they can be
     looked up by identity — and which global holds which pool is not written here either: every
     entry of data/border-coast.js names the window property its bundle assigns (`global`), so this
     index is built from the marks themselves and a seventh bundle needs no line of code here.
     A ring nobody has marked is still stroked whole — the aourednik runtime fallback, which is
     fetched from GitHub when a year the bundle lacks is asked for, is not measured by any build. */
  const _byRing = (typeof Map === 'function') ? new Map() : null;
  const _indexed = {};
  function _index() {
    if (!_D || !_byRing || !_D.sets) return;
    for (const k in _D.sets) {
      const s = _D.sets[k];
      if (!s || !s.global || _indexed[s.global]) continue;
      const b = window[s.global];
      /* not loaded yet — try again on the next collection, because the bundle and the marks are two
         separate requests and either can win */
      if (!b || !Array.isArray(b.rings) || !Array.isArray(s.draw)) continue;
      /* ⚠ the marks are indexed BY POSITION, so a pool of a different length is a different pool
         (a rebuilt bundle beside a stale marks file). Index nothing rather than index it wrong. */
      if (b.rings.length !== s.rings || s.draw.length !== s.rings) { _indexed[s.global] = 1; continue; }
      for (let i = 0; i < b.rings.length; i++) _byRing.set(b.rings[i], s.draw[i]);
      _indexed[s.global] = 1;
    }
  }
  /* ⚠ (hist-bundles-off-main) …AND A RING THE PAGE WAS HANDED BY js/hist-bundles.js IS NOT ON `window`.
     The bundles are parsed on another thread now and the page holds a sparse mirror of each, so the
     identity index above (which walks `window[global].rings` whole) would see nothing. The door
     records, for every ring it hands the page, which bundle it belongs to and its index there — the
     same position the marks are addressed by — and the same length check guards it: a pool of a
     different length is a different pool. */
  const _HB = () => window.IntMapHistBundles;
  function _setOf(global) {
    if (!_D || !_D.sets) return null;
    for (const k in _D.sets) { const s = _D.sets[k]; if (s && s.global === global) return s; }
    return null;
  }
  function markOf(ring) {
    let o = null; try { o = _HB() ? _HB().ringOrigin(ring) : null; } catch (_) { o = null; }
    if (o) {
      const s = _setOf(o[0]);
      return (s && Array.isArray(s.draw) && s.rings === o[2] && s.draw.length === s.rings) ? s.draw[o[1]] : 1;
    }
    _index(); return (_byRing && _byRing.has(ring)) ? _byRing.get(ring) : 1;
  }

  /* a collection handed over whole: each ring stroked whole unless the marks know it, in which case
     it is stroked the way the marks say — the outline drawn before #R531 for everything nobody has
     measured, and the measured answer for everything that has been. */
  function wholeLines(fc, t = null) {
    /* ⚠ the marks may not have been asked for yet on this path (the era tier awaits the bundle, not
       these), so ask now: a caller that memoizes what it gets back keeps the whole-ring drawing
       until it rebuilds, and one request started here is what makes that a first frame instead of a
       session. */
    if (!_D) { try { load(); } catch (_) {} }
    if (!_HC) loadCourses();
    const feats = [];
    for (const f of ((fc && fc.features) || [])) {
      const g = f.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : null);
      if (!polys) continue;
      const lines = [];
      for (const p of polys) for (const r of p) if (r && r.length > 1) for (const l of ringLines(r, markOf(r), _HC && _HC.of(r, t))) lines.push(l);
      if (lines.length) feats.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: Object.assign({}, f.properties) });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  /* ══ (hist-border-same-look) A SHARED EDGE IS ONE STROKE, NOT ONE PER NEIGHBOUR ══════════════════════
     「地方区分線も違う」(2026-10-06). Every bundled record is a set of POLYGONS, and every line above is
     cut from a polygon's own ring — so the edge two neighbours share is cut twice, once from each (more
     where two records hold the same unit). Measured on production at 2015-06-15, central Romania, z7.6: of the
     `imta-gap-line` segments on screen 234 were drawn twice, 75 three times, 2 four times (1,057
     segments, 13 features). Two semi-transparent dashed strokes on one path do not look like one: the
     opacity compounds (0.82 → 0.97, paler), and the dashes start at different ends so they interleave
     into longer, near-solid dashes that read as a thicker line. Today's `ref-admin1` / `borders-only-line`
     stroke each boundary ONCE (OpenMapTiles' boundary layer is a line layer), so the era line looked
     different with identical paint. This keeps the first stroke of every undirected segment and drops
     the rest, splitting a line where a dropped stretch was — the picture is the same path, struck once.
     ⚠ Exact coordinates, not a tolerance: only an edge two rings genuinely share is merged; a neighbour
     whose copy of the boundary was digitised differently is a different line and stays drawn.
     ⚠ Memoised on the collection it is handed (callers already memoise that collection per date), so
     a redraw of the same instant does not re-walk the world. */
  const _once = new WeakMap();
  function strokedOnce(fc) {
    if (!fc || !fc.features) return fc;
    const hit = _once.get(fc); if (hit) return hit;
    /* a vertex is named by its position on a 1e-5° grid (~1 m — every bundle is written at 5 decimals or
       coarser, so this is the exact coordinate as stored) packed into one number, then by a small integer;
       an edge is the pair of integers as one number, so no string is built per edge. Measured on the
       shipped data/cshapes.js + data/border-coast.js at 1950-07-01 (Node 24, this machine): the 172
       countries' border runs are 52,322 segments, 24,728 of them (47 %) a neighbour's second copy, and
       the walk takes 8–26 ms (the string-per-edge version of the same walk on whole rings: ~380 ms). */
    const seen = new Set(), feats = [], ids = new Map();
    const id = (p) => { const k = Math.round((p[0] + 360) * 1e5) * 67108864 + Math.round((p[1] + 90) * 1e5); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
    const key = (a, b) => { const p = id(a), q = id(b); return p < q ? p * 67108864 + q : q * 67108864 + p; };
    for (const f of fc.features) {
      const g = f && f.geometry; if (!g) continue;
      const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : null;
      if (!lines) { feats.push(f); continue; }
      const out = [];
      for (const c of lines) {
        let run = null;
        for (let i = 0; i + 1 < (c ? c.length : 0); i++) {
          const k = key(c[i], c[i + 1]);
          if (c[i][0] === c[i + 1][0] && c[i][1] === c[i + 1][1]) continue;
          if (seen.has(k)) { if (run) { out.push(run); run = null; } continue; }
          seen.add(k);
          if (!run) run = [c[i]];
          run.push(c[i + 1]);
        }
        if (run) out.push(run);
      }
      if (out.length) feats.push({ type: 'Feature', geometry: out.length === 1 ? { type: 'LineString', coordinates: out[0] } : { type: 'MultiLineString', coordinates: out }, properties: f.properties || {} });
    }
    const v = { type: 'FeatureCollection', features: feats };
    _once.set(fc, v); return v;
  }

  /* R711: detailed OHM lines are built from the same cached source as the bundle.
     The bundle still owns identity, dates, polygons and labels. Only source-reproducible
     outlines get detail, and their geometry fingerprint must still match at read time.
     At z8, 0.004 degrees spans 1.46 pixels on a 512 px world tile (more in Mercator
     latitude); this is where the fallback's build error becomes visibly multi-pixel.
     Fetches are same-origin, viewport-limited, four at a time, with bounded LRU memory. */
  function geometryKey(polys) {
    const s = JSON.stringify(polys); let a = 2166136261, b = 5381;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b, 33) ^ c; }
    return (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16) + '-' + s.length;
  }
  let detailIndex = null, indexPromise = null, listening = false, running = 0, cacheBytes = 0, detailDirty = false;
  let viewMemo, moving = false, usedDetail = false;
  const detailCache = new Map(), pending = new Set(), queue = [], attempted = new Set();
  const fingerprints = new WeakMap(), boxes = new WeakMap();
  let notifyTimer = null;
  function detailArrived() {
    if (notifyTimer !== null) return;
    notifyTimer = setTimeout(() => { notifyTimer = null; for (const cb of _arrived) { try { cb(); } catch (_) {} } }, 80);
  }
  function detailView() {
    if (moving) return null;
    if (viewMemo !== undefined) return viewMemo;
    try {
      const e = IntMapGeoEngine;
      if (!e || e.camera.getZoom() < 8) return (viewMemo = null);
      const b = e.camera.getBounds(); if (!b) return (viewMemo = null);
      return (viewMemo = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    } catch (_) { return (viewMemo = null); }
  }
  function overlaps(b, view) {
    if (b[3] < view[1] || b[1] > view[3]) return false;
    for (const shift of [-360, 0, 360]) if (b[2] + shift >= view[0] && b[0] + shift <= view[2]) return true;
    return false;
  }
  function detailInView(d, idx, view) {
    let byIndex = boxes.get(d); if (!byIndex) { byIndex = new Map(); boxes.set(d, byIndex); }
    let b = byIndex.get(idx);
    if (!b) {
      b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of d.feats[idx][8]) for (const ri of p) for (const c of d.rings[ri]) {
        b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]); b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
      }
      byIndex.set(idx, b);
    }
    return overlaps(b,view);
  }
  function pumpDetail() {
    while (running < 4 && queue.length) {
      const path = queue.shift(); running++;
      detailJSON(path).then(data => {
        if (!data || !data.lines) return;
        const bytes = JSON.stringify(data).length * 2;
        detailCache.set(path, { data, bytes }); cacheBytes += bytes;
        while (cacheBytes > 32 * 1024 * 1024 && detailCache.size > 1) {
          const old = detailCache.keys().next().value; cacheBytes -= detailCache.get(old).bytes; detailCache.delete(old);
        }
        detailDirty = true;
      }).catch(() => {}).finally(() => {
        pending.delete(path); running--; pumpDetail();
        if (!running && !queue.length && detailDirty) { detailDirty = false; detailArrived(); }
      });
    }
  }
  function detailJSON(path) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 20000) : null;
    return Promise.resolve().then(() => fetch('data/border-detail/' + path, controller ? { signal: controller.signal } : undefined))
      .then(r => r.ok ? r.json() : null).finally(() => { if (timeout !== null) clearTimeout(timeout); });
  }
  /* the bundle's name: a mirror handed out by js/hist-bundles.js says it through the door, a bundle a
     harness published on `window` by being that property */
  function globalOfBundle(d) {
    let named = null;
    try { named = _HB() ? _HB().globalOf(d) : null; } catch (_) { named = null; }
    for (const s of Object.values((_D && _D.sets) || {})) if (window[s.global] === d || (named && named === s.global)) return s.global;
    return null;
  }
  /* (border-provenance) WHAT THE ZOOMED LINE OF ONE ROW IS DRAWN FROM — the same index, entry and fingerprint
     `detailLine` reads, asked without drawing anything and without fetching: the 5 MB index is read only by a
     zoomed view (`detailLine`), so a card opened before that says so instead of paying for it.
       'source'    the record keeps every source bend already (target tolerance 0 — CShapes)
       'unread'    the index (or this set's own index) has not been read this session
       'none'      the index has no detail for this row
       'mismatch'  it has, for a different outline than the one drawn — so it is not used
       'available' it has, for this outline */
  function detailState(d, idx) {
    try {
      if (!d || !d.feats || !d.feats[idx]) return { state: 'unknown' };
      if (d.precision && d.precision.targetTolerance === 0) return { state: 'source' };
      if (!detailIndex) return { state: 'unread' };
      const global = globalOfBundle(d);
      const at = { tolerance: detailIndex.targetTolerance, decimals: detailIndex.decimals, source: detailIndex.source };
      if (!global || !detailIndex.sets[global]) return Object.assign({ state: (global && detailIndex.external && detailIndex.external[global]) ? 'unread' : 'none' }, at);
      const entry = detailIndex.sets[global][idx];
      if (!entry) return Object.assign({ state: 'none' }, at);
      const key = geometryKey(d.feats[idx][8].map(p => p.map(ri => d.rings[ri])));
      return Object.assign({ state: entry[0] === key ? 'available' : 'mismatch' }, at);
    } catch (_) { return { state: 'unknown' }; }
  }
  /* (border-provenance) the reviewed river and wall courses (js/hist-courses.js) that redraw a stretch of one row's
     line at the sortable day `t` — the course records themselves, or null when the course file is not read yet */
  function coursesAt(d, idx, t) {
    try {
      if (!_HC || !d || !d.feats || !d.feats[idx] || t == null) return _HC ? [] : null;
      const seen = new Set(), out = [];
      for (const p of d.feats[idx][8]) for (const ri of p) {
        const subs = _HC.of(d.rings[ri], t) || [];
        for (const x of subs) { if (seen.has(x[2])) continue; seen.add(x[2]); const c = _HC.course(x[2]); if (c) out.push(c); }
      }
      return out;
    } catch (_) { return null; }
  }
  function detailLine(d, idx) {
    // A zero-tolerance source already retains every bend (CShapes). Fetching
    // the OHM detail index for it would add 5 MB without improving any line.
    if (d.precision && d.precision.targetTolerance === 0) return undefined;
    if (!listening) {
      try {
        const changed = () => {
          viewMemo = undefined;
          for (const path of queue) pending.delete(path);
          queue.length = 0; attempted.clear();
          if (detailView()) detailArrived();
        };
        IntMapGeoEngine.events.on('movestart', () => {
          moving = true; viewMemo = undefined;
          for (const path of queue) pending.delete(path); queue.length = 0;
          /* Restore the complete fallback before panning exposes a region outside
             the old detailed viewport. Source geometry never disappears mid-pan. */
          if (usedDetail) { usedDetail = false; for (const cb of _arrived) { try { cb(); } catch (_) {} } }
        });
        IntMapGeoEngine.events.on('moveend', () => { moving = false; changed(); });
        if (IntMapTime && typeof IntMapTime.on === 'function') IntMapTime.on(changed);
        listening = true;
      } catch (_) {}
    }
    const view = detailView(); if (!view || !detailInView(d, idx, view)) return undefined;
    if (!detailIndex) {
      if (!indexPromise) indexPromise = detailJSON('index.json')
        .then(data => { if (data && data.v === 1) { detailIndex = data; detailArrived(); } }).catch(() => {})
        .finally(() => { indexPromise = null; });
      return undefined;
    }
    const global = globalOfBundle(d);
    /* (hist-coverage-depth) a surveyed record's entries are an index of their own, which index.json only
       points to (scripts/build-border-detail.mjs writeIndex) — fetched the first time a row of THAT set
       needs detail, so a zoomed view with no surveyed row in it pays nothing for them. A failed fetch is
       retried only on a new view, as a failed fragment is (`attempted`). */
    const ext = global && !detailIndex.sets[global] && detailIndex.external && detailIndex.external[global];
    if (ext) {
      if (!pending.has(ext) && !attempted.has(ext)) {
        attempted.add(ext); pending.add(ext);
        detailJSON(ext).then(data => {
          if (data && data.v === 1 && data.global === global && data.sets && data.sets[global]) { detailIndex.sets[global] = data.sets[global]; detailArrived(); }
        }).catch(() => {}).finally(() => { pending.delete(ext); });
      }
      return undefined;
    }
    const entry = global && detailIndex.sets[global] && detailIndex.sets[global][idx];
    if (!entry) return undefined;
    let keyed = fingerprints.get(d); if (!keyed) { keyed = new Map(); fingerprints.set(d, keyed); }
    let key = keyed.get(idx);
    if (!key) { key = geometryKey(d.feats[idx][8].map(p => p.map(ri => d.rings[ri]))); keyed.set(idx, key); }
    if (entry[0] !== key) return undefined;
    const parts = entry[1].filter(part => overlaps(part[1],view)), lines = [];
    let missing = false;
    for (const part of parts) {
      const path = part[0], hit = detailCache.get(path);
      if (hit && Array.isArray(hit.data.lines[key])) {
        detailCache.delete(path); detailCache.set(path,hit); lines.push(...hit.data.lines[key]);
      } else {
        missing = true;
        if (!pending.has(path) && !attempted.has(path)) { attempted.add(path); pending.add(path); queue.push(path); pumpDetail(); }
      }
    }
    if (missing) return undefined;
    usedDetail = true;
    return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
  }

  return { load, loadCourses, courseEpoch: (t) => (_HC ? _HC.epoch(t) : -1), onArrive, marks, closedRing, ringLines, lineGeom, wholeLines, strokedOnce, geometryKey, loaded: () => !!_D, detailState, coursesAt };
})();
globalThis.IntMapBorderCoast = IntMapBorderCoast;   /* (module-graph) the compat window: importers get the binding above */
