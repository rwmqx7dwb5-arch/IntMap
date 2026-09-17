/* ============================================================================
 *  IntMap · Aviation data model — normalisation, provenance, geometry  (#R341)
 * ----------------------------------------------------------------------------
 *  THE SHAPE EVERY PROVIDER IS REDUCED TO, in one file, so that "which provider is IntMap using
 *  today" is a configuration question and not a code question. The encoder, the Worker, the
 *  renderer and the detail card all consume AircraftState below; not one of them can tell whether
 *  the aircraft arrived from adsb.lol or from OpenSky, and that is what makes the provider
 *  swappable at all.
 *
 *  Like js/aviation-codec.js this is mirrored into supabase/functions/_shared/ by
 *  scripts/sync-aviation.mjs and CI-checked, because the SERVER normalises and the BROWSER
 *  interprets — if the two disagreed about what `military` means, the filter would disagree with
 *  the colour.
 *
 *  WHAT THIS FILE IS CAREFUL ABOUT
 *  ------------------------------
 *  1. OBSERVED vs DERIVED. ADS-B tells you where an aircraft is, how fast, how high, and what its
 *     transponder is set to. It does NOT tell you the flight number's schedule, its origin, its
 *     destination, or whether it is late. Those come from a different source or from an IntMap
 *     estimate, and §15.3 forbids showing an estimate as if it were an airline's own figure. So
 *     nothing in this file ever invents one — the fields simply do not exist here.
 *  2. MISSING vs ZERO. `null` means the provider did not say. `0` means the provider said zero.
 *     A vertical rate of 0 is level flight; a vertical rate of null is silence. Collapsing them is
 *     how a map ends up drawing every unknown aircraft as if it were cruising level at sea level.
 *  3. MILITARY. Only a provider-set database flag counts (#R19 established this and it still
 *     holds): callsign prefixes match civilian charter flights and mis-colour them red. When a
 *     provider has no such flag — OpenSky's state vector does not — the answer is false, and the
 *     UI must say "not reported by this provider" rather than "civilian".
 * ==========================================================================*/
(function () {
  'use strict';

  var NM_KM = 1.852;
  var M_PER_FT = 0.3048;
  var MS_TO_KT = 1.943844;
  var MS_TO_FPM = 196.850394;

  /* ── ADS-B emitter categories ─────────────────────────────────────────────
     The standard numbers these A0–D7; the wire carries the small integer so the client's table is
     one flat array instead of a string map. Names are the ICAO wording, not a paraphrase. */
  var CATEGORY_NAMES = [
    'No information', 'Light (< 15 500 lb)', 'Small (15 500 – 75 000 lb)', 'Large (75 000 – 300 000 lb)',
    'High-vortex large', 'Heavy (> 300 000 lb)', 'High performance', 'Rotorcraft',
    'Reserved', 'Glider / sailplane', 'Lighter-than-air', 'Parachutist / skydiver',
    'Ultralight / hang-glider', 'Reserved', 'Unmanned aerial vehicle', 'Space / trans-atmospheric',
    'Reserved', 'Surface — emergency vehicle', 'Surface — service vehicle', 'Point obstacle',
    'Cluster obstacle', 'Line obstacle', 'Reserved', 'Reserved',
    'Reserved', 'Reserved', 'Reserved', 'Reserved', 'Reserved', 'Reserved', 'Reserved', 'Reserved',
  ];

  /* A0 → 0, A1 → 1 … B0 → 8 … D7 → 31. Anything else is 0 = "no information", never a guess. */
  function categoryNum(c) {
    if (typeof c !== 'string' || c.length < 2) return 0;
    var band = c.charCodeAt(0) - 65;
    var slot = c.charCodeAt(1) - 48;
    if (band < 0 || band > 3 || slot < 0 || slot > 7) return 0;
    return band * 8 + slot;
  }
  function categoryName(n) { return CATEGORY_NAMES[n] || 'Unknown'; }

  /* Rotorcraft, glider, UAV and the three surface categories are the ones a filter needs to name.
     Surface categories matter especially: a service vehicle on a taxiway is not an aircraft, and
     drawing it as one is why airport views used to look busier than they were. */
  function isRotorcraft(n) { return n === 7; }
  function isGlider(n) { return n === 9; }
  function isUAV(n) { return n === 14; }
  function isSurfaceVehicle(n) { return n === 17 || n === 18; }
  function isObstacle(n) { return n >= 19 && n <= 21; }

  function num(v) {
    if (v == null || v === '') return null;
    var n = (typeof v === 'number') ? v : Number(v);
    return isFinite(n) ? n : null;
  }

  /* ── AircraftState — the one record shape ─────────────────────────────────
     Every field is either a measurement or null. `seenAt` is an absolute epoch-ms timestamp for the
     OBSERVATION, derived from the provider's own age/report time — not from when we asked. The
     difference is what lets the UI distinguish "the provider saw this 0.4 s ago" from "we polled
     8 s ago", which §22.2 requires it to be able to do. */
  function blankState(hex) {
    return {
      hex: hex, lon: null, lat: null,
      altFt: null, geometric: false,
      track: null, gsKt: null, vrFpm: null,
      onGround: false, military: false, emergency: false, spi: false,
      squawk: null, category: 0,
      callsign: '', type: '', registration: '', operator: '',
      seenAt: 0, source: '',
    };
  }

  /* ── adsb.lol / readsb ("v2" aircraft.json shape) ─────────────────────────
     Also the shape airplanes.live used, so the legacy provider normalises through the same path. */
  function normalizeAdsbLol(a, nowMs, source) {
    if (!a || !a.hex) return null;
    var s = blankState(String(a.hex).toLowerCase());
    s.source = source || 'adsblol';
    s.lon = num(a.lon);
    s.lat = num(a.lat);

    /* `alt_baro` is the STRING "ground" when the aircraft reports itself on the surface. Treating
       that as a number yields NaN, and NaN silently became 0 ft in the old path — indistinguishable
       from an aircraft that genuinely reported 0. */
    if (a.alt_baro === 'ground') {
      s.onGround = true;
      s.altFt = 0;
    } else {
      var baro = num(a.alt_baro);
      if (baro != null) { s.altFt = baro; }
      else {
        var geom = num(a.alt_geom);
        if (geom != null) { s.altFt = geom; s.geometric = true; }
      }
    }

    /* Track first, true heading second. #R172 fixed the order: an aircraft on the ground reports a
       heading and no track, and one in cruise reports both — using heading first made every
       airborne glyph point at its nose attitude rather than its path. */
    var trk = num(a.track);
    s.track = (trk != null) ? trk : num(a.true_heading);
    s.gsKt = num(a.gs);
    var br = num(a.baro_rate);
    s.vrFpm = (br != null) ? br : num(a.geom_rate);
    s.squawk = (typeof a.squawk === 'string' && a.squawk) ? a.squawk : null;
    s.emergency = !!(a.emergency && a.emergency !== 'none');
    s.military = !!((num(a.dbFlags) || 0) & 1);
    s.category = categoryNum(a.category);
    s.callsign = (a.flight || '').trim();
    s.type = (a.t || '').trim();
    s.registration = (a.r || '').trim();

    /* seen_pos = age of the POSITION; seen = age of any message. A position 90 s old on an aircraft
       heard from 1 s ago is a 90-second-old position, and that is the number the map depends on. */
    var ageSec = num(a.seen_pos);
    if (ageSec == null) ageSec = num(a.seen);
    if (ageSec == null) ageSec = 0;
    s.seenAt = nowMs - ageSec * 1000;
    return s;
  }

  /* ── OpenSky /states/all ──────────────────────────────────────────────────
     A positional array, documented at openskynetwork.github.io/opensky-api/rest.html. Indices are
     spelled out rather than destructured so a reader can check them against that page without
     counting commas. Units are SI there and imperial here — aviation displays feet and knots, and
     converting once at the boundary is cheaper and safer than converting at every use site. */
  var OSK = {
    ICAO24: 0, CALLSIGN: 1, ORIGIN_COUNTRY: 2, TIME_POSITION: 3, LAST_CONTACT: 4,
    LONGITUDE: 5, LATITUDE: 6, BARO_ALTITUDE: 7, ON_GROUND: 8, VELOCITY: 9,
    TRUE_TRACK: 10, VERTICAL_RATE: 11, SENSORS: 12, GEO_ALTITUDE: 13, SQUAWK: 14,
    SPI: 15, POSITION_SOURCE: 16, CATEGORY: 17,
  };

  function normalizeOpenSky(v, nowMs) {
    if (!Array.isArray(v) || !v[OSK.ICAO24]) return null;
    var s = blankState(String(v[OSK.ICAO24]).trim().toLowerCase());
    s.source = 'opensky';
    s.lon = num(v[OSK.LONGITUDE]);
    s.lat = num(v[OSK.LATITUDE]);

    var baroM = num(v[OSK.BARO_ALTITUDE]);
    var geoM = num(v[OSK.GEO_ALTITUDE]);
    if (baroM != null) { s.altFt = baroM / M_PER_FT; }
    else if (geoM != null) { s.altFt = geoM / M_PER_FT; s.geometric = true; }

    s.track = num(v[OSK.TRUE_TRACK]);
    var vel = num(v[OSK.VELOCITY]);
    s.gsKt = (vel != null) ? vel * MS_TO_KT : null;
    var vr = num(v[OSK.VERTICAL_RATE]);
    s.vrFpm = (vr != null) ? vr * MS_TO_FPM : null;
    s.onGround = !!v[OSK.ON_GROUND];
    s.spi = !!v[OSK.SPI];
    s.squawk = (typeof v[OSK.SQUAWK] === 'string' && v[OSK.SQUAWK]) ? v[OSK.SQUAWK] : null;
    /* OpenSky's state vector carries no military flag and no emergency field. `false` here means
       "this provider does not report it" — the UI must not render that as "civilian, confirmed".
       providerReports() below is how a caller asks which is which. */
    s.military = false;
    s.emergency = (s.squawk === '7500' || s.squawk === '7600' || s.squawk === '7700');
    s.category = num(v[OSK.CATEGORY]) || 0;
    s.callsign = (v[OSK.CALLSIGN] || '').trim();

    var tp = num(v[OSK.TIME_POSITION]);
    s.seenAt = (tp != null) ? tp * 1000 : nowMs;
    return s;
  }

  /* Which fields a provider actually reports. The UI reads this to decide between showing a value,
     showing "—", and showing "not reported by this source" — three different statements that the
     old card collapsed into one blank. */
  var PROVIDER_FIELDS = {
    adsblol: { military: true, emergency: true, squawk: true, registration: true, type: true, category: true, route: false, schedule: false },
    airplaneslive: { military: true, emergency: true, squawk: true, registration: true, type: true, category: true, route: false, schedule: false },
    opensky: { military: false, emergency: false, squawk: true, registration: false, type: false, category: true, route: false, schedule: false },
  };
  function providerReports(provider, field) {
    var t = PROVIDER_FIELDS[provider];
    return !!(t && t[field]);
  }

  /* ── geometry: the tile lattice ───────────────────────────────────────────
     A triangular lattice of equal-radius circles. #R188 established this geometry for a single
     viewport (it covers 15 % more area per circle than a square grid at the same overlap); here it
     is applied to the whole globe as well, so a viewport read and a world read ask about the SAME
     circles and can share their answers.

     `latLimit` exists because above ~75° a fixed-radius circle spans most of a parallel while ADS-B
     receiver coverage is essentially absent — those tiles cost a request each and return nothing. */
  function latticeStepKm(radiusNm, margin) {
    return radiusNm * NM_KM * Math.sqrt(3) * (margin == null ? 0.96 : margin);
  }

  function buildLattice(radiusNm, latLimit, margin) {
    var stepKm = latticeStepKm(radiusNm, margin);
    var rowKm = stepKm * Math.sqrt(3) / 2;
    var lim = latLimit == null ? 75 : latLimit;
    var out = [];
    var rows = Math.ceil((2 * lim * 111.32) / rowKm);
    for (var r = 0; r <= rows; r++) {
      var lat = -lim + (r * rowKm) / 111.32;
      if (lat > lim) break;
      var cos = Math.max(0.08, Math.cos(lat * Math.PI / 180));
      var dLon = stepKm / (111.32 * cos);
      var offset = (r % 2) ? dLon / 2 : 0;
      for (var lon = -180 + offset; lon < 180; lon += dLon) {
        out.push({ lat: +lat.toFixed(3), lon: +lon.toFixed(3), miss: 0, last: 0 });
      }
    }
    return out;
  }

  /* The MIDDLE OF A MERCATOR VIEW, in degrees. ⚠ NOT the average of the two latitudes: Mercator
     stretches away from the equator, so a viewport whose bottom edge is 58° S and whose top edge is
     81° N is centred on 35.6° N, not on 11.6° N. Measured against the camera IntMap produced that
     box from: 35.58° here against getCenter().lat = 35.68°, i.e. the view's own centre. */
  function mercMidLat(s, n) {
    var R = Math.PI / 180;
    var cl = function (v) { return Math.max(-89.9999, Math.min(89.9999, v)); };
    var y = function (v) { return Math.log(Math.tan(Math.PI / 4 + cl(v) * R / 2)); };
    return (Math.atan(Math.exp((y(s) + y(n)) / 2)) * 2 - Math.PI / 2) / R;
  }

  /* Integer offsets from 0 within [lo, hi], NEAREST FIRST: 0, −1, +1, −2, +2, … Bounded by the
     range it is given, so a caller cannot spin on it. */
  function fanOut(lo, hi) {
    var out = [];
    if (!(lo <= hi)) return out;
    var far = Math.max(Math.abs(lo), Math.abs(hi));
    for (var k = 0; k <= far; k++) {
      if (k === 0) { if (lo <= 0 && 0 <= hi) out.push(0); continue; }
      if (-k >= lo && -k <= hi) out.push(-k);
      if (k >= lo && k <= hi) out.push(k);
    }
    return out;
  }

  /* ── (#R411) IS THIS LONGITUDE IN THE BOX? ───────────────────────────────────────────────────
     「より低ズームでもより多くの航空機が表示されるように。」 reported a second time. The tiles were
     already being chosen from the right sky — tilesForBbox works in an UNWRAPPED longitude space and
     wraps only the tile centre, which is why #R401's fix to it held. What threw the aircraft away
     was the test that decides which of them are IN the box, written as two ordered comparisons:

         if (e < w) { if (!(lo >= w || lo <= e)) continue; }   // crosses the antimeridian
         else if (lo < w || lo > e) continue;

     That reads a bounding box as an interval of real numbers, and MapLibre's getBounds() does not
     return one below about z4: it returns the span the camera actually covers, UNWRAPPED, so the
     east edge runs past +180 or the west edge past −180 and neither branch fits. `e < w` is false,
     so the antimeridian branch is skipped, and every aircraft whose own longitude is reported in
     [−180, 180] on the far side of the seam fails `lo < w`. Measured in the running application:

         view              bbox getBounds() returned            meridians the test kept
         world  z1         −180.0 …  180.0                            72 / 72
         Japan  z3           43.568 …  232.432                        28 / 72   ⚠
         N.Am.  z3         −197.494 …   −2.506                        35 / 72   ⚠
         Japan  z6          130.156 …  140.844                         2 / 72

     Half of a wide view was being discarded from a set the server already held — no upstream read
     would have fixed it. A longitude is not a real number and an east-west span is not an interval;
     both are angles, so the containment is one modulo and one comparison, and there is no
     antimeridian case because there is no case where the seam is special. A span of 360° or more
     covers the planet, which is what a view zoomed out past the whole world reports. */
  function lonInSpan(lon, w, e) {
    if (!(isFinite(lon) && isFinite(w) && isFinite(e))) return false;
    var span = e - w;
    if (!(span > 0)) span += 360;                     /* e ≤ w: the span crosses the antimeridian */
    if (span >= 360) return true;
    var d = ((((lon - w) % 360) + 360) % 360);        /* degrees east of the west edge, in [0,360) */
    return d <= span;
  }

  /* Tiles covering a bounding box, nearest-to-centre first, capped at `max`.
     ⚠ The longitude wrap is applied to the TILE CENTRE only, after stepping. Wrapping the loop
     bound instead is how a view straddling the antimeridian produces either zero tiles or a full
     circumnavigation — both of which this codebase has shipped before in other layers.

     ⚠ (#R401) THE CANDIDATES ARE GENERATED OUTWARD FROM THE CENTRE, and that is the whole point of
     this function rather than a refinement of it. #R341 walked rows from the SOUTH-WEST CORNER and
     stopped at `max × 8` candidates, then sorted them by distance from the centre — so for any view
     wider than about 40° the cap was reached on the FIRST ROW and the sort could only ever choose
     between tiles on the box's southern edge. Measured, `max = 4`:

         view                       centre        tiles it returned
         the whole world            0.0, 11.5     four at latitude −58    (the Southern Ocean)
         Europe at z2              10.0, 45.0     four at latitude  26    (the Sahara)
         Japan  at z3             139.5, 31.5     four at latitude  18    (the Philippine Sea)

     A cap that is applied before the selection makes the selection, which is the shape #R320 and
     #R388 both met (「黙って切った一覧は完全な一覧のふりをする」). Fanning out from the centre means
     the cap can only ever discard the FARTHEST candidates, which is what it was for. */
  function tilesForBbox(w, s, e, n, radiusNm, max, latLimit) {
    var stepKm = latticeStepKm(radiusNm);
    var rowKm = stepKm * Math.sqrt(3) / 2;
    var lim = latLimit == null ? 75 : latLimit;
    if (s > n) { var t = s; s = n; n = t; }
    if (e < w) e += 360;                                  /* the view crosses the antimeridian */
    /* the centre of the VIEW, taken before the latitude clamp so that clipping the poles off the
       top of a tall box does not drag the centre towards the equator with it */
    var cLon = (w + e) / 2;
    var cLat = mercMidLat(s, n);
    s = Math.max(-lim, s); n = Math.min(lim, n);
    cLat = Math.max(s, Math.min(n, cLat));
    var out = [];
    var cap = (max || 12) * 8;
    var dLat = rowKm / 111.32;
    var rows = fanOut(Math.ceil((s - dLat - cLat) / dLat), Math.floor((n + dLat - cLat) / dLat));
    /* Each row gets a share of the candidate budget rather than all of it, so a wide box cannot
       spend the whole list on the centre row and leave the sort a single horizontal line to choose
       from. √cap wide by √cap tall is a square neighbourhood around the centre. */
    var perRow = 2 * Math.max(1, Math.ceil(Math.sqrt(cap)) >> 1) + 1;
    for (var ri = 0; ri < rows.length && out.length < cap; ri++) {
      var la = Math.max(-lim, Math.min(lim, cLat + rows[ri] * dLat));
      var cos = Math.max(0.08, Math.cos(la * Math.PI / 180));
      var dLon = stepKm / (111.32 * cos);
      var cols = fanOut(Math.ceil((w - dLon - cLon) / dLon), Math.floor((e + dLon - cLon) / dLon));
      var take = Math.min(cols.length, perRow);
      for (var ci = 0; ci < take && out.length < cap; ci++) {
        var lon = cLon + cols[ci] * dLon;
        out.push({
          lat: +la.toFixed(3),
          lon: +(((lon + 540) % 360) - 180).toFixed(3),
          /* ⚠ the longitude term is scaled by cos(latitude): a degree of longitude at 60° is half a
             degree's worth of ground, and without it the sort prefers a tile four rows north over
             one two columns east even though the second is the nearer patch of sky. */
          d: (la - cLat) * (la - cLat) + (lon - cLon) * (lon - cLon) * cos * cos,
        });
      }
    }
    out.sort(function (a, b) { return a.d - b.d; });
    /* De-duplicate: near a pole successive rows collapse onto the same rounded centre. */
    var seen = Object.create(null);
    var uniq = [];
    for (var i = 0; i < out.length && uniq.length < (max || 12); i++) {
      var k = out[i].lat + '/' + out[i].lon;
      if (seen[k]) continue;
      seen[k] = 1;
      uniq.push({ lat: out[i].lat, lon: out[i].lon });
    }
    return uniq;
  }

  /* ── freshness ────────────────────────────────────────────────────────────
     Three named bands rather than a single boolean, because "live", "lagging" and "this is the last
     thing we ever heard" are three different things to tell a user, and §22.1 requires 0 aircraft
     and "could not fetch" to look different. */
  var FRESH_LIVE_S = 30;
  var FRESH_LAGGING_S = 120;
  function freshness(ageSec) {
    if (!(ageSec >= 0)) return 'unknown';
    if (ageSec <= FRESH_LIVE_S) return 'live';
    if (ageSec <= FRESH_LAGGING_S) return 'lagging';
    return 'stale';
  }

  /* ══ ⚠⚠⚠ (#R783) WHAT THE FEED CAN SAY ABOUT ITS OWN REACH, AND WHAT IT CANNOT ════════════════
     js/gis-sources.js can only reach `completeness:'all'` when a supplier states it, and a live
     ADS-B feed is the clearest case in the app of a supplier that must never state it. MEASURED
     against production (2026-09-17), four boxes asked of supabase/functions/aviation-feed
     `?ch=view&bbox=…`:

         bbox                       x-intmap-count   decoded, outside the box   x-intmap-coverage
         128,30,146,40  (Japan)            605              0                   lattice 856/980
         -10,40,10,55   (W. Europe)       2661              0                   lattice 856/980
         -125,30,-70,50 (USA)             6111              0                   lattice 856/980
         -180,-90,180,90 (world)         15116              0                   lattice 856/980

     Three facts come out of that, and each one is a different sentence:

       ① THE BOX IS EXECUTED. Not one record fell outside the box that was asked for, and Japan's
          answer and Europe's share no aircraft at all (measured: 0 in common). So a read can be
          asked for a WINDOW rather than for a camera, which is the whole of #R783's requirement —
          see IntMapAviation.acquire.
       ② THE ANSWER IS NOT THE WINDOW'S CONTENTS. `lattice 856/980` is the function's own count of
          how many of its 980 lattice tiles it has EVER asked the provider about; 124 of them had
          never been asked. Sky nobody has asked about holds aircraft nobody has been told about,
          so the answer is a part of the window whatever its count.
       ③ AND THE PARTS OF IT ARE NOT THE SAME AGE. `x-intmap-oldest-ms` was ~899,000 on every one of
          those reads: the oldest position in the box had been observed fifteen minutes earlier,
          because the feed keeps a record until STALE_DROP_S. One `asOf` for the answer would be a
          claim about 605 observations that only holds for the newest of them — so every feature
          carries its OWN observation time (featuresFromSnapshot below), and the answer carries
          when it was assembled.

     ⚠ THIS SECTION IS MIRRORED INTO THE EDGE FUNCTION like the rest of the file, and that is the
     point of putting it here: `coverageLine()` in supabase/functions/aviation-feed/index.ts WRITES
     the sentence that readReach() READS, and a vocabulary with a writer in one file and a reader in
     another is [[intmap-two-readers-one-field-list]] waiting to happen. reachLine() is the writer's
     half, so the two cannot drift. */

  /* The one place the feed's address is derived. ⚠ NOT A SECOND OPINION ABOUT WHERE IT IS — the
     project ref lives in `window.SUPABASE_URL` and nowhere else (the same derivation eleven other
     modules make for their own function); what belongs to aviation is the FUNCTION NAME, and it was
     spelled out in js/data-layers.js where nothing else could reach it. Callers pass the base so
     this stays usable in the Worker and in Deno, neither of which has `window`. */
  var FEED_FUNCTION = 'aviation-feed';
  function feedUrl(base) {
    var b = String(base == null ? '' : base).replace(/\/+$/, '');
    return b ? (b + '/functions/v1/' + FEED_FUNCTION) : '';
  }

  /* The query the view channel takes, built from a BOX THAT WAS PASSED IN. ⚠ Three decimals because
     the server rounds the cache key to the half degree; more digits would only split the cache.
     null when the box cannot be read — 「読めなかった」 is not 「世界」 (js/gis-sources.js prepare()
     draws the same line for the same reason). */
  function bboxParam(box) {
    if (!box) return null;
    var w = +box.w, s = +box.s, e = +box.e, n = +box.n;
    if (!(isFinite(w) && isFinite(s) && isFinite(e) && isFinite(n))) return null;
    return '&bbox=' + [w, s, e, n].map(function (v) { return v.toFixed(3); }).join(',');
  }

  /* ── the reach sentence: one writer, one reader ───────────────────────────────────────────────
     `lattice <probed>/<tiles>` — how much of the global lattice this isolate has ever asked about.
     `provider-global` — the provider answers for the whole globe in one read (OpenSky /states/all).
     Anything else, including the empty string a cold response carries, is `unstated`. */
  function reachLine(kind, probed, tiles) {
    if (kind === 'provider-global') return 'provider-global';
    if (kind === 'lattice') return 'lattice ' + (probed | 0) + '/' + (tiles | 0);
    return '';
  }

  /* ⚠ `complete` IS THREE-VALUED AND IT IS NEVER true TODAY, and that is a measurement rather than a
     decision here. A shortfall (probed < tiles) is the feed stating that sky it has not asked about
     exists, so `false`. A fully probed lattice is NOT a statement of completeness: a tile that was
     asked about once is not a tile whose aircraft are currently held (they are dropped at
     STALE_DROP_S), so that reads `null` — 「述べていない」. `provider-global` is `null` for the same
     reason one level up: OpenSky publishes what its receivers heard and claims nothing about what
     flew. ⚠ A LATER FEED THAT DOES CLAIM IT WOULD SAY SO HERE, which is why nothing downstream
     writes the claim of its own accord (coverageFor below reads this and only this). */
  function readReach(line) {
    var s = String(line == null ? '' : line).trim();
    var out = { kind: 'unstated', probed: null, tiles: null, fraction: null, complete: null, stated: s };
    if (!s) return out;
    if (s === 'provider-global') { out.kind = 'provider-global'; return out; }
    var m = /^lattice\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
    if (!m) return out;
    var p = +m[1], t = +m[2];
    out.kind = 'lattice';
    out.probed = p;
    out.tiles = t;
    out.fraction = (t > 0) ? (p / t) : null;
    out.complete = (t > 0 && p < t) ? false : null;
    return out;
  }

  /* ── a decoded snapshot as GeoJSON, for the acquisition layer ─────────────────────────────────
     ⚠ THE FEATURE ID IS THE ICAO 24-BIT ADDRESS, which is the aircraft's own identifier and the same
     one the click path, the track ring and Atlas resolve to (#R82) — so two reads of the same box are
     comparable, and so a reader can join this answer to the detail card.
     ⚠ THE CODEC IS PASSED IN, WHOLE, AND NOT COPIED. The number→hex table and the per-record FLAG
     BITS are js/aviation-codec.js's — the file whose header says that a codec and a decoder
     disagreeing about one bit puts every aircraft in the world somewhere plausible and wrong. A
     second spelling of `AC_POS_VALID` here would be exactly that drift, so this asks the codec that
     decoded the message. It is a parameter because this file is mirrored into a bundle where the
     codec is a different module (scripts/sync-aviation.mjs).
     ⚠ RECORDS WITHOUT A POSITION ARE LEFT OUT, not placed at 0,0. AC_POS_VALID is clear for an
     aircraft heard from without a position fix; a feature at null island is a claim the wire did not
     make. `skippedNoPosition` in the return is what makes the difference visible rather than silent.
     ⚠ AND THE BOX IS APPLIED HERE TOO WHEN ONE IS GIVEN. Measured above, the server already answers
     the box — this is what keeps that a fact of the ANSWER rather than a promise that was trusted.
     lonInSpan is this file's own angle test (#R411), so the window means the same thing here as it
     does on the server. */
  function featuresFromSnapshot(msg, nowMs, codec, box) {
    var out = [], skipped = 0, dropped = 0, newest = null, oldest = null;
    if (!msg || !(msg.count >= 0) || !codec || typeof codec.numToHex !== 'function') {
      return { features: out, skippedNoPosition: 0, droppedOutsideBox: 0, newestObservedAt: null, oldestObservedAt: null };
    }
    var ident = Object.create(null);
    var idl = msg.identity || [];
    for (var k = 0; k < idl.length; k++) {
      var it = idl[k];
      if (it && it.hex) ident[String(it.hex).toLowerCase()] = it;
    }
    var now = (nowMs == null) ? Date.now() : +nowMs;
    for (var i = 0; i < msg.count; i++) {
      if (!(msg.flags[i] & codec.AC_POS_VALID)) { skipped++; continue; }
      var lon = msg.lon[i], lat = msg.lat[i];
      if (box && !(lat >= box.s && lat <= box.n && lonInSpan(lon, box.w, box.e))) { dropped++; continue; }
      var hex = codec.numToHex(msg.icao[i]);
      var id = ident[hex] || null;
      var ageSec = msg.age[i];
      var seen = now - ageSec * 1000;
      if (newest == null || seen > newest) newest = seen;
      if (oldest == null || seen < oldest) oldest = seen;
      var cat = msg.cat[i] | 0;
      out.push({
        type: 'Feature',
        /* the aircraft's own identifier, at the level a GeoJSON reader looks for one */
        id: hex,
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          hex: hex,
          callsign: (id && id.callsign) || '',
          registration: (id && id.registration) || '',
          type: (id && id.type) || '',
          operator: (id && id.operator) || '',
          /* null, not 0: AC_ALT_VALID clear means the wire carried no altitude (§2 of this file) */
          altFt: (msg.alt[i] === msg.alt[i]) ? msg.alt[i] : null,
          /* ⚠ THESE THREE HAVE NO VALIDITY BIT ON THE WIRE (js/aviation-codec.js writes them as
             plain integers), so a 0 here is 「the wire said 0」 and cannot be told apart from
             silence. Stating them as numbers is what the wire supports; a reader that needs the
             distinction asks IntMapAviation.detail(), which carries the provider's own nulls. */
          track: msg.track[i],
          gsKt: msg.gs[i],
          vrFpm: msg.vr[i],
          category: cat,
          categoryName: categoryName(cat),
          onGround: !!(msg.flags[i] & codec.AC_ON_GROUND),
          military: !!(msg.flags[i] & codec.AC_MILITARY),
          emergency: !!(msg.flags[i] & codec.AC_EMERGENCY),
          spi: !!(msg.flags[i] & codec.AC_SPI),
          /* ⚠ PER AIRCRAFT, BECAUSE THE ANSWER'S OWN TIME IS NOT THIS. Measured: one answer held
             positions spanning fifteen minutes (see ③ in the section header). */
          observedAt: new Date(seen).toISOString(),
          observedAgeSec: Math.round(ageSec * 10) / 10,
          freshness: freshness(ageSec),
        },
      });
    }
    return {
      features: out,
      skippedNoPosition: skipped,
      droppedOutsideBox: dropped,
      newestObservedAt: (newest == null) ? null : new Date(newest).toISOString(),
      oldestObservedAt: (oldest == null) ? null : new Date(oldest).toISOString(),
    };
  }

  /* ── the `coverage` an acquisition states about itself ────────────────────────────────────────
     js/gis-sources.js fromSupplier() takes exactly what only the supplier can know and runs it
     through its own coverageOf() — so this states FACTS and never a verdict (`completeness` is not
     writable from here, by design).
     ⚠ `complete` COMES FROM THE FEED'S OWN SENTENCE and is not written here: readReach above returns
     `true` only if a feed ever says so, and none does today, so this is `false` on every real answer
     — measured, never decided. ⚠ `resolution` carries the reach because that is what the reach is:
     how finely the window was covered. js/gis-sources.js puts it in the record unread, which is what
     lets a reader see 「856/980 の空から」 rather than only 「一部」. */
  function coverageFor(m) {
    var o = m || {};
    var r = o.reach || null;
    return {
      served: o.box ? { w: +o.box.w, s: +o.box.s, e: +o.box.e, n: +o.box.n } : null,
      count: (typeof o.count === 'number') ? o.count : null,
      /* when the ANSWER was assembled by the feed, not when its oldest position was observed */
      asOf: o.asOf == null ? null : String(o.asOf),
      resolution: r ? { kind: r.kind, probed: r.probed, tiles: r.tiles, fraction: r.fraction, stated: r.stated } : null,
      complete: !!(r && r.complete === true),
    };
  }

  /* The declaration this module makes about the holding behind acquire(). ⚠ `complete` IS NOT HERE
     AS A CONSTANT: it is the last reach the feed stated, so a feed that begins claiming completeness
     is believed and one that does not is not. `viewBound:false` is the #R783 change and it is a
     statement about THIS door — the renderer's aircraft source is still the camera's, which is what
     js/map-ui.js's row goes on saying for as long as that row speaks for the drawn layer. */
  function holdsFor(reach, asOf) {
    return {
      extent: { w: -180, s: -90, e: 180, n: 90 },
      complete: !!(reach && reach.complete === true),
      viewBound: false,
      live: true,
      asOf: asOf == null ? null : String(asOf),
      resolution: reach ? { kind: reach.kind, probed: reach.probed, tiles: reach.tiles, fraction: reach.fraction } : null,
    };
  }

  var API = {
    NM_KM: NM_KM, M_PER_FT: M_PER_FT, MS_TO_KT: MS_TO_KT, MS_TO_FPM: MS_TO_FPM,
    CATEGORY_NAMES: CATEGORY_NAMES,
    OSK_INDEX: OSK,
    PROVIDER_FIELDS: PROVIDER_FIELDS,
    FRESH_LIVE_S: FRESH_LIVE_S, FRESH_LAGGING_S: FRESH_LAGGING_S,
    categoryNum: categoryNum, categoryName: categoryName,
    isRotorcraft: isRotorcraft, isGlider: isGlider, isUAV: isUAV,
    isSurfaceVehicle: isSurfaceVehicle, isObstacle: isObstacle,
    blankState: blankState,
    normalizeAdsbLol: normalizeAdsbLol,
    normalizeOpenSky: normalizeOpenSky,
    providerReports: providerReports,
    latticeStepKm: latticeStepKm,
    buildLattice: buildLattice,
    tilesForBbox: tilesForBbox,
    lonInSpan: lonInSpan,
    freshness: freshness,
    /* (#R783) the acquisition half: where the feed is, how a window is asked for, what the feed
       says about its own reach, and how a decoded snapshot becomes rows a reader can analyse. */
    FEED_FUNCTION: FEED_FUNCTION,
    feedUrl: feedUrl,
    bboxParam: bboxParam,
    reachLine: reachLine,
    readReach: readReach,
    featuresFromSnapshot: featuresFromSnapshot,
    coverageFor: coverageFor,
    holdsFor: holdsFor,
  };

  if (typeof globalThis !== 'undefined') globalThis.IntMapAviationModel = API;
  else if (typeof window !== 'undefined') window.IntMapAviationModel = API;
})();
