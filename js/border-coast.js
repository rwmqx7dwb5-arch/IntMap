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
window.IntMapBorderCoast = (function () {
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

  function marks(set) { try { return (_D && _D.sets && _D.sets[set] && _D.sets[set].draw) || null; } catch (_) { return null; } }

  const closedRing = (r) => { const n = r.length; return (n > 1 && r[0][0] === r[n - 1][0] && r[0][1] === r[n - 1][1]) ? r : r.concat([r[0]]); };

  /* the border runs of ONE ring, as LineString coordinate arrays */
  function ringLines(ring, mark) {
    const V = closedRing(ring);
    if (mark === 0) return [];
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
  function markOf(ring) { _index(); return (_byRing && _byRing.has(ring)) ? _byRing.get(ring) : 1; }

  /* a collection handed over whole: each ring stroked whole unless the marks know it, in which case
     it is stroked the way the marks say — the outline drawn before #R531 for everything nobody has
     measured, and the measured answer for everything that has been. */
  function wholeLines(fc) {
    /* ⚠ the marks may not have been asked for yet on this path (the era tier awaits the bundle, not
       these), so ask now: a caller that memoizes what it gets back keeps the whole-ring drawing
       until it rebuilds, and one request started here is what makes that a first frame instead of a
       session. */
    if (!_D) { try { load(); } catch (_) {} }
    const feats = [];
    for (const f of ((fc && fc.features) || [])) {
      const g = f.geometry; if (!g) continue;
      const polys = g.type === 'Polygon' ? [g.coordinates] : (g.type === 'MultiPolygon' ? g.coordinates : null);
      if (!polys) continue;
      const lines = [];
      for (const p of polys) for (const r of p) if (r && r.length > 1) for (const l of ringLines(r, markOf(r))) lines.push(l);
      if (lines.length) feats.push({ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: lines }, properties: Object.assign({}, f.properties) });
    }
    return { type: 'FeatureCollection', features: feats };
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
      const e = window.IntMapGeoEngine;
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
        window.IntMapGeoEngine.events.on('movestart', () => {
          moving = true; viewMemo = undefined;
          for (const path of queue) pending.delete(path); queue.length = 0;
          /* Restore the complete fallback before panning exposes a region outside
             the old detailed viewport. Source geometry never disappears mid-pan. */
          if (usedDetail) { usedDetail = false; for (const cb of _arrived) { try { cb(); } catch (_) {} } }
        });
        window.IntMapGeoEngine.events.on('moveend', () => { moving = false; changed(); });
        if (window.IntMapTime && typeof window.IntMapTime.on === 'function') window.IntMapTime.on(changed);
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
    let global = null;
    for (const s of Object.values((_D && _D.sets) || {})) if (window[s.global] === d) { global = s.global; break; }
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

  return { load, onArrive, marks, closedRing, ringLines, lineGeom, wholeLines, geometryKey, loaded: () => !!_D };
})();
