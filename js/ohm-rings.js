/* ============================================================================
 *  ohm-rings.js — an OpenHistoricalMap relation, as a polygon  (#R668)
 * ----------------------------------------------------------------------------
 *  「クリックしたときのハイライト線が線に比べて解像度が低い。」
 *
 *  ══ ⚠⚠⚠ WHY THIS IS A FILE AND NOT A SECOND COPY OF THE BUILD'S LOOP ═══════
 *  #R604 moved the era LINE off the shipped bundle and onto OpenHistoricalMap's
 *  own vector tiles, because «a bundle has ONE resolution and a map has twenty».
 *  It left the CLICK where it was. Measured 2026-09-10 on 伊豆国 (OHM relation
 *  2687374): upstream is 2,800 vertices, the shipped bundle draws it with 29 —
 *  so the highlight the reader gets on a tap is a hundredfold coarser than the
 *  line it is supposed to be tracing, in the same view, at the same instant.
 *
 *  The click needs exactly ONE unit's true geometry, so it fetches exactly one
 *  record — and a record fetched from Overpass arrives as unordered open member
 *  ways, which somebody has to join into rings. scripts/build-hist-admin1.mjs
 *  already did that, in Node, for the bundle. Two implementations of «which runs
 *  of these ways are the same ring» would be two answers to one question the
 *  first day one of them was touched, so there is one, here, and the build
 *  evaluates this file rather than carrying its own (scripts/build-whs.mjs reads
 *  js/lang-registry.js the same way).
 *
 *  ⚠ NOTHING IN HERE TOUCHES THE DOM, THE MAP, THE NETWORK OR THE CLOCK. That is
 *  what lets tests/r668-checks.test.mjs EVALUATE it instead of reading it
 *  (#R505: a check that reads source cannot see what a function returns), and it
 *  is the property to keep.
 * ==========================================================================*/
window.IntMapOhmRings = (function () {

  /* ── ① member ways → closed rings ────────────────────────────────────────
     Overpass returns a relation's members in no particular order and in no
     particular direction, and a ring is spread over as many ways as the mappers
     happened to split it into. Rings are grown from both ends until they close.
     `role` is honoured for outer/inner and anything else (label, admin_centre,
     subarea) is not part of the area. */
  function ringsOf(el) {
    const segs = [];
    for (const m of ((el && el.members) || [])) {
      if (m.type !== 'way' || !Array.isArray(m.geometry)) continue;
      if (m.role && m.role !== 'outer' && m.role !== 'inner') continue;
      const g = m.geometry.filter(p => p && Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => [p.lon, p.lat]);
      if (g.length >= 2) segs.push(g);
    }
    const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
    const rings = [], used = new Array(segs.length).fill(false);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      let cur = segs[i].slice();
      let grew = true;
      while (grew) {
        grew = false;
        if (cur.length > 3 && key(cur[0]) === key(cur[cur.length - 1])) break;
        for (let j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          const s = segs[j], a = key(cur[cur.length - 1]), b = key(cur[0]);
          if (key(s[0]) === a)                 { cur = cur.concat(s.slice(1)); used[j] = true; grew = true; }
          else if (key(s[s.length - 1]) === a) { cur = cur.concat(s.slice(0, -1).reverse()); used[j] = true; grew = true; }
          else if (key(s[s.length - 1]) === b) { cur = s.slice(0, -1).concat(cur); used[j] = true; grew = true; }
          else if (key(s[0]) === b)            { cur = s.slice(1).reverse().concat(cur); used[j] = true; grew = true; }
          if (grew) break;
        }
      }
      /* ⚠ A RING THAT DID NOT MEET ITSELF IS STILL THE BEST ACCOUNT OF THAT BOUNDARY.
         Measured over the whole cached extract (10,131 relations at admin_level 3-6),
         146 of them hold at least one run that never closes — Markgrafschaft Baden,
         Königreich Kroatien, 吉林, 黑龍江 among them — because upstream's ways have a
         gap. Closing it with a straight chord is what the bundle has always done and
         what a fill needs; refusing to would delete the unit. */
      if (cur.length >= 4) { if (key(cur[0]) !== key(cur[cur.length - 1])) cur.push([cur[0][0], cur[0][1]]); rings.push(cur); }
    }
    return rings;
  }

  /* ── ② rings → polygons, biggest first, a contained ring becoming its hole ── */
  const ringArea = r => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const bboxOf = r => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
  const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
  /* ⚠ `minArea` DEFAULTS TO ZERO, AND THE BUILD IS THE ONE THAT PASSES A FLOOR.
     A sliver is worth dropping from a 25 MB planet-wide bundle and is never worth
     dropping from the one unit a reader just tapped: there, the sliver may be the
     whole unit. The floor is a property of the file being written, not of the shape. */
  function polysOf(rings, minArea) {
    const floor = Number.isFinite(minArea) ? minArea : 0;
    const rs = rings.map(r => ({ r, a: ringArea(r), bb: bboxOf(r) })).filter(o => o.a >= floor).sort((p, q) => q.a - p.a);
    const polys = [], taken = new Array(rs.length).fill(false);
    for (let i = 0; i < rs.length; i++) {
      if (taken[i]) continue;
      taken[i] = true;
      const poly = [rs[i].r];
      for (let j = i + 1; j < rs.length; j++) if (!taken[j] && inside(rs[j].bb, rs[i].bb)) { taken[j] = true; poly.push(rs[j].r); }
      polys.push(poly);
    }
    return polys;
  }

  /* ── ③ the whole way through, for a caller that only wants the shape ────── */
  function geometryOf(el, minArea) {
    const polys = polysOf(ringsOf(el), minArea);
    if (!polys.length) return null;
    return (polys.length === 1) ? { type: 'Polygon', coordinates: polys[0] }
                                : { type: 'MultiPolygon', coordinates: polys };
  }

  /* ── ④ how many vertices a shape carries (the claim this file exists to make) ── */
  function vertexCount(geo) {
    let n = 0;
    const scan = cs => { for (const x of cs) { if (typeof x[0] === 'number') n++; else scan(x); } };
    try { if (geo && geo.coordinates) scan(geo.coordinates); } catch (_) { }
    return n;
  }

  return { ringsOf, polysOf, geometryOf, ringArea, bboxOf, vertexCount };
})();
