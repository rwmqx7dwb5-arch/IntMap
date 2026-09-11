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
  function lineGeom(d, idx, marksArr) {
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

  return { load, onArrive, marks, closedRing, ringLines, lineGeom, wholeLines, loaded: () => !!_D };
})();
