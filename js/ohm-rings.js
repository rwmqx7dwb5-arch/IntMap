/* ============================================================================
 *  ohm-rings.js — an OpenHistoricalMap relation, as a polygon  (#R669)
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
 *  what lets tests/r669-checks.test.mjs EVALUATE it instead of reading it
 *  (#R505: a check that reads source cannot see what a function returns), and it
 *  is the property to keep.
 * ==========================================================================*/
window.IntMapOhmRings = (function () {
  // Keep source roles without changing the public arrays or their serialization.
  const ringRoles = new WeakMap();

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
      if (g.length >= 2) { ringRoles.set(g, m.role || ''); segs.push(g); }
    }
    const key = p => p[0].toFixed(7) + ',' + p[1].toFixed(7);
    const rings = [], used = new Array(segs.length).fill(false);
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      let cur = segs[i].slice();
      let role = ringRoles.get(segs[i]);
      let grew = true;
      while (grew) {
        grew = false;
        if (cur.length > 3 && key(cur[0]) === key(cur[cur.length - 1])) break;
        for (let j = 0; j < segs.length; j++) {
          if (used[j]) continue;
          const nextRole = ringRoles.get(segs[j]);
          if (role && nextRole && role !== nextRole) continue;
          const s = segs[j], a = key(cur[cur.length - 1]), b = key(cur[0]);
          if (key(s[0]) === a)                 { cur = cur.concat(s.slice(1)); used[j] = true; grew = true; }
          else if (key(s[s.length - 1]) === a) { cur = cur.concat(s.slice(0, -1).reverse()); used[j] = true; grew = true; }
          else if (key(s[s.length - 1]) === b) { cur = s.slice(0, -1).concat(cur); used[j] = true; grew = true; }
          else if (key(s[0]) === b)            { cur = s.slice(1).reverse().concat(cur); used[j] = true; grew = true; }
          if (grew) { role = role || nextRole; break; }
        }
      }
      /* ⚠ A RING THAT DID NOT MEET ITSELF IS STILL THE BEST ACCOUNT OF THAT BOUNDARY.
         Measured over the whole cached extract (10,131 relations at admin_level 3-6),
         146 of them hold at least one run that never closes — Markgrafschaft Baden,
         Königreich Kroatien, 吉林, 黑龍江 among them — because upstream's ways have a
         gap. Closing it with a straight chord is what the bundle has always done and
         what a fill needs; refusing to would delete the unit. */
      if (cur.length >= 4) { if (key(cur[0]) !== key(cur[cur.length - 1])) cur.push([cur[0][0], cur[0][1]]); ringRoles.set(cur, role); rings.push(cur); }
    }
    return rings;
  }

  /* ── ② rings → polygons, preserving source roles and true containment ── */
  const ringArea = r => { let a = 0; for (let i = 0, n = r.length - 1; i < n; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
  const bboxOf = r => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
  const inside = (a, b) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
  function pointLocation(p, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j], b = ring[i];
      if (p[1] < a[1] && p[1] < b[1] || p[1] > a[1] && p[1] > b[1]) continue;
      const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
      if (cross === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
          && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) return 0;
      if ((a[1] > p[1]) !== (b[1] > p[1])
          && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit ? 1 : -1;
  }
  function containsRing(child, parent) {
    if (!inside(child.bb, parent.bb)) return false;
    // A bounding box also contains islands outside a concave mainland (Maine).
    // Upstream may also contain crossing rings. One inside vertex does not
    // establish containment: every vertex and edge must remain inside/on it.
    let interior = false;
    for (const p of child.r) {
      const at = pointLocation(p, parent.r);
      if (at < 0) return false;
      if (at > 0) interior = true;
    }
    // Reuse edge envelopes across a parent's holes; most pairs cannot meet.
    if (!parent.edges) parent.edges = parent.r.slice(1).map((b, i) => {
      const a = parent.r[i];
      return { a, b, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]),
        y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
    });
    for (let i = 1; i < child.r.length; i++) {
      const a = child.r[i - 1], b = child.r[i];
      const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      const at = pointLocation([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], parent.r);
      if (at < 0) return false;
      if (at > 0) interior = true;
      for (const edge of parent.edges) {
        if (x1 < edge.x0 || edge.x1 < x0 || y1 < edge.y0 || edge.y1 < y0) continue;
        const c = edge.a, d = edge.b;
        const ac = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        const ad = (b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
        const ca = (d[0]-c[0])*(a[1]-c[1])-(d[1]-c[1])*(a[0]-c[0]);
        const cb = (d[0]-c[0])*(b[1]-c[1])-(d[1]-c[1])*(b[0]-c[0]);
        if (((ac < 0 && ad > 0) || (ac > 0 && ad < 0))
            && ((ca < 0 && cb > 0) || (ca > 0 && cb < 0))) return false;
      }
    }
    return interior;
  }
  /* ⚠ `minArea` DEFAULTS TO ZERO, AND THE BUILD IS THE ONE THAT PASSES A FLOOR.
     A sliver is worth dropping from a 25 MB planet-wide bundle and is never worth
     dropping from the one unit a reader just tapped: there, the sliver may be the
     whole unit. The floor is a property of the file being written, not of the shape. */
  function polysOf(rings, minArea) {
    const floor = Number.isFinite(minArea) ? minArea : 0;
    const rs = rings.map(r => ({ r, a: ringArea(r), bb: bboxOf(r), role: ringRoles.get(r) || '' }))
      .filter(o => o.a >= floor).sort((p, q) => q.a - p.a);
    const polys = [];
    for (let i = 0; i < rs.length; i++) {
      const cur = rs[i];
      let parent = null;
      if (cur.role !== 'outer') for (let j = i - 1; j >= 0; j--) {
        if (containsRing(cur, rs[j])) { parent = rs[j]; break; }
      }
      // Unclassified rings alternate shell/hole at each containment depth.
      // An explicit outer is always land, including an island inside a hole.
      const hole = parent && (cur.role === 'inner' || !parent.hole);
      cur.hole = !!hole;
      if (hole) { cur.poly = parent.poly; cur.poly.push(cur.r); }
      else { cur.poly = [cur.r]; polys.push(cur.poly); }
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
