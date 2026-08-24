/* ============================================================================
 *  IntMap · WHERE A COUNTRY IS, AS OPPOSED TO EVERYWHERE IT OWNS LAND
 *                                              window.IntMapCountryExtent  (#R426)
 * ----------------------------------------------------------------------------
 *  #R185 gave every country row its own footprint so the search could FRAME it —
 *  「Monaco framed like Monaco and Russia framed like Russia」 instead of one flat
 *  `country` zoom for both. The footprint it published was min/max over the WHOLE
 *  Natural Earth feature, and that is a different quantity from the one framing needs.
 *
 *  MEASURED against the shipped ne_10m_admin_0_countries.geojson (252 codes):
 *
 *      NOR Norway     135.2° of latitude   (Bouvet Island at 54.5°S, Jan Mayen, Svalbard)
 *      FRA France      72.5° lat / 117.7° lon  (French Guiana, Réunion, New Caledonia…)
 *      USA United States        358.9° lon   (Guam, American Samoa, Alaska past ±180)
 *      AUS Australia   45.5° lat            (Macquarie Island at 54.6°S)
 *      NZL New Zealand          356.8° lon
 *      NLD Netherlands 41.5° lat            (Caribbean Netherlands)
 *      CAN Canada      41.4° lat
 *      RUS Russia               360.0° lon
 *
 *  Two different failures come out of that one number, and BOTH of them end in a camera
 *  that is not looking at the country:
 *
 *    · A BOX INFLATED BY REMOTE TERRITORY. js/place-framing.js's OUTLIER rule sees the
 *      label point sitting nowhere near the middle of the box and REFUSES it, so Norway,
 *      France, the Netherlands, Ecuador, Portugal, Chile and Denmark all fall back to the
 *      flat `country` zoom of 4.4 — precisely the defect #R185 existed to remove. The ones
 *      the rule does NOT refuse keep a box stretched by an outlier instead: Australia is
 *      framed 45.5° tall because of one 128 km² island, South Africa 24.8° because of two.
 *    · A BOX THAT CANNOT BE WRITTEN DOWN. A country whose rings cross ±180 gets
 *      `min = -180, max = 180` — a claim to the whole planet's width — so framing refuses
 *      it as well and the USA, Russia, New Zealand, Fiji and Kiribati are flown to zoom 3.2.
 *      New Zealand at 3.2 is a speck; Fiji is not visible at all.
 *
 *  ⚠ THE FIX IS NOT A LARGER TOLERANCE DOWNSTREAM. Both failures are the same mistake made
 *  once, here: a union over parts throws away the fact that a country is a PLACE with
 *  outliers attached, and no amount of guessing downstream can put that back. So this
 *  module answers the question framing actually asks — WHERE IS THE COUNTRY — and the union
 *  is still published beside it under its own name for the one caller that wants a superset
 *  (see `fullExtent`).
 *
 *  It is a file of its own for the reason js/place-framing.js is: it is pure — no map, no
 *  renderer, no HOST, no turf — so the whole decision is testable in Node against the real
 *  Natural Earth geometry, which is how every number above was measured.
 * ==========================================================================*/
(function(){
  /* ══ THE TWO CONSTANTS, AND WHAT THEY WERE MEASURED AGAINST ═══════════════════════════
     A part joins the frame when it is NEAR the piece the country is labelled on, or when it
     is a LARGE SHARE of the country's land however far away it sits. One test alone cannot
     do it: measured, peninsular Malaysia and Sarawak are 5.4° apart and CONUS and Alaska are
     5.4° apart, so no distance separates «the other half of the country» from «a territory».

     GAP_DEG — how far apart two pieces may be and still read as one place, in degrees of the
       box they will be drawn in. Measured over all 252 codes, the number of frames that are
       implausible (wider than 180° or taller than 90°) or that lose more than 40 % of the
       country's land is IDENTICAL for any gap in 2.5°–4°, so the defect above is fixed across
       that whole range and this constant is not delicately placed. 3° is where the archipelago
       states first frame WHOLE — Solomon Islands 48/48 parts, Tonga 10/10, Marshall Islands
       22/22, Equatorial Guinea 3/3 — while staying under the nearest thing that must be left
       out at scale: Norway's Bjørnøya at 3.18°, which is the stepping stone from the mainland
       to Svalbard (Svalbard itself is 5.40° out). Chile's Juan Fernández sits at 3.05°, just
       outside; letting it in would widen Chile's frame from 9.3° to 14° of longitude and NOT
       move the camera, because Chile's 38.4° of latitude is what decides the zoom.
     ⚠ DEGREES, NOT KILOMETRES. A longitude gap at 71°N is short on the ground and still wide
       on the map, and this number is chosen for a map frame, not for a journey.

     MAJOR_SHARE — the share of the country's land that makes a distant piece part of the
       answer anyway. Measured, nothing changes anywhere between 0.29 and 0.39, and the two
       nearest neighbours are exactly the pair this has to separate: Alaska is 15.0 % of the
       United States and stays out (CONUS frames at 57.8° × 24.8°), Sarawak is 39.8 % of
       Malaysia and comes in (99.6°E–119.3°E, both halves of the country on screen). */
  const GAP_DEG = 3;
  const MAJOR_SHARE = 1 / 3;

  const D2R = Math.PI / 180;

  /* Relative size of a ring, by the spherical-excess sum @turf/area is built on. The Earth's
     radius is deliberately absent: every use below is a RATIO between parts of one country,
     so the constant would cancel, and carrying it would state a precision this does not have. */
  function ringWeight(ring){
    const len = ring.length; if(len <= 2) return 0;
    let total = 0;
    for(let i = 0; i < len; i++){
      const lo = ring[i], mid = ring[(i + 1) % len], up = ring[(i + 2) % len];
      const x1 = +lo[0], x3 = +up[0], y2 = +mid[1];
      if(!isFinite(x1) || !isFinite(x3) || !isFinite(y2)) continue;
      total += (x3 * D2R - x1 * D2R) * Math.sin(y2 * D2R);
    }
    return Math.abs(total) / 2;
  }

  /* One polygon of the feature → its own box and its own weight. A hole cannot widen a box
     its own outer ring already covers, so only ring 0 is walked. */
  function partsOf(geometry){
    const g = geometry;
    const polys = (g && g.type === 'Polygon') ? [g.coordinates]
                : (g && g.type === 'MultiPolygon') ? g.coordinates : [];
    const out = [];
    for(const rings of (polys || [])){
      const ring = rings && rings[0];
      if(!(ring && ring.length)) continue;
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for(let i = 0; i < ring.length; i++){
        const x = +ring[i][0], y = +ring[i][1];
        if(!isFinite(x) || !isFinite(y)) continue;
        if(x < w) w = x; if(x > e) e = x; if(y < s) s = y; if(y > n) n = y;
      }
      if(!isFinite(w)) continue;
      out.push({ w, s, e, n, weight: ringWeight(ring), ring });
    }
    return out;
  }

  function pointInRing(x, y, ring){
    let inside = false;
    for(let i = 0, j = ring.length - 1; i < ring.length; j = i++){
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if(((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) inside = !inside;
    }
    return inside;
  }

  /* ══ LONGITUDE IS A CIRCLE, AND THAT IS THE WHOLE ANTIMERIDIAN STORY ══════════════════
     Natural Earth splits a ring at ±180, so no single PART ever wraps — but the union of two
     of them does, and min/max cannot say so: Chukotka at 179°E and Big Diomede at 169°W come
     out as «-180 to 180», the whole planet. So the growing frame carries a longitude INTERVAL
     [w, e] in which `e` may run past 180, and every part is offered at -360°, 0° and +360°
     with the offset that keeps the interval SHORTEST winning. Russia comes out 26.9°E →
     191.0°E: 164.1° wide, which is Russia, and a number a camera can use. Callers read the
     span as `e - w`. Only Antarctica, which truly encircles the pole, still cannot be written
     as an interval, and it is returned as the full -180…180. */
  function lonGap(w, e, bw, be){
    let best = Infinity;
    for(let k = -1; k <= 1; k++){
      const o = k * 360, lo = bw + o, hi = be + o;
      const d = (hi < w) ? (w - hi) : (lo > e) ? (lo - e) : 0;
      if(d < best) best = d;
    }
    return best;
  }
  function lonUnion(w, e, bw, be){
    let best = Infinity, out = null;
    for(let k = -1; k <= 1; k++){
      const o = k * 360, nw = Math.min(w, bw + o), ne = Math.max(e, be + o);
      if(ne - nw < best){ best = ne - nw; out = [nw, ne]; }
    }
    return out;
  }

  /* [w, s, e, n] of the country ITSELF — the piece it is labelled on plus everything that
     reads as the same place. `e` may exceed 180 when the country crosses the antimeridian;
     `w` is always in [-180, 180). Returns null when the geometry has no usable ring. */
  function homeExtent(geometry, labelPoint){
    const ps = partsOf(geometry);
    if(!ps.length) return null;
    let total = 0; for(const p of ps) total += p.weight;
    if(!(total > 0)) total = 1;

    /* THE ANCHOR IS WHERE THE COUNTRY PUTS ITS OWN NAME. Natural Earth's LABEL_X/LABEL_Y is a
       cartographer's judgement about which piece IS the country, so it beats area when the two
       disagree — Kiribati is labelled on Kiritimati, 3,300 km from the largest cluster of its
       atolls. Without a usable label point the largest piece stands in. */
    let anchor = -1;
    if(labelPoint && isFinite(labelPoint[0]) && isFinite(labelPoint[1])){
      for(let i = 0; i < ps.length; i++){
        if(pointInRing(+labelPoint[0], +labelPoint[1], ps[i].ring)){ anchor = i; break; }
      }
    }
    if(anchor < 0){ let bw = -Infinity; for(let i = 0; i < ps.length; i++){ if(ps[i].weight > bw){ bw = ps[i].weight; anchor = i; } } }

    const used = new Array(ps.length).fill(false);
    used[anchor] = true;
    let w = ps[anchor].w, e = ps[anchor].e, s = ps[anchor].s, n = ps[anchor].n;
    /* SINGLE LINKAGE, not one pass out from the anchor: an island chain is a chain, and Japan
       reaches Okinawa the way a reader's eye does — down the Nansei islands, one short hop at a
       time — rather than in the one 8° leap a straight anchor-to-part test would refuse. */
    let grew = true;
    while(grew){
      grew = false;
      for(let i = 0; i < ps.length; i++){
        if(used[i]) continue;
        const p = ps[i];
        const gLon = lonGap(w, e, p.w, p.e);
        const gLat = (p.s > n) ? (p.s - n) : (p.n < s) ? (s - p.n) : 0;
        if(Math.max(gLon, gLat) <= GAP_DEG || (p.weight / total) >= MAJOR_SHARE){
          used[i] = true;
          const u = lonUnion(w, e, p.w, p.e); w = u[0]; e = u[1];
          if(p.s < s) s = p.s; if(p.n > n) n = p.n;
          grew = true;
        }
      }
    }
    if(e - w >= 360) return [-180, s, 180, n];   /* encircles a pole — Antarctica, and only it */
    while(w < -180){ w += 360; e += 360; }
    while(w >= 180){ w -= 360; e -= 360; }
    return [w, s, e, n];
  }

  /* [w, s, e, n] over EVERY coordinate of the feature — the country and everything it owns,
     however far away. This is what #R185 published as `bbox`, and it is still the right answer
     for one job: a cheap «could this point possibly be in this country» refusal, which must
     never be a subset of the truth. It is NOT a frame — see the header. */
  function fullExtent(geometry){
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity, seen = 0;
    const walk = (c) => {
      if(!Array.isArray(c)) return;
      if(typeof c[0] === 'number'){
        const x = +c[0], y = +c[1];
        if(isFinite(x) && isFinite(y)){ seen++; if(x < w) w = x; if(x > e) e = x; if(y < s) s = y; if(y > n) n = y; }
        return;
      }
      for(const k of c) walk(k);
    };
    try{ walk(geometry && geometry.coordinates); }catch(_){ return null; }
    return seen ? [w, s, e, n] : null;
  }

  window.IntMapCountryExtent = { homeExtent, fullExtent, GAP_DEG, MAJOR_SHARE };
})();
