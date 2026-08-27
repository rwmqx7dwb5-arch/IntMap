/* ============================================================================
 *  IntMap · HOW FAR IS THE SEA — window.IntMapCoastline   (#R495)
 * ----------------------------------------------------------------------------
 *  「人口100万人以上で、年間降水量500mm未満、海から200km以上、…都市は？」
 *
 *  The third condition had no answer anywhere in the program. Population came out of the gazetteer,
 *  precipitation out of data/precip-mm.png, the earthquakes out of USGS — and 「海から200km以上」
 *  could not be evaluated at all, so the whole question fell back to prose about what somebody
 *  would have to go and check. This file is that missing measurement, and js/atlas-query.js is what
 *  puts it in the same sentence as the other three.
 *
 *  ══ WHAT IS MEASURED ══════════════════════════════════════════════════════════════════════════
 *  The great-circle distance from a point to the nearest point ON the coastline — the LINE, not a
 *  sampled set of coastal cells and not a raster of pre-computed distances. data/coastline.json.gz
 *  (scripts/build-coastline.mjs) carries Natural Earth 1:10m simplified to a 2 km tolerance, and the
 *  distance is computed against the SEGMENTS, so the only error is that tolerance: 2 km, whatever
 *  the answer is. A 0.1° distance raster would have cost about ±6 km and 26 M cells to say less.
 *
 *  ══ TWO ANSWERS, BECAUSE THERE ARE TWO QUESTIONS ═══════════════════════════════════════════════
 *  Natural Earth's coastline layer contains the CASPIAN. Tehran is 109 km from it and about 800 km
 *  from the Persian Gulf, so 「海から200km以上」 either contains Tehran or does not, depending on a
 *  definition. Both are offered and neither is hidden:
 *      distanceKm(lng, lat)                    → the world ocean          (`coastKm`)
 *      distanceKm(lng, lat, {enclosed: true})  → ocean or landlocked sea  (`seaKm`)
 *
 *  ══ WHY THE INNER LOOP HAS NO TRIGONOMETRY ════════════════════════════════════════════════════
 *  A query against 84,000 vertices, run for every candidate row, cannot afford an `atan2` per
 *  segment. Every vertex is held as a UNIT VECTOR, and the angular distance from p to the arc a→b
 *  is recovered from dot products alone: with n = â×b̂ normalised, |p·n| is the sine of the
 *  cross-track angle, and the foot of the perpendicular lies inside the arc exactly when p·a and
 *  p·b both clear (a·b)·√(1−(p·n)²). The minimum is tracked as a COSINE — monotone in the angle —
 *  and `Math.acos` is called ONCE per query, on the winner.
 *
 *  ⚠ AND THE VECTORS ARE Float64, WHICH IS NOT A DEFAULT — IT IS THE COASTAL CASE. Near the shore
 *  the cosine is 1 − 1.2e-8 per kilometre; Float32 resolves about 1e-7 there, so a Float32 index
 *  would answer «0 km» for everything within some 3 km of the sea and could not tell a port from a
 *  town half an hour inland. The whole index is 84,000 × 3 doubles ≈ 2 MB, built once, on first ask.
 *
 *  ⚠ THE LATITUDE BAND IS THE ONLY PRUNE, ON PURPOSE. R·|Δφ| is a true lower bound on the distance
 *  between two points; the tempting longitude analogue, Δλ·cos φ, is NOT — at 60°N two points half
 *  the world apart are 6,672 km apart while the parallel between them is 10,019 km long, so a
 *  «longitude prune» would discard the real nearest coast. Bands are visited nearest-first and the
 *  search stops as soon as the band's own floor exceeds the best distance found.
 *
 *  ⚠ EVERYTHING IS INSIDE THE FACTORY (tests/r175 ③): an unexported top-level declaration in js/
 *  would have been a global before the bundle, and this file may not reintroduce one.
 * ==========================================================================*/

export function makeCoastline() {
  const FILE = 'data/coastline.json.gz';
  const R_KM = 6371.0088;
  const BAND_DEG = 2;                       /* 90 latitude bands */
  const KM_PER_DEG_LAT = 110.574;

  function url() {
    try { return new URL(FILE, (window.IM_HOST && window.IM_HOST.base) || document.baseURI).toString(); }
    catch (_) { return FILE; }
  }

  /* ── the decoded index ───────────────────────────────────────────────────────────────────────
     `vec` holds every vertex as a unit vector; `segA` holds one entry per SEGMENT, the index of its
     first vertex (a segment never straddles two parts); `items`/`start` map a latitude band to the
     segments whose latitude span reaches it. */
  function makeIndex(parts, scale) {
    let nv = 0;
    for (const p of parts) nv += p.length >> 1;
    const vec = new Float64Array(nv * 3);
    const segA = new Int32Array(Math.max(0, nv - parts.length));
    const segLo = new Float32Array(segA.length), segHi = new Float32Array(segA.length);
    let vi = 0, si = 0;
    for (const p of parts) {
      let x = p[0], y = p[1];
      let prevLat = null, prevIdx = -1;
      for (let k = 0; k < p.length; k += 2) {
        if (k > 0) { x += p[k]; y += p[k + 1]; }
        const lng = x / scale, lat = y / scale;
        const la = lat * Math.PI / 180, lo = lng * Math.PI / 180;
        const c = Math.cos(la);
        vec[vi * 3] = c * Math.cos(lo); vec[vi * 3 + 1] = c * Math.sin(lo); vec[vi * 3 + 2] = Math.sin(la);
        if (prevIdx >= 0) {
          segA[si] = prevIdx;
          segLo[si] = Math.min(prevLat, lat); segHi[si] = Math.max(prevLat, lat);
          si++;
        }
        prevIdx = vi; prevLat = lat; vi++;
      }
    }
    const nBands = Math.ceil(180 / BAND_DEG);
    const bandOf = (lat) => Math.max(0, Math.min(nBands - 1, Math.floor((lat + 90) / BAND_DEG)));
    const counts = new Int32Array(nBands);
    for (let i = 0; i < si; i++) {
      const b0 = bandOf(segLo[i]), b1 = bandOf(segHi[i]);
      for (let b = b0; b <= b1; b++) counts[b]++;
    }
    const start = new Int32Array(nBands + 1);
    for (let b = 0; b < nBands; b++) start[b + 1] = start[b] + counts[b];
    const items = new Int32Array(start[nBands]);
    const fill = start.slice(0, nBands);
    for (let i = 0; i < si; i++) {
      const b0 = bandOf(segLo[i]), b1 = bandOf(segHi[i]);
      for (let b = b0; b <= b1; b++) items[fill[b]++] = i;
    }
    return { vec, segA, segCount: si, nBands, start, items, bandOf };
  }

  /* every segment of one band, as a COSINE of the angular distance, to be maximised */
  function scanBand(ix, b, px, py, pz, bestCos) {
    const vec = ix.vec, segA = ix.segA, start = ix.start, items = ix.items;
    for (let k = start[b], e = start[b + 1]; k < e; k++) {
      const s = items[k], ai = segA[s] * 3, bi = ai + 3;
      const ax = vec[ai], ay = vec[ai + 1], az = vec[ai + 2];
      const bx = vec[bi], by = vec[bi + 1], bz = vec[bi + 2];
      const pa = px * ax + py * ay + pz * az;
      const pb = px * bx + py * by + pz * bz;
      let best = pa > pb ? pa : pb;                    /* the endpoints are always candidates */
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (nl > 1e-12) {
        nx /= nl; ny /= nl; nz /= nl;
        const pn = px * nx + py * ny + pz * nz;
        const s2 = 1 - pn * pn;
        if (s2 > 0) {
          const sc = Math.sqrt(s2);                    /* cos of the cross-track angle */
          if (sc > best) {
            const ab = ax * bx + ay * by + az * bz;
            /* the foot of the perpendicular is inside the arc when it is at least as close to each
               end as the ends are to each other */
            if (pa >= ab * sc && pb >= ab * sc) best = sc;
          }
        }
      }
      if (best > bestCos) bestCos = best;
    }
    return bestCos;
  }

  function query(ix, lng, lat) {
    if (!ix || !ix.segCount) return null;
    const la = lat * Math.PI / 180, lo = lng * Math.PI / 180, c = Math.cos(la);
    const px = c * Math.cos(lo), py = c * Math.sin(lo), pz = Math.sin(la);
    let bestCos = -1;
    const home = ix.bandOf(lat);
    for (let step = 0; step < ix.nBands; step++) {
      /* the floor of what this step can still find: a band `step` away is at least (step−1) whole
         bands of latitude from the point, and R·|Δφ| is a true lower bound on the distance */
      if (bestCos > -1) {
        const floorKm = Math.max(0, (step - 1) * BAND_DEG) * KM_PER_DEG_LAT;
        if (floorKm > Math.acos(Math.min(1, bestCos)) * R_KM) break;
      }
      const up = home + step, dn = home - step;
      if (up < ix.nBands) bestCos = scanBand(ix, up, px, py, pz, bestCos);
      if (step > 0 && dn >= 0) bestCos = scanBand(ix, dn, px, py, pz, bestCos);
      if (up >= ix.nBands && dn < 0) break;
    }
    if (bestCos <= -1) return null;
    return Math.acos(Math.min(1, Math.max(-1, bestCos))) * R_KM;
  }

  let meta = null, oceanIx = null, seaIx = null, loading = null;

  /* Take a decoded data/coastline.json.gz. Separate from the fetch so the same code path can be
     driven from a test with the real file instead of a stand-in for it. */
  function adopt(doc) {
    if (!doc || !Array.isArray(doc.coords)) return false;
    meta = { source: doc.source, url: doc.url, toleranceKm: doc.toleranceKm, means: doc.means,
      parts: doc.parts, vertices: doc.vertices,
      enclosedParts: doc.enclosedParts || 0, enclosedVertices: doc.enclosedVertices || 0,
      enclosedNames: Array.from(new Set(doc.enclosedNames || [])) };
    oceanIx = makeIndex(doc.coords, doc.scale);
    /* the «any sea» index is the two lists indexed TOGETHER — a second scan of the ocean index
       would be the same work twice, and min() of two searches is the same answer */
    seaIx = (doc.enclosed && doc.enclosed.length)
      ? makeIndex(doc.coords.concat(doc.enclosed), doc.scale) : oceanIx;
    return true;
  }

  /* Resolves to true when the coastline is usable. Never rejects and never fetches twice — a
     session without it is a session where `coastKm` is unavailable and SAYS so, which is a smaller
     query engine and not a broken one (the rule js/gazetteer.js's `warm` already follows). */
  function ready() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const r = await fetch(url(), { cache: 'force-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const bytes = new Uint8Array(await r.arrayBuffer());
        let text;
        /* DECIDE FROM THE BYTES, not from the file name — a host that labels `.gz` with
           Content-Encoding has already decompressed it (js/gazetteer.js, same reasoning) */
        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
          if (typeof DecompressionStream !== 'function') throw new Error('DecompressionStream unavailable');
          text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
        } else { text = new TextDecoder().decode(bytes); }
        return adopt(JSON.parse(text));
      } catch (e) {
        try { console.warn('[IntMap] coastline unavailable —', e.message); } catch (_) { }
        return false;
      }
    })();
    return loading;
  }

  return {
    ready, adopt,
    loaded: () => !!oceanIx,
    meta: () => meta,
    /* km to the nearest coast, or null when the file has not arrived. `enclosed:true` counts the
       landlocked seas (the Caspian) as sea; the default does not. */
    distanceKm(lng, lat, opts) {
      if (!oceanIx || !isFinite(lng) || !isFinite(lat)) return null;
      return query((opts && opts.enclosed) ? seaIx : oceanIx, +lng, +lat);
    },
    /* both answers in one call, for a table that shows the reader the choice it made */
    distances(lng, lat) {
      if (!oceanIx || !isFinite(lng) || !isFinite(lat)) return null;
      return { coastKm: query(oceanIx, +lng, +lat), seaKm: query(seaIx, +lng, +lat) };
    },
  };
}
