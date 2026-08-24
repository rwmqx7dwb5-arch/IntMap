/* AUTO-GENERATED MIRROR — DO NOT EDIT.
   Source of truth: js/aviation-model.js.  Regenerate with:  node scripts/sync-aviation.mjs
   (scripts/static-checks.mjs fails the build if this copy drifts.) */
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
    freshness: freshness,
  };

  if (typeof globalThis !== 'undefined') globalThis.IntMapAviationModel = API;
  else if (typeof window !== 'undefined') window.IntMapAviationModel = API;
})();
